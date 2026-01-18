import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { jsonError } from '../errors';

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}

function normalizeExtension(mimeType: string): string {
  const sanitized = mimeType.split(';')[0].trim();
  const ext = sanitized.includes('/') ? sanitized.split('/')[1] : '';
  const safeExt = ext.replace(/[^a-zA-Z0-9.+-]/g, '');
  return safeExt || 'bin';
}

function sanitizeFilename(filename: string | undefined, fallbackExt: string): string {
  const trimmed = filename?.trim() || '';
  const base = trimmed ? basename(trimmed) : '';
  if (base && base !== '.' && base !== '/') {
    return base;
  }
  return `${randomUUID()}.${fallbackExt}`;
}

export function registerFileRoutes(app: Hono): void {
  app.get('/project/scripts', async (c) => {
    try {
      const projectPath = c.req.query('path');
      if (!projectPath) {
        return c.json({ error: 'path query parameter is required' }, 400);
      }
      const packageJsonPath = join(projectPath, 'package.json');
      try {
        const content = await readFile(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        return c.json({
          hasPackageJson: true,
          scripts: pkg.scripts || {},
        });
      } catch (err) {
        if (isErrnoException(err) && err.code === 'ENOENT') {
          return c.json({ hasPackageJson: false, scripts: {} });
        }
        throw err;
      }
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.get('/fs/list', async (c) => {
    try {
      const dirPath = c.req.query('path') || process.env.HOME || '/';
      const entries = await readdir(dirPath, { withFileTypes: true });
      const items = await Promise.all(
        entries
          .filter((entry) => !entry.name.startsWith('.'))
          .map(async (entry) => {
            const fullPath = join(dirPath, entry.name);
            const isDirectory = entry.isDirectory();
            let hasPackageJson = false;
            if (isDirectory) {
              try {
                await stat(join(fullPath, 'package.json'));
                hasPackageJson = true;
              } catch {}
            }
            return {
              name: entry.name,
              path: fullPath,
              isDirectory,
              hasPackageJson,
            };
          })
      );
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      return c.json({
        path: dirPath,
        parent: dirPath === '/' ? null : join(dirPath, '..'),
        items: items.filter((item) => item.isDirectory),
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.post('/upload', async (c) => {
    try {
      const body = (await c.req.json()) as { data?: unknown; mimeType?: unknown; filename?: unknown };
      if (typeof body.data !== 'string' || typeof body.mimeType !== 'string') {
        return c.json({ error: 'data and mimeType required' }, 400);
      }

      const dir = '/tmp/ter-attachments';
      await mkdir(dir, { recursive: true });

      const ext = normalizeExtension(body.mimeType);
      const filename = sanitizeFilename(typeof body.filename === 'string' ? body.filename : undefined, ext);
      const filepath = join(dir, filename);

      const buffer = Buffer.from(body.data, 'base64');
      await writeFile(filepath, buffer);

      return c.json({ path: filepath });
    } catch (err) {
      return jsonError(c, err);
    }
  });
}

