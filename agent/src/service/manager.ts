import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from '../utils/exec';

export type PlatformType = 'linux' | 'macos' | 'windows' | 'unknown';
export type InitSystem = 'systemd-system' | 'launchd' | 'windows-service' | 'openrc' | 'manual';

export interface ServiceConfig {
  installDir: string;
  port: number;
  hostLabel: string;
  authToken: string;
  serviceUser?: string;
}

export interface ServiceStatus {
  running: boolean;
  pid: number;
  uptimeSeconds: number;
  autoRestart: boolean;
}

export interface ServiceInfo {
  platform: PlatformType;
  initSystem: InitSystem;
  installDir: string;
}

const SERVICE_NAME = 'bridge-agent';
const LAUNCHD_LABEL = 'com.bridge.agent';
const WINDOWS_SERVICE_NAME = 'BridgeAgent';

export function detectPlatform(): PlatformType {
  const platform = os.platform();
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  if (platform === 'linux') return 'linux';
  return 'unknown';
}

export async function detectInitSystem(): Promise<InitSystem> {
  const platform = detectPlatform();

  if (platform === 'macos') {
    return 'launchd';
  }

  if (platform === 'windows') {
    return 'windows-service';
  }

  // Linux: Check for systemd
  if (existsSync('/run/systemd/system') || existsSync('/usr/bin/systemctl')) {
    return 'systemd-system';
  }

  // Check for OpenRC
  if (existsSync('/sbin/openrc-run') || existsSync('/sbin/rc-service')) {
    return 'openrc';
  }

  return 'manual';
}

export function resolveInstallDir(): string {
  const candidates = [
    process.env.BRIDGE_INSTALL_DIR,
    process.env.BRIDGE_AGENT_INSTALL_DIR,
    '/opt/bridge-agent',
    '/Library/bridge-agent',
    'C:\\Program Files\\bridge-agent',
    path.resolve(process.cwd(), '..'),
    process.env.HOME ? path.join(process.env.HOME, '.bridge-agent') : undefined,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, '.git')) || existsSync(path.join(candidate, 'src', 'index.ts'))) {
      return candidate;
    }
  }

  return candidates[0] ?? process.cwd();
}

async function getSystemdStatus(): Promise<ServiceStatus> {
  // Try user service first
  const { stdout: userStdout, exitCode: userExit } = await exec(
    'systemctl',
    ['--user', 'show', SERVICE_NAME, '--property=ActiveState,MainPID,Restart,ExecMainStartTimestamp'],
    { ignoreError: true }
  );

  if (userExit === 0 && userStdout.includes('ActiveState=active')) {
    const pidMatch = userStdout.match(/MainPID=(\d+)/);
    const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
    const restartMatch = userStdout.match(/Restart=(\w+)/);
    const autoRestart = restartMatch ? restartMatch[1] !== 'no' : false;

    // Calculate uptime from start timestamp
    let uptimeSeconds = 0;
    const startTimeMatch = userStdout.match(/ExecMainStartTimestamp=(.+)/);
    if (startTimeMatch) {
      const startTime = new Date(startTimeMatch[1]).getTime();
      uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    }

    return { running: true, pid, uptimeSeconds, autoRestart };
  }

  // Fall back to system service
  const { stdout } = await exec(
    'systemctl',
    ['show', SERVICE_NAME, '--property=ActiveState,MainPID,Restart,ExecMainStartTimestamp'],
    { ignoreError: true }
  );

  const running = stdout.includes('ActiveState=active');
  const pidMatch = stdout.match(/MainPID=(\d+)/);
  const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
  const restartMatch = stdout.match(/Restart=(\w+)/);
  const autoRestart = restartMatch ? restartMatch[1] !== 'no' : false;

  // Calculate uptime from start timestamp
  let uptimeSeconds = 0;
  const startTimeMatch = stdout.match(/ExecMainStartTimestamp=(.+)/);
  if (startTimeMatch) {
    const startTime = new Date(startTimeMatch[1]).getTime();
    uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  }

  return { running, pid, uptimeSeconds, autoRestart };
}

async function getLaunchdStatus(): Promise<ServiceStatus> {
  const { stdout, exitCode } = await exec('launchctl', ['list', LAUNCHD_LABEL], { ignoreError: true });
  if (exitCode !== 0) {
    return { running: false, pid: 0, uptimeSeconds: 0, autoRestart: false };
  }

  const pidMatch = stdout.match(/^\s*"PID"\s*=\s*(\d+)/m);
  const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;

  // Check KeepAlive in plist
  const plistPath = path.join('/Library', 'LaunchDaemons', `${LAUNCHD_LABEL}.plist`);
  let autoRestart = false;
  if (existsSync(plistPath)) {
    const plist = readFileSync(plistPath, 'utf8');
    autoRestart = plist.includes('<key>KeepAlive</key>') && plist.includes('<true/>');
  }

  // Get uptime from PID if running
  let uptimeSeconds = 0;
  if (pid > 0) {
    try {
      const { stdout: psOutput } = await exec('ps', ['-p', String(pid), '-o', 'etime='], { ignoreError: true });
      // Parse elapsed time format
      uptimeSeconds = parseElapsedTime(psOutput.trim());
    } catch {
      // Ignore
    }
  }

  return { running: pid > 0, pid, uptimeSeconds, autoRestart };
}

