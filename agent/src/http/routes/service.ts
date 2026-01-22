import type { Hono } from 'hono';
import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { jsonError } from '../errors';

const execFileAsync = promisify(execFile);

const SERVICE_NAME = 'bridge-agent';
const LAUNCHD_LABEL = 'com.bridge.agent';
const WINDOWS_TASK_NAME = 'BridgeAgent';

type PlatformType = 'linux' | 'macos' | 'windows' | 'unknown';
type InitSystem = 'systemd' | 'openrc' | 'launchd' | 'task-scheduler' | 'manual';

interface ServiceStatus {
  status: 'running' | 'stopped' | 'unknown';
  pid: number;
  uptimeSeconds: number;
  platform: PlatformType;
  initSystem: InitSystem;
  autoRestart: boolean;
  version: string;
  installDir: string;
}

interface ServiceLogs {
  lines: string[];
  source: 'journald' | 'file' | 'eventlog';
}

interface ServiceInfo {
  installPath: string;
  gitVersion: string;
  platform: PlatformType;
  initSystem: InitSystem;
  nodeVersion: string;
  processId: number;
  processUptime: number;
}

const startTime = Date.now();

async function exec(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number; ignoreError?: boolean } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 10000,
      encoding: 'utf8',
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (error: unknown) {
    if (options.ignoreError) {
      const err = error as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: (err.stdout ?? '').trim(),
        stderr: (err.stderr ?? '').trim(),
        exitCode: err.code ?? 1,
      };
    }
    throw error;
  }
}

function detectPlatform(): PlatformType {
  const platform = os.platform();
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  if (platform === 'linux') return 'linux';
  return 'unknown';
}

async function detectInitSystem(): Promise<InitSystem> {
  const platform = os.platform();

  if (platform === 'darwin') {
    return 'launchd';
  }

  if (platform === 'win32') {
    return 'task-scheduler';
  }

  // Linux: check for systemd
  if (existsSync('/run/systemd/system')) {
    return 'systemd';
  }

  // Check for OpenRC
  if (existsSync('/sbin/openrc-run') || existsSync('/sbin/rc-service')) {
    return 'openrc';
  }

  return 'manual';
}

function resolveInstallDir(): string {
  const candidates = [
    process.env.BRIDGE_INSTALL_DIR,
    path.resolve(process.cwd(), '..'),
    process.env.HOME ? path.join(process.env.HOME, '.bridge-agent') : undefined,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, '.git'))) {
      return candidate;
    }
  }

  return candidates[0] ?? process.cwd();
}

async function getGitVersion(installDir: string): Promise<string> {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: installDir,
      ignoreError: true,
    });
    return stdout || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function getSystemdStatus(): Promise<{ running: boolean; pid: number; autoRestart: boolean }> {
  // Try user service first
  const { stdout: userStatus, exitCode: userExit } = await exec(
    'systemctl',
    ['--user', 'show', SERVICE_NAME, '--property=ActiveState,MainPID,Restart'],
    { ignoreError: true }
  );

  if (userExit === 0 && userStatus.includes('ActiveState=active')) {
    const pidMatch = userStatus.match(/MainPID=(\d+)/);
    const restartMatch = userStatus.match(/Restart=(\w+)/);
    return {
      running: true,
      pid: pidMatch ? parseInt(pidMatch[1], 10) : 0,
      autoRestart: restartMatch ? restartMatch[1] !== 'no' : false,
    };
  }

  // Try system service
  const { stdout: sysStatus, exitCode: sysExit } = await exec(
    'systemctl',
    ['show', SERVICE_NAME, '--property=ActiveState,MainPID,Restart'],
    { ignoreError: true }
  );

  if (sysExit === 0 && sysStatus.includes('ActiveState=active')) {
    const pidMatch = sysStatus.match(/MainPID=(\d+)/);
    const restartMatch = sysStatus.match(/Restart=(\w+)/);
    return {
      running: true,
      pid: pidMatch ? parseInt(pidMatch[1], 10) : 0,
      autoRestart: restartMatch ? restartMatch[1] !== 'no' : false,
    };
  }

  return { running: false, pid: 0, autoRestart: false };
}

