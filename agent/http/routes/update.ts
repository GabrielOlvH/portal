import type { Hono } from 'hono';
import { jsonError } from '../errors';

function getInstallDir(): string {
  return process.env.BRIDGE_INSTALL_DIR || `${process.env.HOME}/.bridge-agent`;
}

export function registerUpdateRoutes(app: Hono): void {
  app.get('/update/check', async (c) => {
    try {
      const { execSync } = await import('node:child_process');
      const installDir = getInstallDir();

      // Fetch latest
      execSync('git fetch origin main --quiet 2>/dev/null || git fetch origin master --quiet 2>/dev/null', {
        cwd: installDir,
        stdio: 'pipe',
      });

      // Compare commits
      const local = execSync('git rev-parse HEAD', { cwd: installDir, encoding: 'utf8' }).trim();
      // Use --verify to avoid outputting the input string when ref doesn't exist
      const remote = execSync('git rev-parse --verify origin/main 2>/dev/null || git rev-parse --verify origin/master', {
        cwd: installDir,
        encoding: 'utf8',
      }).trim();

      const updateAvailable = local !== remote;

      let changes: string[] = [];
      if (updateAvailable) {
        const diff = execSync(`git log --oneline ${local}..${remote}`, {
          cwd: installDir,
          encoding: 'utf8',
        }).trim();
        changes = diff.split('\n').filter(Boolean);
      }

      return c.json({
        updateAvailable,
        currentVersion: local.slice(0, 7),
        latestVersion: remote.slice(0, 7),
        changes,
      });
    } catch (err) {
      return jsonError(c, err, 500, { updateAvailable: false });
    }
  });

  app.post('/update/apply', async (c) => {
    try {
      const { spawn } = await import('node:child_process');
      const installDir = getInstallDir();
      const updateScript = `${installDir}/agent/update.sh`;

      // Run update script in background (it will restart the service)
      const child = spawn('bash', [updateScript, installDir], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      return c.json({ success: true, message: 'Update started. Service will restart.' });
    } catch (err) {
      return jsonError(c, err);
    }
  });
}

