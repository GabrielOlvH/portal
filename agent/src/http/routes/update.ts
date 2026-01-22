import type { Hono } from 'hono';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jsonError } from '../errors';

export function registerUpdateRoutes(app: Hono) {
  const resolveInstallDir = () => {
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
  };

  app.get('/update/check', async (c) => {
    try {
      const { execSync } = await import('node:child_process');
      const installDir = resolveInstallDir();

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
      const installDir = resolveInstallDir();
      const platform = os.platform();

      // Prefer TypeScript script (cross-platform)
      const tsScript = path.join(installDir, 'agent', 'scripts', 'update.ts');
      const bashScript = path.join(installDir, 'agent', 'update.sh');

      if (existsSync(tsScript)) {
        // Use npx tsx for cross-platform execution
        const tsxPath = path.join(installDir, 'agent', 'node_modules', '.bin', 'tsx');

        // Find executable: prefer local tsx, fall back to npx tsx
        const useLocalTsx = existsSync(tsxPath) || existsSync(tsxPath + '.cmd');
        const command = useLocalTsx ? tsxPath : 'npx';
        const args = useLocalTsx ? [tsScript, installDir] : ['tsx', tsScript, installDir];

        const child = spawn(command, args, {
          cwd: path.join(installDir, 'agent'),
          detached: true,
          stdio: 'ignore',
          shell: platform === 'win32', // Use shell on Windows for .cmd scripts
        });
        child.unref();

        return c.json({ success: true, message: 'Update started (TypeScript). Service will restart.' });
      }

      // Fall back to bash script (Linux/macOS only)
      if (platform === 'win32') {
        throw new Error('Bash update script not supported on Windows. TypeScript script required.');
      }

      if (!existsSync(bashScript)) {
        throw new Error(`No update script found at ${tsScript} or ${bashScript}`);
      }

      const child = spawn('bash', [bashScript, installDir], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      return c.json({ success: true, message: 'Update started (bash). Service will restart.' });
    } catch (err) {
      return jsonError(c, err);
    }
  });
}