async function getOpenRCStatus(): Promise<{ running: boolean; pid: number; autoRestart: boolean }> {
  const { stdout, exitCode } = await exec('rc-service', [SERVICE_NAME, 'status'], { ignoreError: true });
  const running = exitCode === 0 && stdout.toLowerCase().includes('started');

  let pid = 0;
  const pidFile = `/run/${SERVICE_NAME}.pid`;
  if (existsSync(pidFile)) {
    try {
      pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
    } catch {
      // Ignore
    }
  }

  // Check if in default runlevel
  const { exitCode: rcUpdateExit } = await exec('rc-update', ['show', 'default'], { ignoreError: true });
  const autoRestart = rcUpdateExit === 0;

  return { running, pid, autoRestart };
}

async function getLaunchdStatus(): Promise<{ running: boolean; pid: number; autoRestart: boolean }> {
  const { stdout, exitCode } = await exec('launchctl', ['list', LAUNCHD_LABEL], { ignoreError: true });
  if (exitCode !== 0) {
    return { running: false, pid: 0, autoRestart: false };
  }

  const pidMatch = stdout.match(/^\s*"PID"\s*=\s*(\d+)/m);
  const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;

  // Check KeepAlive in plist
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);
  let autoRestart = false;
  if (existsSync(plistPath)) {
    const plist = readFileSync(plistPath, 'utf8');
    autoRestart = plist.includes('<key>KeepAlive</key>') && plist.includes('<true/>');
  }

  return { running: pid > 0, pid, autoRestart };
}

