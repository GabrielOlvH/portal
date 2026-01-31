import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { detectPlatform, detectInitSystem, getServiceStatus, resolveInstallDir, type PlatformType, type InitSystem } from './manager';

const execFileAsync = promisify(execFile);

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  changes: string[];
  lastCheck: Date;
}

export interface UpdateAttempt {
  updateId: string;
  status: 'in_progress' | 'success' | 'failed' | 'rollback';
  timestamp: Date;
  fromVersion?: string;
  toVersion?: string;
  error?: string;
  rolledBackTo?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  platform: PlatformType;
  initSystem: InitSystem;
  nodeVersion: string;
  processId: number;
  lastUpdateCheck: Date;
  update: UpdateInfo;
  lastUpdateAttempt?: UpdateAttempt;
  system: {
    freeMemory: number;
    totalMemory: number;
    loadAvg: number[];
  };
}

// Global state for health monitoring
let lastHealthStatus: HealthStatus | null = null;
let lastUpdateInfo: UpdateInfo | null = null;
let lastUpdateAttempt: UpdateAttempt | null = null;
let consecutiveFailures = 0;
let healthCheckInterval: NodeJS.Timeout | null = null;
let updateCheckInterval: NodeJS.Timeout | null = null;

const UPDATE_CHECK_INTERVAL_MS = 60000; // 1 minute for testing
const HEALTH_CHECK_INTERVAL_MS = 60000; // 1 minute
const MAX_CONSECUTIVE_FAILURES = 3;

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

export async function getCurrentVersion(): Promise<string> {
  const installDir = resolveInstallDir();
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

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const installDir = resolveInstallDir();

  // Ensure it's a git repository
  if (!existsSync(path.join(installDir, '.git'))) {
    return null;
  }

  try {
    // Fetch from origin
    const { exitCode: fetchExit } = await exec('git', ['fetch', 'origin', 'main'], {
      cwd: installDir,
      ignoreError: true,
      timeout: 30000,
    });

    if (fetchExit !== 0) {
      // Try master branch
      await exec('git', ['fetch', 'origin', 'master'], {
        cwd: installDir,
        ignoreError: true,
        timeout: 30000,
      });
    }

    // Get current and remote versions
    const { stdout: currentVersion } = await exec('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: installDir,
      ignoreError: true,
    });

    // Try main first, then master
    let remoteVersion = '';
    let branch = 'main';
    try {
      const { stdout } = await exec('git', ['rev-parse', '--short', 'origin/main'], {
        cwd: installDir,
        ignoreError: true,
      });
      remoteVersion = stdout;
    } catch {
      const { stdout } = await exec('git', ['rev-parse', '--short', 'origin/master'], {
        cwd: installDir,
        ignoreError: true,
      });
      remoteVersion = stdout;
      branch = 'master';
    }

    const available = currentVersion !== remoteVersion && remoteVersion !== '';

    // Get change log if update available
    let changes: string[] = [];
    if (available) {
      const { stdout } = await exec(
        'git',
        ['log', '--oneline', `${currentVersion}..${remoteVersion}`],
        { cwd: installDir, ignoreError: true }
      );
      changes = stdout.split('\n').filter(Boolean);
    }

    const updateInfo: UpdateInfo = {
      available,
      currentVersion: currentVersion || 'unknown',
      latestVersion: remoteVersion || 'unknown',
      changes,
      lastCheck: new Date(),
    };

    lastUpdateInfo = updateInfo;
    return updateInfo;
  } catch (error) {
    console.error('Failed to check for updates:', error);
    return null;
  }
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const platform = detectPlatform();
  const initSystem = await detectInitSystem();
  const serviceStatus = await getServiceStatus();
  const version = await getCurrentVersion();
  const updateInfo = lastUpdateInfo || {
    available: false,
    currentVersion: version,
    latestVersion: version,
    changes: [],
    lastCheck: new Date(),
  };

  // Determine health status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (!serviceStatus.running) {
    status = 'unhealthy';
  } else if (consecutiveFailures > 0) {
    status = 'degraded';
  }

  // Get system stats
  const freeMemory = os.freemem();
  const totalMemory = os.totalmem();
  const loadAvg = os.loadavg();

  const healthStatus: HealthStatus = {
    status,
    version,
    uptime: serviceStatus.uptimeSeconds,
    platform,
    initSystem,
    nodeVersion: process.version,
    processId: serviceStatus.pid || process.pid,
    lastUpdateCheck: updateInfo.lastCheck,
    update: updateInfo,
    lastUpdateAttempt: lastUpdateAttempt || undefined,
    system: {
      freeMemory,
      totalMemory,
      loadAvg,
    },
  };

  lastHealthStatus = healthStatus;
  return healthStatus;
}

export function getCachedHealthStatus(): HealthStatus | null {
  return lastHealthStatus;
}

export function getCachedUpdateInfo(): UpdateInfo | null {
  return lastUpdateInfo;
}

export function setUpdateAttempt(attempt: UpdateAttempt): void {
  lastUpdateAttempt = attempt;
}

async function performHealthCheck(): Promise<void> {
  try {
    const healthStatus = await getHealthStatus();

    // Check if service is healthy
    if (healthStatus.status === 'unhealthy') {
      consecutiveFailures++;
      console.error(`Health check failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error('Max consecutive failures reached, triggering service restart...');
        // Import dynamically to avoid circular dependency
        const { restartService } = await import('./manager');
        const result = await restartService();
        if (result.success) {
          console.log('Service restarted successfully');
          consecutiveFailures = 0;
        } else {
          console.error('Failed to restart service:', result.message);
        }
      }
    } else {
      if (consecutiveFailures > 0) {
        console.log('Health check passed, resetting failure counter');
      }
      consecutiveFailures = 0;
    }
  } catch (error) {
    console.error('Health check error:', error);
    consecutiveFailures++;
  }
}

export function startHealthMonitoring(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
  }

  // Perform initial checks
  performHealthCheck();
  checkForUpdates();

  // Set up intervals
  healthCheckInterval = setInterval(() => {
    performHealthCheck();
  }, HEALTH_CHECK_INTERVAL_MS);

  updateCheckInterval = setInterval(() => {
    checkForUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);

  console.log(`Health monitoring started (check interval: ${HEALTH_CHECK_INTERVAL_MS}ms)`);
  console.log(`Update checking started (check interval: ${UPDATE_CHECK_INTERVAL_MS}ms)`);
}

export function stopHealthMonitoring(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
}

// Export interval constants for external use
export { UPDATE_CHECK_INTERVAL_MS, HEALTH_CHECK_INTERVAL_MS };
