import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveInstallDir, restartService, detectInitSystem } from './manager';
import { checkForUpdates, setUpdateAttempt, getCurrentVersion, type UpdateAttempt, type UpdateInfo } from './health';

const execFileAsync = promisify(execFile);

// Event emitter for SSE streaming
type ProgressCallback = (event: UpdateEvent) => void;

export interface UpdateEvent {
  type: 'start' | 'checking' | 'downloading' | 'installing' | 'testing' | 'restarting' | 'success' | 'rollback' | 'error' | 'complete';
  message: string;
  progress?: number;
  updateId: string;
  error?: string;
  newVersion?: string;
}

export interface UpdateResult {
  success: boolean;
  message: string;
  updateId: string;
  rolledBack: boolean;
  previousVersion?: string;
  newVersion?: string;
  error?: string;
}

interface UpdateContext {
  updateId: string;
  installDir: string;
  previousVersion: string;
  progressCallback: ProgressCallback;
}

const TEST_TIMEOUT_MS = 30000;
const HEALTH_CHECK_RETRIES = 5;
const HEALTH_CHECK_INTERVAL_MS = 2000;

let isUpdating = false;

export function isUpdateInProgress(): boolean {
  return isUpdating;
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

function sendProgress(context: UpdateContext, event: Omit<UpdateEvent, 'updateId'>): void {
  const fullEvent: UpdateEvent = { ...event, updateId: context.updateId };
  context.progressCallback(fullEvent);
}

export async function applyUpdate(progressCallback: ProgressCallback): Promise<UpdateResult> {
  if (isUpdating) {
    return {
      success: false,
      message: 'Update already in progress',
      updateId: '',
      rolledBack: false,
    };
  }

  isUpdating = true;
  const updateId = randomUUID();
  const installDir = resolveInstallDir();
  let previousVersion = 'unknown';
  let context: UpdateContext | null = null;

  try {
    previousVersion = await getCurrentVersion();

    context = {
      updateId,
      installDir,
      previousVersion,
      progressCallback,
    };

    sendProgress(context, {
      type: 'start',
      message: 'Starting update process',
      progress: 0,
    });

    // Set initial attempt status
    setUpdateAttempt({
      updateId,
      status: 'in_progress',
      timestamp: new Date(),
      fromVersion: previousVersion,
    });

    // Step 1: Check for updates
    sendProgress(context, {
      type: 'checking',
      message: 'Checking for updates',
      progress: 10,
    });

    const updateInfo = await checkForUpdates();
    if (!updateInfo) {
      throw new Error('Failed to check for updates');
    }

    if (!updateInfo.available) {
      sendProgress(context, {
        type: 'complete',
        message: 'Already up to date',
        progress: 100,
      });

      setUpdateAttempt({
        updateId,
        status: 'success',
        timestamp: new Date(),
        fromVersion: previousVersion,
        toVersion: previousVersion,
      });

      return {
        success: true,
        message: 'Already up to date',
        updateId,
        rolledBack: false,
        previousVersion,
        newVersion: previousVersion,
      };
    }

    // Step 2: Create backup tag
    const tagName = `pre-update-${Date.now()}`;
    await exec('git', ['tag', tagName], { cwd: installDir });

    // Backup node_modules if package.json will change
    const packageJsonPath = path.join(installDir, 'package.json');
    const nodeModulesBackup = path.join(installDir, 'node_modules.backup');
    const nodeModulesPath = path.join(installDir, 'node_modules');

    sendProgress(context, {
      type: 'downloading',
      message: `Downloading update (current: ${updateInfo.currentVersion}, new: ${updateInfo.latestVersion})`,
      progress: 20,
      newVersion: updateInfo.latestVersion,
    });

    // Step 3: Pull changes
    const branch = await determineBranch(installDir);
    await exec('git', ['pull', 'origin', branch], { cwd: installDir, timeout: 60000 });

    // Check if package.json changed
    const packageJsonChanged = await hasPackageJsonChanged(installDir, previousVersion);

    if (packageJsonChanged) {
      sendProgress(context, {
        type: 'downloading',
        message: 'Backing up dependencies',
        progress: 30,
      });

      // Backup node_modules
      if (existsSync(nodeModulesPath)) {
        try {
          // Rename is faster than copying
          renameSync(nodeModulesPath, nodeModulesBackup);
        } catch {
          // If rename fails, continue anyway
        }
      }

      sendProgress(context, {
        type: 'installing',
        message: 'Installing dependencies',
        progress: 40,
      });

      // Install dependencies
      await exec('npm', ['install'], { cwd: installDir, timeout: 120000 });
    } else {
      sendProgress(context, {
        type: 'installing',
        message: 'No dependency changes',
        progress: 50,
      });
    }

    sendProgress(context, {
      type: 'testing',
      message: 'Testing new version',
      progress: 60,
    });

    // Step 4: Test the new version
    const testPassed = await testNewVersion(installDir);

    if (!testPassed) {
      throw new Error('New version failed health check');
    }

    sendProgress(context, {
      type: 'restarting',
      message: 'Restarting service',
      progress: 80,
    });

    // Step 5: Restart service
    const restartResult = await restartService();
    if (!restartResult.success) {
      throw new Error(`Failed to restart service: ${restartResult.message}`);
    }

    // Clean up backup
    if (existsSync(nodeModulesBackup)) {
      // Remove backup after successful update
      try {
        const { rmSync } = await import('node:fs');
        rmSync(nodeModulesBackup, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    const newVersion = await getCurrentVersion();

    sendProgress(context, {
      type: 'success',
      message: 'Update completed successfully',
      progress: 100,
      newVersion,
    });

    setUpdateAttempt({
      updateId,
      status: 'success',
      timestamp: new Date(),
      fromVersion: previousVersion,
      toVersion: newVersion,
    });

    sendProgress(context, {
      type: 'complete',
      message: 'Update complete',
      progress: 100,
      newVersion,
    });

    return {
      success: true,
      message: 'Update completed successfully',
      updateId,
      rolledBack: false,
      previousVersion,
      newVersion,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('Update failed:', errorMessage);

    // Rollback
    if (context) {
      sendProgress(context, {
        type: 'rollback',
        message: 'Update failed, rolling back',
        error: errorMessage,
      });
    }

    try {
      await rollbackUpdate(installDir, previousVersion);

      const rolledBackVersion = await getCurrentVersion();

      setUpdateAttempt({
        updateId,
        status: 'rollback',
        timestamp: new Date(),
        fromVersion: previousVersion,
        error: errorMessage,
        rolledBackTo: rolledBackVersion,
      });

      if (context) {
        sendProgress(context, {
          type: 'complete',
          message: 'Rolled back to previous version',
          error: errorMessage,
        });
      }

      return {
        success: false,
        message: `Update failed and was rolled back: ${errorMessage}`,
        updateId,
        rolledBack: true,
        previousVersion,
        error: errorMessage,
      };
    } catch (rollbackError) {
      const rollbackErrorMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);

      setUpdateAttempt({
        updateId,
        status: 'failed',
        timestamp: new Date(),
        fromVersion: previousVersion,
        error: `Update failed and rollback also failed: ${rollbackErrorMessage}`,
      });

      if (context) {
        sendProgress(context, {
          type: 'error',
          message: 'Update failed and rollback failed - manual intervention required',
          error: rollbackErrorMessage,
        });
      }

      return {
        success: false,
        message: `Update failed and rollback also failed: ${rollbackErrorMessage}`,
        updateId,
        rolledBack: false,
        error: rollbackErrorMessage,
      };
    }
  } finally {
    isUpdating = false;
  }
}

async function determineBranch(installDir: string): Promise<string> {
  // Check if main exists on origin
  const { exitCode: mainExit } = await exec('git', ['ls-remote', '--heads', 'origin', 'main'], {
    cwd: installDir,
    ignoreError: true,
  });

  if (mainExit === 0) return 'main';

  // Check if master exists
  const { exitCode: masterExit } = await exec('git', ['ls-remote', '--heads', 'origin', 'master'], {
    cwd: installDir,
    ignoreError: true,
  });

  if (masterExit === 0) return 'master';

  throw new Error('Could not determine git branch (main or master not found)');
}

async function hasPackageJsonChanged(installDir: string, previousVersion: string): Promise<boolean> {
  try {
    const { stdout } = await exec(
      'git',
      ['diff', '--name-only', previousVersion, 'HEAD'],
      { cwd: installDir, ignoreError: true }
    );
    return stdout.split('\n').some((file) => file.includes('package.json') || file.includes('package-lock.json'));
  } catch {
    return true; // Assume changed if we can't determine
  }
}

async function testNewVersion(installDir: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Spawn a test instance
    const testEnv = { ...process.env, BRIDGE_AGENT_TEST_MODE: 'true' };

    const child = spawn('node', ['src/index.ts'], {
      cwd: installDir,
      env: testEnv,
      detached: true,
    });

    let testPassed = false;
    let attempts = 0;

    const checkHealth = async () => {
      if (attempts >= HEALTH_CHECK_RETRIES) {
        clearInterval(checkInterval);
        if (!testPassed) {
          try {
            child.kill('SIGTERM');
          } catch {
            // Ignore
          }
        }
        resolve(testPassed);
        return;
      }

      attempts++;

      try {
        // Try to connect to health endpoint
        const port = process.env.TMUX_AGENT_PORT || '4020';
        const http = await import('node:http');

        const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
          if (res.statusCode === 200) {
            testPassed = true;
            clearInterval(checkInterval);
            try {
              child.kill('SIGTERM');
            } catch {
              // Ignore
            }
            resolve(true);
          }
        });

        req.on('error', () => {
          // Connection failed, will retry
        });

        req.setTimeout(2000, () => {
          req.destroy();
        });
      } catch {
        // Ignore errors
      }
    };

    const checkInterval = setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS);

    // Start checking after a short delay to let the server start
    setTimeout(checkHealth, 2000);

    // Timeout the entire test
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!testPassed) {
        try {
          child.kill('SIGTERM');
        } catch {
          // Ignore
        }
        resolve(false);
      }
    }, TEST_TIMEOUT_MS);

    child.on('exit', (code) => {
      if (code !== 0 && !testPassed) {
        clearInterval(checkInterval);
        resolve(false);
      }
    });
  });
}

async function rollbackUpdate(installDir: string, previousVersion: string): Promise<void> {
  console.log('Rolling back to previous version...');

  // Reset git to previous version
  await exec('git', ['reset', '--hard', previousVersion], { cwd: installDir });

  // Restore node_modules from backup if exists
  const nodeModulesBackup = path.join(installDir, 'node_modules.backup');
  const nodeModulesPath = path.join(installDir, 'node_modules');

  if (existsSync(nodeModulesBackup)) {
    // Remove current node_modules
    if (existsSync(nodeModulesPath)) {
      const { rmSync } = await import('node:fs');
      rmSync(nodeModulesPath, { recursive: true, force: true });
    }
    // Restore backup
    renameSync(nodeModulesBackup, nodeModulesPath);
  } else {
    // Reinstall dependencies
    await exec('npm', ['install'], { cwd: installDir, timeout: 120000 });
  }

  // Restart the service
  const restartResult = await restartService();
  if (!restartResult.success) {
    throw new Error(`Failed to restart service after rollback: ${restartResult.message}`);
  }

  console.log('Rollback completed successfully');
}
