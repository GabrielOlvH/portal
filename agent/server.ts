import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { getSessionInsights } from './agents';
import { HOST_LABEL, PORT, TOKEN } from './config';
import { getDockerSnapshot, runDockerContainerAction } from './docker';
import { getHostInfo } from './host';
import { killProcesses, listPorts } from './ports';
import { pty } from './pty';
import { listSessions } from './sessions';
import { capturePane, getCursorInfo, parseSessions, requireName, runTmux, sessionTarget } from './tmux';
import { getUsageSnapshot } from './usage';

type CreateSessionBody = {
  name?: unknown;
  windowName?: unknown;
  command?: unknown;
};

type RenameSessionBody = {
  name?: unknown;
};

type SendKeysBody = {
  text?: unknown;
  keys?: unknown;
};

type ResizeSessionBody = {
  cols?: unknown;
  rows?: unknown;
};

type TmuxInputPayload = {
  type: 'input';
  data: string;
};

type TmuxResizePayload = {
  type: 'resize';
  cols: number;
  rows: number;
};

type TmuxClientPayload = TmuxInputPayload | TmuxResizePayload;

type SessionsOptions = {
  preview?: boolean;
  previewLines?: number;
  insights?: boolean;
};

type LiveConfig = {
  sessions: boolean;
  preview: boolean;
  previewLines: number;
  insights: boolean;
  host: boolean;
  docker: boolean;
  intervalMs: number;
};

function parseClientPayload(text: string): TmuxClientPayload | null {
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    if (payload.type === 'input' && typeof payload.data === 'string') {
      return { type: 'input', data: payload.data };
    }
    if (payload.type === 'resize') {
      const cols = Number(payload.cols);
      const rows = Number(payload.rows);
      if (Number.isFinite(cols) && Number.isFinite(rows)) {
        return { type: 'resize', cols, rows };
      }
    }
  } catch {}
  return null;
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}

async function fetchSessions(options: SessionsOptions = {}) {
  const preview = Boolean(options.preview);
  const lines = Number(options.previewLines || 6);
  const includeInsights = Boolean(options.insights);
  try {
    const raw = await listSessions();
    const sessions = parseSessions(raw);
    if (!preview && !includeInsights) return sessions;

    const usage = includeInsights ? await getUsageSnapshot() : null;
    const withPreview = await Promise.all(
      sessions.map(async (session) => {
        let previewLines: string[] | null = null;
        if (preview) {
          try {
            previewLines = await capturePane(session.name, lines);
          } catch {
            previewLines = [];
          }
        }

        let insights: Record<string, unknown> | null = null;
        if (usage) {
          const sessionInsights = await getSessionInsights(session.name, previewLines || undefined);
          const meta = sessionInsights.meta || usage.meta;
          insights = { ...usage, ...sessionInsights, meta };
        }

        if (!preview) {
          return { ...session, ...(insights ? { insights } : {}) };
        }

        return { ...session, preview: previewLines || [], ...(insights ? { insights } : {}) };
      })
    );
    return withPreview;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('no server running')) return [];
    throw err;
  }
}

function parseLiveConfig(url: URL): LiveConfig {
  const sessions = url.searchParams.get('sessions') === '1';
  const preview = url.searchParams.get('preview') === '1';
  const previewLines = Number(url.searchParams.get('previewLines') || '6');
  const insights = url.searchParams.get('insights') === '1';
  const host = url.searchParams.get('host') === '1';
  const docker = url.searchParams.get('docker') === '1';
  const intervalMs = Math.max(2000, Number(url.searchParams.get('interval') || '5000'));
  return {
    sessions,
    preview,
    previewLines: Number.isFinite(previewLines) ? previewLines : 6,
    insights,
    host,
    docker,
    intervalMs,
  };
}

async function buildLiveSnapshot(config: LiveConfig) {
  const snapshot: Record<string, unknown> = { type: 'snapshot', ts: Date.now() };
  if (config.sessions) {
    snapshot.sessions = await fetchSessions({
      preview: config.preview,
      previewLines: config.previewLines,
      insights: config.insights,
    });
  }
  if (config.host) {
    snapshot.host = getHostInfo();
  }
  if (config.docker) {
    snapshot.docker = await getDockerSnapshot();
  }
  return snapshot;
}

