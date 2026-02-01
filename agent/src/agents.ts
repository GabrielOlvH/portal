import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { capturePane, sessionTarget } from './tmux';
import { stripAnsi } from './utils';
import { getGitStatus } from './git';
import { getUsageSnapshot } from './usage';
import { IDLE_STOP_MS } from './config';
import { sessionActivity, evictSessionActivity } from './state';

const execFileAsync = promisify(execFile);
const shellCommands = new Set(['bash', 'zsh', 'fish', 'sh', 'tmux']);

async function getAgentFromPid(pid?: string | number | null): Promise<'codex' | 'claude' | null> {
  if (!pid) return null;
  try {
    const { stdout } = await execFileAsync('ps', ['-o', 'args=', '-p', String(pid)], { timeout: 2000 });
    const text = stdout.toLowerCase();
    if (text.includes('codex')) return 'codex';
    if (text.includes('claude')) return 'claude';
  } catch {}
  try {
    const { stdout } = await execFileAsync('pgrep', ['-P', String(pid)], { timeout: 2000 });
    const children = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (children.length > 0) {
      const { stdout: argsOut } = await execFileAsync('ps', ['-o', 'args=', '-p', children.join(',')], {
        timeout: 2000,
      });
      const text = argsOut.toLowerCase();
      if (text.includes('codex')) return 'codex';
      if (text.includes('claude')) return 'claude';
    }
  } catch {}
  return null;
}

async function getChildCommands(pid?: string | number | null): Promise<string[]> {
  if (!pid) return [];
  try {
    const { stdout } = await execFileAsync('pgrep', ['-P', String(pid)], { timeout: 2000 });
    const children = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (children.length === 0) return [];
    const { stdout: commOut } = await execFileAsync('ps', ['-o', 'comm=', '-p', children.join(',')], { timeout: 2000 });
    return commOut
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function hasActiveProcess(command: string | null, pid: string | null): Promise<boolean> {
  const baseCommand = (command || '').split(/\s+/)[0].toLowerCase();
  if (baseCommand && !shellCommands.has(baseCommand)) return true;
  const children = await getChildCommands(pid);
  return children.some((child) => !shellCommands.has(child.toLowerCase()));
}

export async function getSessionAgentInfo(
  name: string
): Promise<{ agent: 'codex' | 'claude' | null; command: string | null; cwd: string | null; processActive: boolean }> {
  try {
    const targetRef = sessionTarget(name);
    const raw = await execFileAsync('tmux', [
      'list-panes',
      '-t',
      targetRef,
      '-F',
      '#{pane_active}||#{pane_current_command}||#{pane_start_command}||#{pane_pid}||#{pane_current_path}',
    ]);
    const lines = raw.stdout.split('\n').filter(Boolean);
    if (lines.length === 0) return { agent: null, command: null, cwd: null, processActive: false };

    const panes = lines.map((line) => {
      const parts = line.split('||');
      return {
        active: parts[0] === '1',
        command: (parts[1] || '').trim(),
        startCommand: (parts[2] || '').trim(),
        pid: (parts[3] || '').trim(),
        cwd: (parts[4] || '').trim(),
      };
    });

    const ordered = [...panes].sort((a, b) => {
      if (a.active === b.active) {
        return 0;
      } else if (a.active) {
        return -1;
      } else {
        return 1;
      }
    });

    let agent: 'codex' | 'claude' | null = null;
    let agentCommand: string | null = null;
    let agentCwd: string | null = null;

    for (const pane of ordered) {
      const haystack = `${pane.command} ${pane.startCommand} ${name}`.toLowerCase();
      if (!agent && haystack.includes('codex')) {
        agent = 'codex';
        agentCommand = pane.command || pane.startCommand;
        agentCwd = pane.cwd;
      }
      if (!agent && haystack.includes('claude')) {
        agent = 'claude';
        agentCommand = pane.command || pane.startCommand;
        agentCwd = pane.cwd;
      }
    }

    let processActive = false;
    for (const pane of ordered) {
      const command = pane.command || pane.startCommand;
      if (await hasActiveProcess(command, pane.pid)) {
        processActive = true;
        break;
      }
    }

    const activePane = ordered[0];
    if (activePane) {
      const fromPid = await getAgentFromPid(activePane.pid);
      const command = activePane.command || activePane.startCommand || agentCommand;
      const cwd = activePane.cwd || agentCwd;
      return { agent: fromPid || agent, command, cwd, processActive };
    }

    return { agent, command: agentCommand, cwd: agentCwd, processActive };
  } catch {
    return { agent: null, command: null, cwd: null, processActive: false };
  }
}

function stablePreviewHash(lines: string[] | null | undefined): string {
  if (!lines || lines.length === 0) return '';
  return lines.map((line) => stripAnsi(line)).join('\n').trim();
}

export function detectAgentState(
  sessionName: string,
  lines: string[] | null | undefined,
  processActive: boolean,
  idleWindowMs: number = IDLE_STOP_MS
): 'running' | 'idle' | 'stopped' {
  if (!processActive) return 'stopped';

  const now = Date.now();
  const hash = stablePreviewHash(lines);
  const previous = sessionActivity.get(sessionName);
  if (!previous || previous.hash !== hash) {
    sessionActivity.set(sessionName, { hash, lastChangedAt: now, idleConfirmedAt: null });
    evictSessionActivity();
    return 'running';
  }

  const elapsed = now - previous.lastChangedAt;
  if (elapsed <= idleWindowMs) {
    return 'running';
  }

  // Hysteresis: require 2 consecutive "would be idle" checks
  if (previous.idleConfirmedAt === null) {
    sessionActivity.set(sessionName, { ...previous, idleConfirmedAt: now });
    evictSessionActivity();
    return 'running';
  }

  const idleElapsed = now - previous.idleConfirmedAt;
  return idleElapsed > idleWindowMs ? 'idle' : 'running';
}

export async function getSessionInsights(name: string, preview?: string[]) {
  const usage = await getUsageSnapshot();
  const agentInfo = await getSessionAgentInfo(name);
  const git = await getGitStatus(agentInfo.cwd);
  const previewLines = preview ?? (await capturePane(name, 4));
  const agentState = detectAgentState(name, previewLines, agentInfo.processActive);
  return {
    ...usage,
    git,
    meta: {
      ...usage.meta,
      activeAgent: agentInfo.agent,
      agentState,
      agentCommand: agentInfo.command,
      cwd: agentInfo.cwd,
    },
  };
}
