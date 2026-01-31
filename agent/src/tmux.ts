import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SOCKET } from './config';

const execFileAsync = promisify(execFile);

// Check if we're running under systemd (to know if we need scope isolation)
let useSystemdScope: boolean | null = null;
async function shouldUseSystemdScope(): Promise<boolean> {
  if (useSystemdScope !== null) return useSystemdScope;
  try {
    // Check if systemd-run is available and we're in a user session
    await execFileAsync('systemd-run', ['--user', '--scope', '--', 'true'], { timeout: 2000 });
    useSystemdScope = true;
  } catch {
    useSystemdScope = false;
  }
  return useSystemdScope;
}

// Spawn tmux in its own systemd scope so it survives service restarts
export async function spawnTmuxSession(args: string[]): Promise<string> {
  const baseArgs = SOCKET ? ['-S', SOCKET] : [];
  const tmuxArgs = [...baseArgs, ...args];

  if (await shouldUseSystemdScope()) {
    const { stdout } = await execFileAsync(
      'systemd-run',
      ['--user', '--scope', '--', 'tmux', ...tmuxArgs],
      { timeout: 10000 }
    );
    return stdout.trim();
  }

  const { stdout } = await execFileAsync('tmux', tmuxArgs, { timeout: 5000 });
  return stdout.trim();
}

export type TmuxSessionInfo = {
  name: string;
  windows: number;
  attached: boolean;
  createdAt?: number;
  lastAttached?: number;
};

export type CursorInfo = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function runTmux(args: readonly string[]): Promise<string> {
  const baseArgs = SOCKET ? ['-S', SOCKET] : [];
  const { stdout } = await execFileAsync('tmux', [...baseArgs, ...args], { timeout: 5000 });
  return stdout.trim();
}

export function sessionTarget(name: string): string {
  if (!name) return '';
  return name.includes(':') ? name : `${name}:`;
}

export function parseSessions(raw: string): TmuxSessionInfo[] {
  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const [name, windows, createdAt, attached, lastAttached] = line.split('||');
    const created = Number(createdAt);
    const last = Number(lastAttached);
    return {
      name,
      windows: Number(windows) || 0,
      attached: attached === '1',
      createdAt: Number.isFinite(created) && created > 0 ? created * 1000 : undefined,
      lastAttached: Number.isFinite(last) && last > 0 ? last * 1000 : undefined,
    };
  });
}

export function requireName(value: unknown): string {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Session name is required');
  }
  return value.trim();
}

export async function capturePane(target: string, lines = 12): Promise<string[]> {
  const count = Number.isFinite(lines) && lines > 0 ? Math.min(lines, 200) : 12;
  const raw = await runTmux([
    'capture-pane',
    '-J',
    '-p',
    '-e',
    '-t',
    sessionTarget(target),
    '-S',
    `-${count}`,
  ]);
  if (!raw) return [];
  return raw.split('\n');
}

export async function getCursorInfo(target: string): Promise<CursorInfo | null> {
  const targetRef = sessionTarget(target);
  try {
    const sizeRaw = await runTmux(['display-message', '-p', '-t', targetRef, '#{pane_width} #{pane_height}']);
    const sizeParts = sizeRaw.split(/\s+/).map((part) => Number(part));
    const width = sizeParts[0];
    const height = sizeParts[1];
    let cursorRaw = await runTmux(['display-message', '-p', '-t', targetRef, '#{cursor_x} #{cursor_y}']);
    let cursorParts = cursorRaw.split(/\s+/).map((part) => Number(part));
    let x = cursorParts[0];
    let y = cursorParts[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      cursorRaw = await runTmux(['display-message', '-p', '-t', targetRef, '#{pane_cursor_x} #{pane_cursor_y}']);
      cursorParts = cursorRaw.split(/\s+/).map((part) => Number(part));
      x = cursorParts[0];
      y = cursorParts[1];
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y, width, height };
  } catch {
    return null;
  }
}
