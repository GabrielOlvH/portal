import type { IncomingMessage, Server } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { TOKEN } from '../config';
import { pty } from '../pty';
import { runTmux } from '../tmux';
import { buildLiveSnapshot, parseLiveConfig } from './live';

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
type WebSocketServers = {
  termWss: WebSocketServer;
  dockerWss: WebSocketServer;
  eventsWss: WebSocketServer;
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

function parseDimension(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function attachPtyBridge(ws: WebSocket, term: ReturnType<typeof pty.spawn>, closeMessage: string): void {
  let termClosed = false;
  let cleanedUp = false;

  const handleMessage = (data: RawData) => {
    if (termClosed) return;
    const text = data.toString();
    const payload = parseClientPayload(text);
    if (payload?.type === 'input') {
      term.write(payload.data);
      return;
    }
    if (payload?.type === 'resize') {
      term.resize(payload.cols, payload.rows);
      return;
    }
    term.write(text);
  };

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    termClosed = true;
    try {
      term.kill();
    } catch {}
    // ws typings are minimal; rely on socket close to release listeners.
  };

  term.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });

  term.onExit(() => {
    termClosed = true;
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, closeMessage);
    }
    cleanup();
  });

  ws.on('message', handleMessage);
  ws.on('close', cleanup);
  ws.on('error', cleanup);
}

export function attachWebSocketServers(server: Server): WebSocketServers {
  const termWss = new WebSocketServer({ noServer: true });
  const dockerWss = new WebSocketServer({ noServer: true });
  const eventsWss = new WebSocketServer({ noServer: true });
  const wssByPath = new Map([
    ['/ws', termWss],
    ['/events', eventsWss],
    ['/docker/exec', dockerWss],
  ]);

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const wss = wssByPath.get(url.pathname);
      if (!wss) {
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
      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        wss.emit('connection', ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  termWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const session = url.searchParams.get('session');
    if (!session) {
      ws.close(1008, 'session required');
      return;
    }

    const cols = parseDimension(url.searchParams.get('cols'), 80);
    const rows = parseDimension(url.searchParams.get('rows'), 24);
    let term: ReturnType<typeof pty.spawn>;
    try {
      term = pty.spawn(
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
    } catch (err) {
      ws.close(1011, err instanceof Error ? err.message : 'tmux spawn failed');
      return;
    }

    runTmux(['set-option', '-t', session, 'status', 'off']).catch(() => {});
    attachPtyBridge(ws, term, 'session ended');
  });

  dockerWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const container = url.searchParams.get('container');
    if (!container) {
      ws.close(1008, 'container required');
      return;
    }
    const cols = parseDimension(url.searchParams.get('cols'), 80);
    const rows = parseDimension(url.searchParams.get('rows'), 24);
    const shellParam = url.searchParams.get('shell');
    const shell = shellParam && shellParam.trim().length > 0 ? shellParam.trim() : 'sh';
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
    attachPtyBridge(ws, term, 'exec ended');
  });

  eventsWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
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

  return { termWss, dockerWss, eventsWss };
}