async function getWindowsServiceStatus(): Promise<ServiceStatus> {
  // Check if service exists and is running
  const { stdout, exitCode } = await exec(
    'sc',
    ['query', WINDOWS_SERVICE_NAME],
    { ignoreError: true }
  );

  if (exitCode !== 0) {
    return { running: false, pid: 0, uptimeSeconds: 0, autoRestart: false };
  }

  const running = stdout.includes('RUNNING');
  const pidMatch = stdout.match(/PID\s*:\s*(\d+)/);
  const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;

  // Windows services typically auto-restart if configured
  return { running, pid, uptimeSeconds: 0, autoRestart: true };
}

async function getOpenRCStatus(): Promise<ServiceStatus> {
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
  const autoRestart = rcUpdateExit === 0 && (await exec('rc-update', ['show'], { ignoreError: true })).stdout.includes(SERVICE_NAME);

  return { running, pid, uptimeSeconds: 0, autoRestart };
}

async function getManualStatus(): Promise<ServiceStatus> {
  // Check if this process is the agent
  const pidFile = path.join(os.tmpdir(), `${SERVICE_NAME}.pid`);
  if (existsSync(pidFile)) {
    try {
      const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
      // Check if process is running
      try {
        process.kill(pid, 0);
        return { running: true, pid, uptimeSeconds: process.uptime(), autoRestart: false };
      } catch {
        return { running: false, pid: 0, uptimeSeconds: 0, autoRestart: false };
      }
    } catch {
      // Ignore
    }
  }

  // We're running but no PID file - assume we're the agent
  return { running: true, pid: process.pid, uptimeSeconds: process.uptime(), autoRestart: false };
}

function parseElapsedTime(etime: string): number {
  // Parse ps etime format: [[dd-]hh:]mm:ss
  const parts = etime.split(/[-:]/);
  if (parts.length === 1) return parseInt(parts[0], 10) ?? 0;
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  if (parts.length === 3) {
    if (etime.includes('-')) {
      // Has days
      const days = parseInt(parts[0], 10);
      const hours = parseInt(parts[1], 10);
      const mins = parseInt(parts[2], 10);
      return days * 86400 + hours * 3600 + mins * 60;
    } else {
      const hours = parseInt(parts[0], 10);
      const mins = parseInt(parts[1], 10);
      const secs = parseInt(parts[2], 10);
      return hours * 3600 + mins * 60 + secs;
    }
  }
  if (parts.length === 4) {
    const days = parseInt(parts[0], 10);
    const hours = parseInt(parts[1], 10);
    const mins = parseInt(parts[2], 10);
    const secs = parseInt(parts[3], 10);
    return days * 86400 + hours * 3600 + mins * 60 + secs;
  }
  return 0;
}

export async function getServiceStatus(): Promise<ServiceStatus> {
  const initSystem = await detectInitSystem();

  switch (initSystem) {
    case 'systemd-system':
      return getSystemdStatus();
    case 'launchd':
      return getLaunchdStatus();
    case 'windows-service':
      return getWindowsServiceStatus();
    case 'openrc':
      return getOpenRCStatus();
    default:
      return getManualStatus();
  }
}

export async function getServiceInfo(): Promise<ServiceInfo> {
  return {
    platform: detectPlatform(),
    initSystem: await detectInitSystem(),
    installDir: resolveInstallDir(),
  };
}

async function restartSystemd(): Promise<void> {
  // Try user service first
  const { exitCode: userExit } = await exec(
    'systemctl',
    ['--user', 'is-active', '--quiet', SERVICE_NAME],
    { ignoreError: true }
  );

  if (userExit === 0) {
    // User service is active, restart it
    await exec('systemctl', ['--user', 'restart', SERVICE_NAME]);
    return;
  } else if (userExit === 3) {
    // User service exists but is inactive, start it
    await exec('systemctl', ['--user', 'start', SERVICE_NAME]);
    return;
  }

  // Fall back to system service
  await exec('systemctl', ['daemon-reload'], { ignoreError: true });
  const { exitCode } = await exec('systemctl', ['is-active', '--quiet', SERVICE_NAME], { ignoreError: true });
  if (exitCode === 0) {
    await exec('systemctl', ['restart', SERVICE_NAME]);
  } else {
    await exec('systemctl', ['start', SERVICE_NAME]);
  }
}