async function getTaskSchedulerStatus(): Promise<{ running: boolean; pid: number; autoRestart: boolean }> {
  // Check if scheduled task exists
  const { stdout, exitCode } = await exec('schtasks', ['/query', '/tn', WINDOWS_TASK_NAME, '/fo', 'LIST'], {
    ignoreError: true,
  });

  if (exitCode !== 0) {
    return { running: false, pid: 0, autoRestart: false };
  }

  // Get PID from tasklist
  const { stdout: taskList } = await exec('tasklist', ['/fi', `IMAGENAME eq node.exe`, '/fo', 'CSV'], {
    ignoreError: true,
  });

  let pid = 0;
  const lines = taskList.split('\n');
  for (const line of lines) {
    if (line.includes('node.exe')) {
      const parts = line.split(',');
      if (parts.length > 1) {
        pid = parseInt(parts[1].replace(/"/g, ''), 10);
        break;
      }
    }
  }

  return {
    running: stdout.toLowerCase().includes('running'),
    pid,
    autoRestart: stdout.toLowerCase().includes('at logon') || stdout.toLowerCase().includes('at startup'),
  };
}

async function getManualStatus(): Promise<{ running: boolean; pid: number; autoRestart: boolean }> {
  const pidFile = path.join(os.tmpdir(), `${SERVICE_NAME}.pid`);
  if (!existsSync(pidFile)) {
    // We're currently running, so return current process info
    return { running: true, pid: process.pid, autoRestart: false };
  }

  try {
    const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
    // Check if process is running
    try {
      process.kill(pid, 0);
      return { running: true, pid, autoRestart: false };
    } catch {
      return { running: false, pid: 0, autoRestart: false };
    }
  } catch {
    return { running: true, pid: process.pid, autoRestart: false };
  }
}

async function getServiceStatus(): Promise<ServiceStatus> {
  const platform = detectPlatform();
  const initSystem = await detectInitSystem();
  const installDir = resolveInstallDir();
  const version = await getGitVersion(installDir);

  let statusInfo: { running: boolean; pid: number; autoRestart: boolean };

  switch (initSystem) {
    case 'systemd':
      statusInfo = await getSystemdStatus();
      break;
    case 'openrc':
      statusInfo = await getOpenRCStatus();
      break;
    case 'launchd':
      statusInfo = await getLaunchdStatus();
      break;
    case 'task-scheduler':
      statusInfo = await getTaskSchedulerStatus();
      break;
    default:
      statusInfo = await getManualStatus();
  }

  // Calculate uptime
  const uptimeSeconds = statusInfo.running ? Math.floor((Date.now() - startTime) / 1000) : 0;

  return {
    status: statusInfo.running ? 'running' : 'stopped',
    pid: statusInfo.pid || process.pid,
    uptimeSeconds,
    platform,
    initSystem,
    autoRestart: statusInfo.autoRestart,
    version,
    installDir,
  };
}

async function getSystemdLogs(lines: number): Promise<ServiceLogs> {
  // Try user service first
  const { stdout: userLogs, exitCode: userExit } = await exec(
    'journalctl',
    ['--user', '-u', SERVICE_NAME, '-n', String(lines), '--no-pager', '-o', 'short'],
    { ignoreError: true, timeout: 5000 }
  );

  if (userExit === 0 && userLogs) {
    return {
      lines: userLogs.split('\n').filter(Boolean),
      source: 'journald',
    };
  }

  // Try system service
  const { stdout: sysLogs } = await exec(
    'journalctl',
    ['-u', SERVICE_NAME, '-n', String(lines), '--no-pager', '-o', 'short'],
    { ignoreError: true, timeout: 5000 }
  );

  return {
    lines: sysLogs.split('\n').filter(Boolean),
    source: 'journald',
  };
}

async function getOpenRCLogs(lines: number): Promise<ServiceLogs> {
  const logFile = `/var/log/${SERVICE_NAME}.log`;
  if (existsSync(logFile)) {
    const { stdout } = await exec('tail', ['-n', String(lines), logFile], { ignoreError: true });
    return {
      lines: stdout.split('\n').filter(Boolean),
      source: 'file',
    };
  }

  // Fallback to syslog
  const { stdout: syslog } = await exec('tail', ['-n', String(lines), '/var/log/messages'], { ignoreError: true });
  return {
    lines: syslog.split('\n').filter((l) => l.includes(SERVICE_NAME)),
    source: 'file',
  };
}

async function getLaunchdLogs(lines: number): Promise<ServiceLogs> {
  const logDir = path.join(os.homedir(), 'Library', 'Logs', 'bridge-agent');
  const logFile = path.join(logDir, 'bridge-agent.log');

  if (existsSync(logFile)) {
    const { stdout } = await exec('tail', ['-n', String(lines), logFile], { ignoreError: true });
    return {
      lines: stdout.split('\n').filter(Boolean),
      source: 'file',
    };
  }

  // Try system log
  const { stdout: syslog } = await exec('log', ['show', '--predicate', `subsystem == "${LAUNCHD_LABEL}"`, '--last', '1h'], {
    ignoreError: true,
    timeout: 10000,
  });

  return {
    lines: syslog.split('\n').slice(-lines).filter(Boolean),
    source: 'file',
  };
}

async function getWindowsLogs(lines: number): Promise<ServiceLogs> {
  // Try Windows Event Log
  const { stdout } = await exec(
    'wevtutil',
    ['qe', 'Application', '/q:*[System[Provider[@Name="bridge-agent"]]]', `/c:${lines}`, '/f:text'],
    { ignoreError: true, timeout: 10000 }
  );

  if (stdout) {
    return {
      lines: stdout.split('\n').filter(Boolean),
      source: 'eventlog',
    };
  }

  // Fallback to log file in install dir
  const installDir = resolveInstallDir();
  const logFile = path.join(installDir, 'agent.log');
  if (existsSync(logFile)) {
    const content = readFileSync(logFile, 'utf8');
    const allLines = content.split('\n').filter(Boolean);
    return {
      lines: allLines.slice(-lines),
      source: 'file',
    };
  }

  return { lines: [], source: 'file' };
}

async function getServiceLogs(lines: number): Promise<ServiceLogs> {
  const initSystem = await detectInitSystem();

  switch (initSystem) {
    case 'systemd':
      return getSystemdLogs(lines);
    case 'openrc':
      return getOpenRCLogs(lines);
    case 'launchd':
      return getLaunchdLogs(lines);
    case 'task-scheduler':
      return getWindowsLogs(lines);
    default:
      // Manual: try to read from stdout/stderr logs if captured
      const installDir = resolveInstallDir();
      const logFile = path.join(installDir, 'agent.log');
      if (existsSync(logFile)) {
        const content = readFileSync(logFile, 'utf8');
        const allLines = content.split('\n').filter(Boolean);
        return {
          lines: allLines.slice(-lines),
          source: 'file',
        };
      }
      return { lines: ['No logs available for manual service'], source: 'file' };
  }
}

async function restartService(): Promise<{ success: boolean; message: string }> {
  const initSystem = await detectInitSystem();
  const installDir = resolveInstallDir();

  try {
    // Prefer using the update script's restart logic
    const tsScript = path.join(installDir, 'agent', 'scripts', 'update.ts');
    if (existsSync(tsScript)) {
      // Import and call the update module's restart function
      // For now, we'll use direct commands as the update script is for full updates
    }

    switch (initSystem) {
      case 'systemd': {
        // Try user service first
        const { exitCode: userExit } = await exec(
          'systemctl',
          ['--user', 'is-active', '--quiet', SERVICE_NAME],
          { ignoreError: true }
        );
        if (userExit === 0 || userExit === 3) {
          await exec('systemctl', ['--user', 'restart', SERVICE_NAME]);
          return { success: true, message: 'Systemd user service restarted' };
        }
        await exec('systemctl', ['restart', SERVICE_NAME]);
        return { success: true, message: 'Systemd system service restarted' };
      }

      case 'openrc': {
        await exec('rc-service', [SERVICE_NAME, 'restart']);
        return { success: true, message: 'OpenRC service restarted' };
      }

      case 'launchd': {
        await exec('launchctl', ['stop', LAUNCHD_LABEL], { ignoreError: true });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await exec('launchctl', ['start', LAUNCHD_LABEL]);
        return { success: true, message: 'Launchd service restarted' };
      }

      case 'task-scheduler': {
        await exec('schtasks', ['/end', '/tn', WINDOWS_TASK_NAME], { ignoreError: true });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await exec('schtasks', ['/run', '/tn', WINDOWS_TASK_NAME]);
        return { success: true, message: 'Task Scheduler service restarted' };
      }

      default: {
        // Manual restart - this will kill the current process
        // The service manager (if any) should restart it
        return {
          success: false,
          message: 'Manual service cannot be restarted via API. Please restart manually.',
        };
      }
    }
  } catch (error) {
    const err = error as Error;
    return { success: false, message: `Restart failed: ${err.message}` };
  }
}

export function registerServiceRoutes(app: Hono) {
  app.get('/service/status', async (c) => {
    try {
      const status = await getServiceStatus();
      return c.json(status);
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.post('/service/restart', async (c) => {
    try {
      const result = await restartService();
      if (!result.success) {
        return c.json(result, 400);
      }
      return c.json(result);
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.get('/service/logs', async (c) => {
    try {
      const linesParam = c.req.query('lines');
      const lines = linesParam ? parseInt(linesParam, 10) : 100;

      if (isNaN(lines) || lines < 1 || lines > 10000) {
        return c.json({ error: 'lines must be between 1 and 10000' }, 400);
      }

      const logs = await getServiceLogs(lines);
      return c.json(logs);
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.get('/service/info', async (c) => {
    try {
      const platform = detectPlatform();
      const initSystem = await detectInitSystem();
      const installDir = resolveInstallDir();
      const gitVersion = await getGitVersion(installDir);

      const info: ServiceInfo = {
        installPath: installDir,
        gitVersion,
        platform,
        initSystem,
        nodeVersion: process.version,
        processId: process.pid,
        processUptime: process.uptime(),
      };

      return c.json(info);
    } catch (err) {
      return jsonError(c, err);
    }
  });
}
