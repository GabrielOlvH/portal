/**
 * WebSocket URL builders for various connections.
 * Centralizes URL construction logic and handles protocol conversion.
 */

import { TERMINAL } from './constants';

type HostConnection = {
  baseUrl: string;
  authToken?: string;
};

/**
 * Converts HTTP(S) protocol to WebSocket protocol
 */
function toWsProtocol(httpProtocol: string): string {
  return httpProtocol === 'https:' ? 'wss:' : 'ws:';
}

/**
 * Builds a WebSocket URL for tmux session connection
 */
export function buildSessionWsUrl(host: HostConnection, sessionName: string): string {
  try {
    const base = new URL(host.baseUrl);
    const protocol = toWsProtocol(base.protocol);
    const params = new URLSearchParams();
    params.set('session', sessionName);
    params.set('cols', String(TERMINAL.DEFAULT_COLS));
    params.set('rows', String(TERMINAL.DEFAULT_ROWS));
    if (host.authToken) params.set('token', host.authToken);
    return `${protocol}//${base.host}/ws?${params.toString()}`;
  } catch {
    return '';
  }
}

/**
 * Builds a WebSocket URL for Docker container exec (shell)
 */
export function buildDockerExecWsUrl(
  host: HostConnection,
  containerId: string,
  shell: string = 'sh'
): string {
  try {
    const base = new URL(host.baseUrl);
    const protocol = toWsProtocol(base.protocol);
    const params = new URLSearchParams();
    params.set('container', containerId);
    params.set('shell', shell);
    params.set('cols', String(TERMINAL.DEFAULT_COLS));
    params.set('rows', String(TERMINAL.DEFAULT_ROWS));
    if (host.authToken) params.set('token', host.authToken);
    return `${protocol}//${base.host}/docker/exec?${params.toString()}`;
  } catch {
    return '';
  }
}

type DockerLogOptions = {
  follow: boolean;
  tail: string;
  timestamps?: boolean;
};

/**
 * Builds a WebSocket URL for Docker container logs streaming
 */
export function buildDockerLogsWsUrl(
  host: HostConnection,
  containerId: string,
  options: DockerLogOptions
): string {
  try {
    const base = new URL(host.baseUrl);
    const protocol = toWsProtocol(base.protocol);
    const params = new URLSearchParams();
    params.set('container', containerId);
    params.set('follow', options.follow ? '1' : '0');
    params.set('tail', options.tail);
    if (options.timestamps) params.set('timestamps', '1');
    if (host.authToken) params.set('token', host.authToken);
    return `${protocol}//${base.host}/docker/logs?${params.toString()}`;
  } catch {
    return '';
  }
}
