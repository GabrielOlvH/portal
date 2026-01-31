import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

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

function getOSPlatform(): string {
  return os.platform();
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

async function exec(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number; ignoreError?: boolean } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 30000,
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

async function getSystemdStatus(): Promise<ServiceStatus> {
  const { stdout, exitCode } = await exec(
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
  if (parts.length === 1) return parseInt(parts[0], 10) || 0;
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

export async function installService(config: ServiceConfig): Promise<void> {
  const platform = detectPlatform();
  const initSystem = await detectInitSystem();

  // Ensure we're running as root for system services
  if (process.getuid && process.getuid() !== 0) {
    throw new Error('Installation requires root privileges. Please run with sudo.');
  }

  switch (initSystem) {
    case 'systemd-system':
      await installSystemd(config);
      break;
    case 'launchd':
      await installLaunchd(config);
      break;
    case 'windows-service':
      await installWindowsService(config);
      break;
    case 'openrc':
      await installOpenRC(config);
      break;
    default:
      throw new Error(`Automatic installation not supported for platform: ${platform}`);
  }
}

async function installSystemd(config: ServiceConfig): Promise<void> {
  const serviceUser = config.serviceUser || 'bridge-agent';

  // Create service user if it doesn't exist
  try {
    await exec('id', [serviceUser], { ignoreError: true });
  } catch {
    // User doesn't exist, create it
    await exec('useradd', ['-r', '-s', '/bin/false', '-d', config.installDir, serviceUser]);
  }

  // Create systemd service file
  const serviceContent = `[Unit]
Description=Bridge Agent - Terminal Management Server
Documentation=https://github.com/GabrielOlvH/bridge
After=network.target

[Service]
Type=simple
User=${serviceUser}
Group=${serviceUser}
WorkingDirectory=${config.installDir}
ExecStart=/usr/bin/node ${config.installDir}/src/index.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}
Environment=NODE_ENV=production
Environment=BRIDGE_AGENT_INSTALL_DIR=${config.installDir}
Environment=TMUX_AGENT_PORT=${config.port}
Environment=TMUX_AGENT_HOST=${config.hostLabel}
Environment=TMUX_AGENT_TOKEN=${config.authToken}

[Install]
WantedBy=multi-user.target
`;

  const servicePath = `/etc/systemd/system/${SERVICE_NAME}.service`;
  writeFileSync(servicePath, serviceContent, 'utf-8');

  // Set permissions
  await exec('chown', ['-R', `${serviceUser}:${serviceUser}`, config.installDir]);

  // Reload systemd and enable service
  await exec('systemctl', ['daemon-reload']);
  await exec('systemctl', ['enable', SERVICE_NAME]);
  await exec('systemctl', ['start', SERVICE_NAME]);
}

async function installLaunchd(config: ServiceConfig): Promise<void> {
  const serviceUser = config.serviceUser || 'bridge-agent';

  // Create service user if it doesn't exist
  try {
    await exec('id', [serviceUser], { ignoreError: true });
  } catch {
    await exec('sysadminctl', ['-addUser', serviceUser, '-shell', '/usr/bin/false']);
  }

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/node</string>
        <string>${config.installDir}/src/index.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${config.installDir}</string>
    <key>UserName</key>
    <string>${serviceUser}</string>
    <key>GroupName</key>
    <string>${serviceUser}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/${SERVICE_NAME}.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/${SERVICE_NAME}.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>BRIDGE_AGENT_INSTALL_DIR</key>
        <string>${config.installDir}</string>
        <key>TMUX_AGENT_PORT</key>
        <string>${config.port}</string>
        <key>TMUX_AGENT_HOST</key>
        <string>${config.hostLabel}</string>
        <key>TMUX_AGENT_TOKEN</key>
        <string>${config.authToken}</string>
    </dict>
</dict>
</plist>
`;

  const plistPath = `/Library/LaunchDaemons/${LAUNCHD_LABEL}.plist`;
  writeFileSync(plistPath, plistContent, 'utf-8');
  chmodSync(plistPath, 0o644);

  // Set ownership
  await exec('chown', ['-R', `${serviceUser}:${serviceUser}`, config.installDir]);

  // Load the service
  await exec('launchctl', ['load', plistPath]);
}

async function installWindowsService(config: ServiceConfig): Promise<void> {
  // Create service using nssm or direct sc command
  const nodePath = process.execPath;
  const serviceArgs = `${config.installDir}/src/index.ts`;

  // Delete existing service if present
  await exec('sc', ['delete', WINDOWS_SERVICE_NAME], { ignoreError: true });

  // Create new service
  await exec('sc', ['create', WINDOWS_SERVICE_NAME, 'binPath=', `${nodePath} ${serviceArgs}`, 'start=', 'auto', 'obj=', 'LocalSystem']);

  // Configure service to restart on failure
  await exec('sc', ['failure', WINDOWS_SERVICE_NAME, 'reset=', '0', 'actions=', 'restart/5000/restart/5000/restart/5000']);

  // Set environment variables in registry
  // This is simplified - real implementation would use registry edits

  // Start the service
  await exec('sc', ['start', WINDOWS_SERVICE_NAME]);
}

async function installOpenRC(config: ServiceConfig): Promise<void> {
  const serviceUser = config.serviceUser || 'bridge-agent';

  // Create service user if it doesn't exist
  try {
    await exec('id', [serviceUser], { ignoreError: true });
  } catch {
    await exec('adduser', ['-S', '-D', '-H', serviceUser]);
  }

  const initScript = `#!/sbin/openrc-run

name="${SERVICE_NAME}"
description="Bridge Agent - Terminal Management Server"
command="/usr/bin/node"
command_args="${config.installDir}/src/index.ts"
command_user="${serviceUser}"
command_background=true
pidfile="/run/\${RC_SVCNAME}.pid"
directory="${config.installDir}"
export BRIDGE_AGENT_INSTALL_DIR="${config.installDir}"
export TMUX_AGENT_PORT="${config.port}"
export TMUX_AGENT_HOST="${config.hostLabel}"
export TMUX_AGENT_TOKEN="${config.authToken}"
export NODE_ENV="production"

depend() {
    need net
    after firewall
}

start_pre() {
    checkpath -d -m 0755 -o "${serviceUser}:${serviceUser}" "${config.installDir}"
}
`;

  const initPath = `/etc/init.d/${SERVICE_NAME}`;
  writeFileSync(initPath, initScript, 'utf-8');
  chmodSync(initPath, 0o755);

  // Set ownership
  await exec('chown', ['-R', `${serviceUser}:${serviceUser}`, config.installDir]);

  // Enable and start
  await exec('rc-update', ['add', SERVICE_NAME, 'default']);
  await exec('rc-service', [SERVICE_NAME, 'start']);
}