function buildApp() {
  const app = new Hono();

  app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));

  app.use('*', async (c, next) => {
    if (!TOKEN) return next();
    const header = c.req.header('authorization') || c.req.header('x-api-key') || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (token !== TOKEN) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return next();
  });

  app.get('/health', async (c) => {
    let tmuxVersion;
    try {
      tmuxVersion = await runTmux(['-V']);
    } catch {
      tmuxVersion = 'unknown';
    }
    return c.json({ ok: true, host: HOST_LABEL, tmuxVersion });
  });

  app.get('/host', (c) => {
    try {
      return c.json(getHostInfo());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  app.get('/docker', async (c) => {
    try {
      const snapshot = await getDockerSnapshot();
      return c.json(snapshot);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  app.post('/docker/containers/:id/:action', async (c) => {
    try {
      const id = c.req.param('id');
      const action = c.req.param('action');
      if (!id || !action) {
        return c.json({ error: 'container id and action are required' }, 400);
      }
      await runDockerContainerAction(id, action);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  app.get('/usage', async (c) => {
    try {
      const usage = await getUsageSnapshot();
      return c.json(usage);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

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
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
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
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  app.post('/upload', async (c) => {
    try {
      const body = await c.req.json<{ data: string; mimeType: string; filename?: string }>();
      if (!body.data || !body.mimeType) {
        return c.json({ error: 'data and mimeType required' }, 400);
      }

      const dir = '/tmp/ter-attachments';
      await mkdir(dir, { recursive: true });

      const ext = body.mimeType.split('/')[1] || 'bin';
      const filename = body.filename || `${randomUUID()}.${ext}`;
      const filepath = join(dir, filename);

      const buffer = Buffer.from(body.data, 'base64');
      await writeFile(filepath, buffer);

      return c.json({ path: filepath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // Port Manager endpoints
  app.get('/ports', async (c) => {
    try {
      const ports = await listPorts();
      return c.json({ ports });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  app.post('/ports/kill', async (c) => {
    try {
      const body = (await c.req.json()) as { pids?: unknown };
      if (!Array.isArray(body.pids) || body.pids.length === 0) {
        return c.json({ error: 'pids array is required' }, 400);
      }
      const pids = body.pids
        .map((p) => Number(p))
        .filter((p) => Number.isFinite(p) && p > 0);
      if (pids.length === 0) {
        return c.json({ error: 'No valid PIDs provided' }, 400);
      }
      const result = await killProcesses(pids);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  app.get('/sessions', async (c) => {
    try {
      const preview = c.req.query('preview') === '1';
      const lines = Number(c.req.query('lines') || '6');
      const includeInsights = c.req.query('insights') === '1';
      const sessions = await fetchSessions({
        preview,
        previewLines: Number.isFinite(lines) ? lines : 6,
        insights: includeInsights,
      });
      return c.json(sessions);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  app.post('/sessions', async (c) => {
    try {
      const body = (await c.req.json()) as CreateSessionBody;
      const name = requireName(body.name);
      const windowName = body.windowName && typeof body.windowName === 'string' ? body.windowName.trim() : undefined;
      const command = body.command && typeof body.command === 'string' ? body.command.trim() : undefined;
      const args = ['new-session', '-d', '-s', name];
      if (windowName) args.push('-n', windowName);
      if (command) args.push(command);
      await runTmux(args);
      await runTmux(['set-option', '-t', name, 'status', 'off']);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  app.post('/sessions/:name/rename', async (c) => {
    try {
      const oldName = requireName(c.req.param('name'));
      const body = (await c.req.json()) as RenameSessionBody;
      const newName = requireName(body.name);
      await runTmux(['rename-session', '-t', oldName, newName]);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  app.post('/sessions/:name/kill', async (c) => {
    try {
      const name = requireName(c.req.param('name'));
      await runTmux(['kill-session', '-t', name]);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  app.post('/sessions/:name/keys', async (c) => {
    try {
      const name = requireName(c.req.param('name'));
      const body = (await c.req.json()) as SendKeysBody;
      if (typeof body.text === 'string' && body.text.length > 0) {
        await runTmux(['send-keys', '-l', '-t', sessionTarget(name), body.text]);
        return c.json({ ok: true });
      }
      if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.some((key) => typeof key !== 'string')) {
        return c.json({ error: 'Keys or text are required' }, 400);
      }
      await runTmux(['send-keys', '-t', sessionTarget(name), ...body.keys]);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  app.post('/sessions/:name/resize', async (c) => {
    try {
      const name = requireName(c.req.param('name'));
      const body = (await c.req.json()) as ResizeSessionBody;
      const cols = Number(body.cols);
      const rows = Number(body.rows);
      if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
        return c.json({ error: 'cols and rows are required' }, 400);
      }
      await runTmux(['resize-window', '-t', sessionTarget(name), '-x', String(cols), '-y', String(rows)]);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  app.get('/sessions/:name/capture', async (c) => {
    try {
      const name = requireName(c.req.param('name'));
      const lines = Number(c.req.query('lines') || '60');
      const preview = await capturePane(name, lines);
      const includeCursor = c.req.query('cursor') === '1';
      if (!includeCursor) return c.json({ lines: preview });
      const cursor = await getCursorInfo(name);
      return c.json({ lines: preview, cursor });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  app.get('/sessions/:name/insights', async (c) => {
    try {
      const name = requireName(c.req.param('name'));
      const previewLines = await capturePane(name, 4);
      const insights = await getSessionInsights(name, previewLines);
      return c.json(insights);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  // Update management
  app.get('/update/check', async (c) => {
    try {
      const { execSync } = await import('node:child_process');
      const installDir = process.env.BRIDGE_INSTALL_DIR || `${process.env.HOME}/.bridge-agent`;

      // Fetch latest
      execSync('git fetch origin main --quiet 2>/dev/null || git fetch origin master --quiet 2>/dev/null', {
        cwd: installDir,
        stdio: 'pipe',
      });

      // Compare commits
      const local = execSync('git rev-parse HEAD', { cwd: installDir, encoding: 'utf8' }).trim();
      const remote = execSync('git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null', {
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
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message, updateAvailable: false }, 500);
    }
  });

  app.post('/update/apply', async (c) => {
    try {
      const { spawn } = await import('node:child_process');
      const installDir = process.env.BRIDGE_INSTALL_DIR || `${process.env.HOME}/.bridge-agent`;
      const updateScript = `${installDir}/agent/update.sh`;

      // Run update script in background (it will restart the service)
      const child = spawn('bash', [updateScript, installDir], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      return c.json({ success: true, message: 'Update started. Service will restart.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  return app;
}

export function startServer() {
  const app = buildApp();
  const server = serve({ fetch: app.fetch, port: PORT });
  const termWss = new WebSocketServer({ noServer: true });
  const dockerWss = new WebSocketServer({ noServer: true });
  const eventsWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      if (url.pathname !== '/ws' && url.pathname !== '/events' && url.pathname !== '/docker/exec') {
        socket.destroy();
        return;
      }
      if (TOKEN) {
        const token = url.searchParams.get('token') || '';
        if (token !== TOKEN) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
      }
      if (url.pathname === '/events') {
        eventsWss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          eventsWss.emit('connection', ws, req);
        });
        return;
      }
      if (url.pathname === '/docker/exec') {
        dockerWss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
          dockerWss.emit('connection', ws, req);
        });
        return;
      }
      termWss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        termWss.emit('connection', ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  termWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const session = url.searchParams.get('session');
    if (!session) {
      ws.close(1008, 'session required');
      return;
    }

    const cols = Number(url.searchParams.get('cols') || 80);
    const rows = Number(url.searchParams.get('rows') || 24);
    const term = pty.spawn(
      'tmux',
      ['new-session', '-A', '-s', session, '-x', String(cols), '-y', String(rows)],
      {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      }
    );
    let termClosed = false;
    runTmux(['set-option', '-t', session, 'status', 'off']).catch(() => {});

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    function handleMessage(data: RawData) {
      const text = data.toString();
      const payload = parseClientPayload(text);
      if (payload?.type === 'input') {
        if (termClosed) return;
        term.write(payload.data);
        return;
      }
      if (payload?.type === 'resize') {
        if (termClosed) return;
        term.resize(payload.cols, payload.rows);
        return;
      }
      if (termClosed) return;
      term.write(text);
    }

    term.onExit(() => {
      termClosed = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'session ended');
      }
    });

    ws.on('message', handleMessage);

    const cleanup = () => {
      termClosed = true;
      try {
        term.kill();
      } catch {}
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  dockerWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const container = url.searchParams.get('container');
    if (!container) {
      ws.close(1008, 'container required');
      return;
    }
    const cols = Number(url.searchParams.get('cols') || 80);
    const rows = Number(url.searchParams.get('rows') || 24);
    const shell = url.searchParams.get('shell') || 'sh';
    let term: ReturnType<typeof pty.spawn>;
    try {
      term = pty.spawn('docker', ['exec', '-it', container, shell], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      });
    } catch (err) {
      ws.close(1011, err instanceof Error ? err.message : 'docker exec failed');
      return;
    }
    let termClosed = false;

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    function handleMessage(data: RawData) {
      const text = data.toString();
      const payload = parseClientPayload(text);
      if (payload?.type === 'input') {
        if (termClosed) return;
        term.write(payload.data);
        return;
      }
      if (payload?.type === 'resize') {
        if (termClosed) return;
        term.resize(payload.cols, payload.rows);
        return;
      }
      if (termClosed) return;
      term.write(text);
    }

    term.onExit(() => {
      termClosed = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'exec ended');
      }
    });

    const cleanup = () => {
      termClosed = true;
      try {
        term.kill();
      } catch {}
    };

    ws.on('message', handleMessage);
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  eventsWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const config = parseLiveConfig(url);
    let lastPayload = '';
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const sendSnapshot = async () => {
      try {
        const snapshot = await buildLiveSnapshot(config);
        const payload = JSON.stringify(snapshot);
        if (payload !== lastPayload && ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
          lastPayload = payload;
        }
      } catch (err) {
        if (ws.readyState === WebSocket.OPEN) {
          const message = err instanceof Error ? err.message : String(err);
          ws.send(JSON.stringify({ type: 'error', message }));
        }
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        sendSnapshot();
      }, 200);
    };

    sendSnapshot();
    const interval = setInterval(sendSnapshot, config.intervalMs);

    ws.on('message', (data: RawData) => {
      const text = data.toString();
      try {
        const payload = JSON.parse(text) as { type?: string };
        if (payload.type === 'refresh' || payload.type === 'ping') {
          scheduleRefresh();
        }
      } catch {}
    });

    const cleanup = () => {
      clearInterval(interval);
      if (refreshTimer) clearTimeout(refreshTimer);
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  return server;
}
