import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve, relative } from 'node:path';
import { jsonError } from '../errors';

const execAsync = promisify(exec);
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}

const ALLOWED_ROOTS = [
  process.env.HOME,
  '/tmp',
  '/home',
  process.cwd(),
].filter((root): root is string => typeof root === 'string');

async function validatePath(inputPath: string): Promise<string | null> {
  if (inputPath.includes('..')) {
    return null;
  }

  try {
    const resolvedPath = resolve(inputPath);
    const realPath = await realpath(resolvedPath);

    const isAllowed = ALLOWED_ROOTS.some((root) => {
      const resolvedRoot = resolve(root);
      return realPath === resolvedRoot || realPath.startsWith(resolvedRoot + '/');
    });

    return isAllowed ? realPath : null;
  } catch {
    return null;
  }
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

function parseBooleanFlag(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function registerFileRoutes(app: Hono) {
  app.get('/project/scripts', async (c) => {
    try {
      const projectPath = c.req.query('path');
      if (!projectPath) {
        return c.json({ error: 'path query parameter is required' }, 400);
      }
      const validatedPath = await validatePath(projectPath);
      if (!validatedPath) {
        return c.json({ error: 'Invalid or unauthorized path' }, 403);
      }
      const packageJsonPath = join(validatedPath, 'package.json');
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

  app.get('/project/icon', async (c) => {
    try {
      const projectPath = c.req.query('path');
      if (!projectPath) {
        return c.json({ error: 'path query parameter is required' }, 400);
      }
      const validatedPath = await validatePath(projectPath);
      if (!validatedPath) {
        return c.json({ error: 'Invalid or unauthorized path' }, 403);
      }

      // Use ripgrep to find icon files, respecting .gitignore
      // Prioritize: favicon > icon, and png/svg > ico
      const patterns = ['favicon.png', 'favicon.svg', 'favicon.ico', 'icon.png', 'icon.svg'];
      
      for (const pattern of patterns) {
        try {
          const { stdout } = await execAsync(
            `rg --files --glob '**/${pattern}' --max-count=1 2>/dev/null | head -1`,
            { cwd: validatedPath, timeout: 3000 }
          );
          const relativePath = stdout.trim();
          if (relativePath) {
            const fullPath = join(validatedPath, relativePath);
            const iconStat = await stat(fullPath);
            if (iconStat.isFile() && iconStat.size < 500000) { // Max 500KB
              const content = await readFile(fullPath);
              const base64 = content.toString('base64');
              const ext = relativePath.split('.').pop() || 'png';
              const mimeType = ext === 'ico' ? 'image/x-icon' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
              return c.json({
                found: true,
                data: `data:${mimeType};base64,${base64}`,
                path: relativePath,
              });
            }
          }
        } catch {
          // Try next pattern
        }
      }

      return c.json({ found: false });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.get('/fs/list', async (c) => {
    try {
      const rawPath = c.req.query('path') || process.env.HOME || '/';
      const includeFiles = parseBooleanFlag(c.req.query('includeFiles'));
      const validatedPath = await validatePath(rawPath);
      if (!validatedPath) {
        return c.json({ error: 'Invalid or unauthorized path' }, 403);
      }
      const entries = await readdir(validatedPath, { withFileTypes: true });
      const items = await Promise.all(
        entries
          .filter((entry) => includeFiles || !entry.name.startsWith('.'))
          .map(async (entry) => {
            const fullPath = join(validatedPath, entry.name);
            const isDirectory = entry.isDirectory();
            let hasPackageJson = false;
            if (isDirectory) {
              try {
                await stat(join(fullPath, 'package.json'));
                hasPackageJson = true;
              } catch {}
            }
            const details = await stat(fullPath);
            return {
              name: entry.name,
              path: fullPath,
              isDirectory,
              hasPackageJson,
              size: details.size,
              mtimeMs: details.mtimeMs,
            };
          })
      );
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      return c.json({
        path: validatedPath,
        parent: validatedPath === '/' ? null : join(validatedPath, '..'),
        items: includeFiles ? items : items.filter((item) => item.isDirectory),
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.get('/fs/read', async (c) => {
    try {
      const rawPath = c.req.query('path');
      if (!rawPath) {
        return c.json({ error: 'path query parameter is required' }, 400);
      }
      const validatedPath = await validatePath(rawPath);
      if (!validatedPath) {
        return c.json({ error: 'Invalid or unauthorized path' }, 403);
      }

      const fileStats = await stat(validatedPath);
      if (!fileStats.isFile()) {
        return c.json({ error: 'Path is not a file' }, 400);
      }
      if (fileStats.size > MAX_TEXT_FILE_BYTES) {
        return c.json({ error: 'File too large to read in editor' }, 413);
      }

      const content = await readFile(validatedPath, 'utf-8');
      return c.json({
        path: validatedPath,
        name: basename(validatedPath),
        content,
        size: fileStats.size,
        mtimeMs: fileStats.mtimeMs,
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.get('/fs/stat', async (c) => {
    try {
      const rawPath = c.req.query('path');
      if (!rawPath) {
        return c.json({ error: 'path query parameter is required' }, 400);
      }
      const validatedPath = await validatePath(rawPath);
      if (!validatedPath) {
        return c.json({ error: 'Invalid or unauthorized path' }, 403);
      }

      const fileStats = await stat(validatedPath);
      return c.json({
        path: validatedPath,
        isDirectory: fileStats.isDirectory(),
        size: fileStats.size,
        mtimeMs: fileStats.mtimeMs,
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.post('/fs/write', async (c) => {
    try {
      const body = (await c.req.json()) as {
        path?: unknown;
        content?: unknown;
        expectedMtimeMs?: unknown;
      };
      if (typeof body.path !== 'string' || !body.path.trim()) {
        return c.json({ error: 'path is required' }, 400);
      }
      if (typeof body.content !== 'string') {
        return c.json({ error: 'content must be a string' }, 400);
      }

      const validatedPath = await validatePath(body.path);
      if (!validatedPath) {
        return c.json({ error: 'Invalid or unauthorized path' }, 403);
      }

      const currentStats = await stat(validatedPath);
      if (!currentStats.isFile()) {
        return c.json({ error: 'Path is not a file' }, 400);
      }

      const expectedMtimeMs = typeof body.expectedMtimeMs === 'number' ? body.expectedMtimeMs : undefined;
      if (expectedMtimeMs !== undefined && Number.isFinite(expectedMtimeMs)) {
        if (Math.abs(currentStats.mtimeMs - expectedMtimeMs) > 1) {
          return c.json(
            {
              error: 'File changed on disk',
              currentMtimeMs: currentStats.mtimeMs,
            },
            409
          );
        }
      }

      await writeFile(validatedPath, body.content, 'utf-8');
      const updatedStats = await stat(validatedPath);
      return c.json({
        ok: true,
        path: validatedPath,
        size: updatedStats.size,
        mtimeMs: updatedStats.mtimeMs,
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
