import os from 'node:os';
import path from 'node:path';

export const PORT = Number(process.env.TMUX_AGENT_PORT || 4020);
export const HOST_LABEL = process.env.TMUX_AGENT_HOST || os.hostname();
export const TOKEN = process.env.TMUX_AGENT_TOKEN;
export const SOCKET = process.env.TMUX_AGENT_SOCKET;
export const USAGE_POLL_INTERVAL = Number(process.env.TMUX_AGENT_USAGE_POLL_MS || 60000);
export const MAX_TOKEN_FILES = Number(process.env.TMUX_AGENT_TOKEN_FILES || 200);
export const TOKEN_POLL_INTERVAL = Number(process.env.TMUX_AGENT_TOKEN_POLL_MS || 180000);
export const IDLE_STOP_MS = Number(process.env.TMUX_AGENT_IDLE_STOP_MS || 2000);
export const NOTIFICATION_POLL_INTERVAL = Number(process.env.TMUX_AGENT_NOTIFICATION_POLL_MS || 15000);
export const RESET_MONITOR_INTERVAL = Number(process.env.TMUX_AGENT_RESET_MONITOR_MS || 60000);
export const RESET_NOTIFY_THRESHOLD = Number(process.env.TMUX_AGENT_RESET_THRESHOLD || 50);
export const CLAUDE_PROBE_DIR = path.join(os.homedir(), '.tmux-agent', 'claude-probe');
export const CLAUDE_PROMPT_RESPONSES = [
  { needle: 'do you trust the files in this folder?', keys: '1\r', resend: true },
  { needle: 'ready to code here?', keys: '\r' },
  { needle: 'press enter to continue', keys: '\r' },
  { needle: 'enter to confirm', keys: '\r' },
  { needle: 'telemetry', keys: '\r' },
];
