import { spawn, type ChildProcess } from 'node:child_process';
import type { IncomingMessage, Server } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { TOKEN } from '../config';
import { pty } from '../pty';
import { runTmux } from '../tmux';
import { getLiveSnapshot, parseLiveConfig } from './live';

type TmuxInputPayload = {
  type: 'input';
  data: string;
};

type TmuxResizePayload = {
  type: 'resize';
  cols: number;
  rows: number;
};

type TmuxProbePayload = {
  type: 'probe';
  id: number;
};

type TmuxAckPayload = {
  type: 'ack';
  bytes: number;
};

type TmuxClientPayload = TmuxInputPayload | TmuxResizePayload | TmuxProbePayload | TmuxAckPayload;

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
    if (payload.type === 'probe') {
      const id = Number(payload.id);
      if (Number.isFinite(id)) {
        return { type: 'probe', id };
      }
    }
    if (payload.type === 'ack') {
      const bytes = Number(payload.bytes);
      if (Number.isFinite(bytes) && bytes >= 0) {
        return { type: 'ack', bytes };
      }
    }
  } catch {}
  return null;
}

function parseDimension(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function enableLowLatencySocket(ws: WebSocket) {
  const socket = (ws as unknown as { _socket?: { setNoDelay?: (noDelay: boolean) => void } })._socket;
  socket?.setNoDelay?.(true);
}

const FLOW_HIGH_WATERMARK = 128 * 1024;
const FLOW_LOW_WATERMARK = 64 * 1024;
const PROBE_START = '\u0001TERPROBE:';
const PROBE_END = '\u0002';

function attachPtyBridge(ws: WebSocket, term: ReturnType<typeof pty.spawn>, closeMessage: string) {
  let termClosed = false;
  let cleanedUp = false;
  let inFlightBytes = 0;
  let queuedBytes = 0;
  let queue: string[] = [];
  let isPaused = false;

  const termControls = term as unknown as { pause?: () => void; resume?: () => void };

  const maybePause = () => {
    if (isPaused) return;
    if (typeof termControls.pause === 'function') {
      termControls.pause();
      isPaused = true;
    }
  };

  const maybeResume = () => {
    if (!isPaused) return;
    if (typeof termControls.resume === 'function') {
      termControls.resume();
      isPaused = false;
    }
  };

  const flushQueue = () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    while (queue.length > 0 && inFlightBytes <= FLOW_LOW_WATERMARK) {
      const chunk = queue.shift();
      if (!chunk) continue;
      queuedBytes -= chunk.length;
      ws.send(chunk);
      inFlightBytes += chunk.length;
    }
    if (queue.length === 0) {
      maybeResume();
    }
  };

  const sendOrQueue = (data: string) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (inFlightBytes >= FLOW_HIGH_WATERMARK) {
      queue.push(data);
      queuedBytes += data.length;
      maybePause();
      return;
    }
    ws.send(data);
    inFlightBytes += data.length;
  };

  const handleMessage = (data: RawData) => {
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
    if (payload?.type === 'probe') {
      if (ws.readyState === WebSocket.OPEN) {
        const response = `${PROBE_START}${JSON.stringify({ id: payload.id, serverTime: Date.now() })}${PROBE_END}`;
        ws.send(response);
      }
      return;
    }
    if (payload?.type === 'ack') {
      const bytes = payload.bytes;
      if (bytes <= 0) return;
      inFlightBytes = Math.max(0, inFlightBytes - bytes);
      flushQueue();
      return;
    }
    if (termClosed) return;
    term.write(text);
  };

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    termClosed = true;
    queue = [];
    queuedBytes = 0;
    inFlightBytes = 0;
    try {
      term.kill();
    } catch {}
    // ws typings are minimal; rely on socket close to release listeners.
  };

  term.onData((data) => {
    sendOrQueue(data);
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

export function attachWebSocketServers(server: Server) {
  const termWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const dockerWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const logsWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const eventsWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const wssByPath = new Map([
    ['/ws', termWss],
    ['/events', eventsWss],
    ['/docker/exec', dockerWss],
    ['/docker/logs', logsWss],
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

  termWss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    enableLowLatencySocket(ws);
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const session = url.searchParams.get('session');
    if (!session) {
      ws.close(1008, 'session required');
      return;
    }

    const cols = parseDimension(url.searchParams.get('cols'), 80);
    const rows = parseDimension(url.searchParams.get('rows'), 24);
    const createIfMissing = url.searchParams.get('create') === '1';

    // Check if session exists first (unless create flag is set)
    if (!createIfMissing) {
      try {
        await runTmux(['has-session', '-t', session]);
      } catch {
        ws.close(1008, 'session not found');
        return;
      }
    }

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
    enableLowLatencySocket(ws);
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

  logsWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    enableLowLatencySocket(ws);
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const container = url.searchParams.get('container');
    if (!container) {
      ws.close(1008, 'container required');
      return;
    }

    const follow = url.searchParams.get('follow') !== '0';
    const tail = url.searchParams.get('tail') || '100';
    const timestamps = url.searchParams.get('timestamps') === '1';

    const args = ['logs'];
    if (follow) args.push('-f');
    if (timestamps) args.push('-t');
    args.push('--tail', tail, container);

    let proc: ChildProcess | null = null;
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (proc) {
        proc.kill();
        proc = null;
      }
    };

    try {
      proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      ws.close(1011, err instanceof Error ? err.message : 'docker logs failed');
      return;
    }

    proc.stdout?.on('data', (data: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    proc.on('close', (code) => {
      cleanup();
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, code === 0 ? 'logs ended' : 'container stopped');
      }
    });

    proc.on('error', (err) => {
      cleanup();
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, err.message);
      }
    });

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  eventsWss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    enableLowLatencySocket(ws);
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const config = parseLiveConfig(url);
    let lastPayload = '';
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const sendSnapshot = async () => {
      try {
        const snapshot = await getLiveSnapshot(config);
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

  return { termWss, dockerWss, logsWss, eventsWss };
}