async function restartLaunchd(): Promise<void> {
  await exec('launchctl', ['unload', `/Library/LaunchDaemons/${LAUNCHD_LABEL}.plist`], { ignoreError: true });
  await exec('launchctl', ['load', `/Library/LaunchDaemons/${LAUNCHD_LABEL}.plist`]);
}

async function restartWindowsService(): Promise<void> {
  await exec('sc', ['stop', WINDOWS_SERVICE_NAME], { ignoreError: true });
  // Wait for service to stop
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await exec('sc', ['start', WINDOWS_SERVICE_NAME]);
}

async function restartOpenRC(): Promise<void> {
  await exec('rc-service', [SERVICE_NAME, 'restart']);
}

async function restartManual(): Promise<void> {
  // For manual mode, we can't restart ourselves
  // The init system should handle this
  throw new Error('Manual service mode - cannot restart via API. Please restart manually.');
}

export async function restartService(): Promise<{ success: boolean; message: string }> {
  const initSystem = await detectInitSystem();

  try {
    switch (initSystem) {
      case 'systemd-system':
        await restartSystemd();
        return { success: true, message: 'Service restarted via systemd' };
      case 'launchd':
        await restartLaunchd();
        return { success: true, message: 'Service restarted via launchd' };
      case 'windows-service':
        await restartWindowsService();
        return { success: true, message: 'Service restarted via Windows Service Manager' };
      case 'openrc':
        await restartOpenRC();
        return { success: true, message: 'Service restarted via OpenRC' };
      default:
        await restartManual();
        return { success: false, message: 'Cannot restart manual service' };
    }
  } catch (error) {
    const err = error as Error;
    return { success: false, message: `Restart failed: ${err.message}` };
  }
}

async function getSystemdLogs(lines: number): Promise<string[]> {
  const { stdout } = await exec(
    'journalctl',
    ['-u', SERVICE_NAME, '-n', String(lines), '--no-pager', '-o', 'short'],
    { ignoreError: true, timeout: 10000 }
  );
  return stdout.split('\n').filter(Boolean);
}

async function getLaunchdLogs(lines: number): Promise<string[]> {
  // Try unified log first
  const { stdout } = await exec(
    'log',
    ['show', '--predicate', `process == "${SERVICE_NAME}"`, '--last', '1h', '--style', 'compact'],
    { ignoreError: true, timeout: 10000 }
  );

  const logLines = stdout.split('\n').filter(Boolean);
  return logLines.slice(-lines);
}

async function getWindowsLogs(lines: number): Promise<string[]> {
  // Try Windows Event Log
  const { stdout } = await exec(
    'wevtutil',
    ['qe', 'Application', '/q:*[System[Provider[@Name="bridge-agent"]]]', `/c:${lines}`, '/f:text'],
    { ignoreError: true, timeout: 10000 }
  );

  if (stdout) {
    return stdout.split('\n').filter(Boolean);
  }

  // Fallback to log file
  const installDir = resolveInstallDir();
  const logFile = path.join(installDir, 'logs', 'agent.log');
  if (existsSync(logFile)) {
    const content = readFileSync(logFile, 'utf8');
    const allLines = content.split('\n').filter(Boolean);
    return allLines.slice(-lines);
  }

  return [];
}

async function getOpenRCLogs(lines: number): Promise<string[]> {
  const logFile = `/var/log/${SERVICE_NAME}.log`;
  if (existsSync(logFile)) {
    const { stdout } = await exec('tail', ['-n', String(lines), logFile], { ignoreError: true });
    return stdout.split('\n').filter(Boolean);
  }

  // Fallback to syslog
  const { stdout: syslog } = await exec('grep', [SERVICE_NAME, '/var/log/syslog'], { ignoreError: true });
  return syslog.split('\n').filter(Boolean).slice(-lines);
}

async function getManualLogs(lines: number): Promise<string[]> {
  const installDir = resolveInstallDir();
  const logFile = path.join(installDir, 'logs', 'agent.log');
  if (existsSync(logFile)) {
    const content = readFileSync(logFile, 'utf8');
    const allLines = content.split('\n').filter(Boolean);
    return allLines.slice(-lines);
  }

  // Try temp log
  const tempLog = path.join(os.tmpdir(), 'bridge-agent.log');
  if (existsSync(tempLog)) {
    const content = readFileSync(tempLog, 'utf8');
    const allLines = content.split('\n').filter(Boolean);
    return allLines.slice(-lines);
  }

  return ['No logs available'];
}

export async function getServiceLogs(lines: number): Promise<string[]> {
  const initSystem = await detectInitSystem();

  switch (initSystem) {
    case 'systemd-system':
      return getSystemdLogs(lines);
    case 'launchd':
      return getLaunchdLogs(lines);
    case 'windows-service':
      return getWindowsLogs(lines);
    case 'openrc':
      return getOpenRCLogs(lines);
    default:
      return getManualLogs(lines);
  }
}


