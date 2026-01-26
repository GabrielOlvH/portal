import os from 'node:os';
import { runTmux, sessionTarget } from './tmux';

export async function listSessions(): Promise<string> {
  return runTmux([
    'list-sessions',
    '-F',
    '#{session_name}||#{session_windows}||#{session_created}||#{session_attached}||#{session_last_attached}',
  ]);
}

const hostname = os.hostname();
const defaultTitles = new Set([
  hostname,
  hostname.toLowerCase(),
  hostname.split('.')[0],
  'bash',
  'zsh',
  'sh',
  'fish',
  'ksh',
  'tcsh',
  'csh',
  '',
]);

export async function getPaneTitle(sessionName: string): Promise<string | null> {
  try {
    const raw = await runTmux([
      'list-panes',
      '-t',
      sessionTarget(sessionName),
      '-F',
      '#{pane_title}',
    ]);
    const title = raw.trim().split('\n')[0];
    if (!title || defaultTitles.has(title) || defaultTitles.has(title.toLowerCase())) {
      return null;
    }
    return title;
  } catch {
    return null;
  }
}
