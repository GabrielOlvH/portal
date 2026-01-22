#!/usr/bin/env npx tsx
/**
 * Cross-platform Bridge Agent Update Script
 *
 * Replaces update.sh with a TypeScript implementation that works on:
 * - Linux (systemd, openrc)
 * - macOS (launchd)
 * - Windows (task-scheduler)
 */

import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

const LOG_PREFIX = '[bridge-update]';
const SERVICE_NAME = 'bridge-agent';

type InitSystem = 'systemd-user' | 'systemd-system' | 'openrc' | 'launchd' | 'task-scheduler' | 'manual';

interface UpdateResult {
  success: boolean;
  message: string;
  previousVersion?: string;
  newVersion?: string;
  changedFiles?: string[];
  error?: string;
}

function log(message: string): void {
  console.log(`${LOG_PREFIX} ${message}`);
}

function logError(message: string): void {
  console.error(`${LOG_PREFIX} ERROR: ${message}`);
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

async function detectInitSystem(): Promise<InitSystem> {
  const platform = os.platform();

  if (platform === 'darwin') {
    return 'launchd';
  }

  if (platform === 'win32') {
    return 'task-scheduler';
  }

  // Linux: try systemd first
  try {
    const { exitCode } = await exec('systemctl', ['--user', 'status'], { ignoreError: true, timeout: 5000 });
    if (exitCode === 0 || exitCode === 3) {
      return 'systemd-user';
    }
  } catch {
    // Ignored
  }

  try {
    const { exitCode } = await exec('systemctl', ['status'], { ignoreError: true, timeout: 5000 });
    if (exitCode === 0 || exitCode === 3) {
      return 'systemd-system';
    }
  } catch {
    // Ignored
  }

  // Try OpenRC
  try {
    await exec('which', ['rc-service'], { timeout: 5000 });
    return 'openrc';
  } catch {
    // Ignored
  }

  return 'manual';
}

async function restartSystemdUser(): Promise<void> {
  await exec('systemctl', ['--user', 'daemon-reload'], { ignoreError: true });
  const { exitCode } = await exec('systemctl', ['--user', 'is-active', '--quiet', SERVICE_NAME], { ignoreError: true });
  if (exitCode === 0) {
    await exec('systemctl', ['--user', 'restart', SERVICE_NAME]);
    log('Systemd user service restarted');
  } else {
    await exec('systemctl', ['--user', 'start', SERVICE_NAME]);
    log('Systemd user service started');
  }
}

async function restartSystemdSystem(): Promise<void> {
  await exec('systemctl', ['daemon-reload'], { ignoreError: true });
  const { exitCode } = await exec('systemctl', ['is-active', '--quiet', SERVICE_NAME], { ignoreError: true });
  if (exitCode === 0) {
    await exec('systemctl', ['restart', SERVICE_NAME]);
    log('Systemd system service restarted');
  } else {
    await exec('systemctl', ['start', SERVICE_NAME]);
    log('Systemd system service started');
  }
}

async function restartOpenRC(): Promise<void> {
  const initScript = `/etc/init.d/${SERVICE_NAME}`;
  if (!existsSync(initScript)) {
    log('OpenRC init script not found, falling back to manual restart');
    await restartManual();
    return;
  }

  const isRoot = os.userInfo().uid === 0;
  if (isRoot) {
    await exec('rc-service', [SERVICE_NAME, 'restart']);
    log('OpenRC service restarted');
    return;
  }

  // Try with sudo
  try {
    await exec('sudo', ['-n', 'rc-service', SERVICE_NAME, 'restart'], { ignoreError: false });
    log('OpenRC service restarted via sudo');
    return;
  } catch {
    log('No permission for OpenRC, falling back to manual restart');
    await restartManual();
  }
}

async function restartLaunchd(): Promise<void> {
  const uid = os.userInfo().uid;
  const plistName = 'com.bridge.agent';
  try {
    await exec('launchctl', ['kickstart', '-k', `gui/${uid}/${plistName}`]);
    log('launchd service restarted');
  } catch {
    log('launchd kickstart failed, falling back to manual restart');
    await restartManual();
  }
}

async function restartTaskScheduler(): Promise<void> {
  const taskName = 'BridgeAgent';
  try {
    await exec('schtasks', ['/end', '/tn', taskName], { ignoreError: true });
    await exec('schtasks', ['/run', '/tn', taskName]);
    log('Windows Task Scheduler task restarted');
  } catch {
    log('Task Scheduler restart failed, falling back to manual restart');
    await restartManual();
  }
}

async function restartManual(): Promise<void> {
  const pidFiles = [
    `/run/${SERVICE_NAME}.pid`,
    `/tmp/${SERVICE_NAME}.pid`,
    path.join(os.tmpdir(), `${SERVICE_NAME}.pid`),
  ];

  // Stop existing process if running
  for (const pidFile of pidFiles) {
    if (existsSync(pidFile)) {
      try {
        const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
        if (!isNaN(pid)) {
          process.kill(pid, 'SIGTERM');
          log(`Stopped existing process (PID: ${pid})`);
          await sleep(1000);
        }
      } catch {
        // Process might not exist
      }
      try {
        unlinkSync(pidFile);
      } catch {
        // Ignore
      }
    }
  }

  // Start new process
  const installDir = process.argv[2] || path.join(os.homedir(), '.bridge-agent');
  const agentDir = path.join(installDir, 'agent');

  if (!existsSync(agentDir)) {
    throw new Error(`Agent directory not found: ${agentDir}`);
  }

  // Find node executable
  const nodePath = process.execPath.includes('tsx') ? 'node' : process.execPath;

  // Load .env if exists
  const envFile = path.join(agentDir, '.env');
  const env = { ...process.env };
  if (existsSync(envFile)) {
    const envContent = readFileSync(envFile, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          env[key] = valueParts.join('=');
        }
      }
    }
  }

  const child = spawn(nodePath, ['node_modules/.bin/tsx', 'src/index.ts'], {
    cwd: agentDir,
    detached: true,
    stdio: 'ignore',
    env,
  });

  child.unref();

  const pidFile = path.join(os.tmpdir(), `${SERVICE_NAME}.pid`);
  writeFileSync(pidFile, String(child.pid));
  log(`Agent started manually (PID: ${child.pid})`);
}

async function restartService(initSystem: InitSystem): Promise<void> {
  switch (initSystem) {
    case 'systemd-user':
      await restartSystemdUser();
      break;
    case 'systemd-system':
      await restartSystemdSystem();
      break;
    case 'openrc':
      await restartOpenRC();
      break;
    case 'launchd':
      await restartLaunchd();
      break;
    case 'task-scheduler':
      await restartTaskScheduler();
      break;
    case 'manual':
    default:
      await restartManual();
      break;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function determineBranch(installDir: string): Promise<string> {
  // Try main first
  const { exitCode: mainExit } = await exec('git', ['fetch', 'origin', 'main', '--quiet'], {
    cwd: installDir,
    ignoreError: true,
  });
  if (mainExit === 0) return 'main';

  // Try master
  const { exitCode: masterExit } = await exec('git', ['fetch', 'origin', 'master', '--quiet'], {
    cwd: installDir,
    ignoreError: true,
  });
  if (masterExit === 0) return 'master';

  throw new Error('Failed to fetch from origin (main or master)');
}

async function getCurrentAndRemoteCommits(
  installDir: string,
  branch: string
): Promise<{ local: string; remote: string }> {
  const { stdout: local } = await exec('git', ['rev-parse', 'HEAD'], { cwd: installDir });
  const { stdout: remote } = await exec('git', ['rev-parse', `origin/${branch}`], { cwd: installDir });
  return { local, remote };
}

async function getChangedFiles(installDir: string, localCommit: string, remoteCommit: string): Promise<string[]> {
  const { stdout } = await exec('git', ['diff', '--name-only', localCommit, remoteCommit], { cwd: installDir });
  return stdout.split('\n').filter(Boolean);
}

async function hasLocalChanges(installDir: string): Promise<boolean> {
  const { exitCode: diffExit } = await exec('git', ['diff', '--quiet'], { cwd: installDir, ignoreError: true });
  const { exitCode: cachedExit } = await exec('git', ['diff', '--cached', '--quiet'], {
    cwd: installDir,
    ignoreError: true,
  });
  return diffExit !== 0 || cachedExit !== 0;
}

async function stashChanges(installDir: string): Promise<boolean> {
  if (!(await hasLocalChanges(installDir))) {
    return false;
  }

  log('Stashing local changes...');
  await exec('git', ['stash', 'push', '-m', 'auto-update stash'], { cwd: installDir });
  return true;
}

async function restoreStash(installDir: string): Promise<void> {
  log('Restoring local changes...');
  const { exitCode } = await exec('git', ['stash', 'pop'], { cwd: installDir, ignoreError: true });
  if (exitCode !== 0) {
    log('Warning: Could not restore local changes cleanly');
  }
}

async function pullChanges(installDir: string, branch: string): Promise<void> {
  await exec('git', ['pull', '--rebase', 'origin', branch], { cwd: installDir });
}

async function installDependencies(installDir: string, changedFiles: string[]): Promise<void> {
  const depsChanged = changedFiles.some(
    (f) => f.includes('package.json') || f.includes('package-lock.json') || f.includes('bun.lockb')
  );

  if (!depsChanged) {
    return;
  }

  log('Dependencies changed, running npm install...');
  const agentDir = path.join(installDir, 'agent');
  await exec('npm', ['install'], { cwd: agentDir, timeout: 120000 });
}

export async function update(installDir?: string): Promise<UpdateResult> {
  const dir = installDir || process.argv[2] || path.join(os.homedir(), '.bridge-agent');

  if (!existsSync(dir)) {
    return { success: false, message: 'Install directory not found', error: `Not found: ${dir}` };
  }

  if (!existsSync(path.join(dir, '.git'))) {
    return { success: false, message: 'Not a git repository', error: `No .git in ${dir}` };
  }

  try {
    log('Checking for updates...');
    const branch = await determineBranch(dir);
    const { local, remote } = await getCurrentAndRemoteCommits(dir, branch);

    if (local === remote) {
      log(`Already up to date (${local.slice(0, 7)})`);
      return { success: true, message: 'Already up to date', previousVersion: local.slice(0, 7) };
    }

    log(`Update available: ${local.slice(0, 7)} -> ${remote.slice(0, 7)}`);

    const changedFiles = await getChangedFiles(dir, local, remote);
    log('Changed files:');
    for (const file of changedFiles) {
      console.log(`  - ${file}`);
    }

    // Stash local changes
    const stashed = await stashChanges(dir);

    // Pull changes
    log('Pulling changes...');
    try {
      await pullChanges(dir, branch);
    } catch (pullError) {
      logError('Failed to pull changes. Manual intervention may be required.');
      if (stashed) {
        await restoreStash(dir);
      }
      throw pullError;
    }

    // Restore stash
    if (stashed) {
      await restoreStash(dir);
    }

    // Install dependencies if needed
    await installDependencies(dir, changedFiles);

    // Restart service
    log('Restarting service...');
    const initSystem = await detectInitSystem();
    log(`Detected init system: ${initSystem}`);
    await restartService(initSystem);

    log('Update complete!');

    return {
      success: true,
      message: 'Update complete',
      previousVersion: local.slice(0, 7),
      newVersion: remote.slice(0, 7),
      changedFiles,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(message);
    return { success: false, message: 'Update failed', error: message };
  }
}

// Run if executed directly
if (import.meta.url.startsWith('file:')) {
  const scriptPath = new URL(import.meta.url).pathname;
  const argv1 = process.argv[1];
  // Handle both direct tsx execution and node execution
  if (argv1 === scriptPath || argv1?.endsWith('/update.ts') || process.argv.some((a) => a.includes('update.ts'))) {
    update().then((result) => {
      process.exit(result.success ? 0 : 1);
    });
  }
}
