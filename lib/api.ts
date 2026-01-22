import {
  AiProvider,
  AiSessionDetail,
  AiSessionListResponse,
  CliAssetListResponse,
  CliAssetType,
  CursorInfo,
  DirectoryListing,
  Host,
  PackageJsonScripts,
  PortInfo,
  Session,
  SessionInsights,
  Tunnel,
  TunnelCreate,
} from '@/lib/types';

const DEFAULT_TIMEOUT_MS = 6000;

export type HealthResponse = { ok: boolean; host: string; tmuxVersion?: string };
export type EventLoopLagSnapshot = {
  meanMs: number;
  p95Ms: number;
  maxMs: number;
  samples: number;
};
export type PingResponse = { ok: boolean; ts: number; lag?: EventLoopLagSnapshot | null };

export type HealthProbeResult =
  | { status: 'ok'; payload: HealthResponse }
  | { status: 'unauthorized' }
  | { status: 'not-found' }
  | { status: 'invalid-response' }
  | { status: 'unreachable'; message?: string }
  | { status: 'error'; statusCode?: number; message?: string };

export type PingProbeResult =
  | { status: 'ok'; payload: PingResponse }
  | { status: 'unauthorized' }
  | { status: 'not-found' }
  | { status: 'invalid-response' }
  | { status: 'unreachable'; message?: string }
  | { status: 'error'; statusCode?: number; message?: string };

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function buildHeaders(authToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

async function request<T>(
  host: Host,
  path: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const baseUrl = normalizeBaseUrl(host.baseUrl);
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const headers = buildHeaders(host.authToken);

  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed (${response.status})`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeHealth(
  baseUrl: string,
  authToken?: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<HealthProbeResult> {
  const url = `${normalizeBaseUrl(baseUrl)}/health`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(authToken),
      signal: controller.signal,
    });
    if (response.status === 401) {
      return { status: 'unauthorized' };
    }
    if (response.status === 404) {
      return { status: 'not-found' };
    }
    if (!response.ok) {
      const message = await response.text();
      return { status: 'error', statusCode: response.status, message: message || undefined };
    }
    try {
      const payload = (await response.json()) as HealthResponse;
      if (!payload || payload.ok !== true || typeof payload.host !== 'string') {
        return { status: 'invalid-response' };
      }
      return { status: 'ok', payload };
    } catch {
      return { status: 'invalid-response' };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || '');
    return { status: 'unreachable', message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function probePing(
  baseUrl: string,
  authToken?: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<PingProbeResult> {
  const url = `${normalizeBaseUrl(baseUrl)}/ping`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(authToken),
      signal: controller.signal,
    });
    if (response.status === 401) {
      return { status: 'unauthorized' };
    }
    if (response.status === 404) {
      return { status: 'not-found' };
    }
    if (!response.ok) {
      const message = await response.text();
      return { status: 'error', statusCode: response.status, message: message || undefined };
    }
    try {
      const payload = (await response.json()) as PingResponse;
      if (!payload || payload.ok !== true || typeof payload.ts !== 'number') {
        return { status: 'invalid-response' };
      }
      return { status: 'ok', payload };
    } catch {
      return { status: 'invalid-response' };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || '');
    return { status: 'unreachable', message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getHealth(host: Host): Promise<HealthResponse> {
  return request(host, '/health', { method: 'GET' });
}

export async function getSessions(
  host: Host,
  options?: { preview?: boolean; previewLines?: number; insights?: boolean }
): Promise<Session[]> {
  const params = new URLSearchParams();
  if (options?.preview) params.set('preview', '1');
  if (options?.previewLines) params.set('lines', String(options.previewLines));
  if (options?.insights) params.set('insights', '1');
  const query = params.toString();
  const timeoutMs = options?.insights ? 12000 : DEFAULT_TIMEOUT_MS;
  return request(host, `/sessions${query ? `?${query}` : ''}`, { method: 'GET' }, timeoutMs);
}

export async function getUsage(host: Host): Promise<SessionInsights> {
  return request(host, '/usage', { method: 'GET' }, 12000);
}

export async function createSession(host: Host, name: string): Promise<void> {
  await request(host, '/sessions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function renameSession(host: Host, name: string, newName: string): Promise<void> {
  await request(host, `/sessions/${encodeURIComponent(name)}/rename`, {
    method: 'POST',
    body: JSON.stringify({ name: newName }),
  });
}

export async function killSession(host: Host, name: string): Promise<void> {
  await request(host, `/sessions/${encodeURIComponent(name)}/kill`, {
    method: 'POST',
  });
}

export async function sendKeys(host: Host, name: string, keys: string[]): Promise<void> {
  await request(host, `/sessions/${encodeURIComponent(name)}/keys`, {
    method: 'POST',
    body: JSON.stringify({ keys }),
  });
}

export async function sendText(host: Host, name: string, text: string): Promise<void> {
  await request(host, `/sessions/${encodeURIComponent(name)}/keys`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function captureSession(
  host: Host,
  name: string,
  lines: number,
  options?: { cursor?: boolean }
): Promise<{ lines: string[]; cursor?: CursorInfo }> {
  const params = new URLSearchParams();
  params.set('lines', String(lines));
  if (options?.cursor) params.set('cursor', '1');
  const data = await request<{ lines: string[]; cursor?: CursorInfo }>(
    host,
    `/sessions/${encodeURIComponent(name)}/capture?${params.toString()}`,
    { method: 'GET' }
  );
  return { lines: data.lines ?? [], cursor: data.cursor };
}

export async function resizeSession(host: Host, name: string, cols: number, rows: number): Promise<void> {
  await request(host, `/sessions/${encodeURIComponent(name)}/resize`, {
    method: 'POST',
    body: JSON.stringify({ cols, rows }),
  });
}

export async function getSessionInsights(host: Host, name: string): Promise<SessionInsights> {
  return request(
    host,
    `/sessions/${encodeURIComponent(name)}/insights`,
    { method: 'GET' },
    12000
  );
}

export async function fetchProjectScripts(
  host: Host,
  projectPath: string
): Promise<{ hasPackageJson: boolean; scripts: PackageJsonScripts }> {
  const params = new URLSearchParams();
  params.set('path', projectPath);
  return request(host, `/project/scripts?${params.toString()}`, { method: 'GET' });
}

export async function fetchDirectoryListing(
  host: Host,
  path?: string
): Promise<DirectoryListing> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  const query = params.toString();
  return request(host, `/fs/list${query ? `?${query}` : ''}`, { method: 'GET' });
}

export async function getPorts(host: Host): Promise<{ ports: PortInfo[] }> {
  return request(host, '/ports', { method: 'GET' });
}

export async function killPorts(
  host: Host,
  pids: number[]
): Promise<{ killed: number[]; failed: { pid: number; error: string }[] }> {
  return request(host, '/ports/kill', {
    method: 'POST',
    body: JSON.stringify({ pids }),
  });
}

export async function getTunnels(host: Host): Promise<{ tunnels: Tunnel[] }> {
  return request(host, '/tunnels', { method: 'GET' });
}

export async function createTunnel(
  host: Host,
  config: TunnelCreate
): Promise<{ tunnel: Tunnel }> {
  return request(host, '/tunnels', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function closeTunnel(
  host: Host,
  tunnelId: string
): Promise<{ ok: boolean }> {
  return request(host, `/tunnels/${encodeURIComponent(tunnelId)}`, {
    method: 'DELETE',
  });
}

export async function dockerContainerAction(
  host: Host,
  containerId: string,
  action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill'
): Promise<{ ok: boolean }> {
  return request(host, `/docker/containers/${encodeURIComponent(containerId)}/${action}`, {
    method: 'POST',
  });
}

export async function uploadImage(
  host: Host,
  base64: string,
  mimeType: string
): Promise<{ path: string }> {
  return request(host, '/upload', {
    method: 'POST',
    body: JSON.stringify({ data: base64, mimeType }),
  }, 30000);
}

export type UpdateStatus = {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  changes: string[];
  error?: string;
};

export type NotificationDevicePayload = {
  deviceId: string;
  expoPushToken: string;
  platform: 'ios' | 'android';
};

export async function checkForUpdate(host: Host): Promise<UpdateStatus> {
  return request(host, '/update/check', { method: 'GET' });
}

export async function applyUpdate(host: Host): Promise<{ success: boolean; message: string }> {
  return request(host, '/update/apply', { method: 'POST' });
}

export async function registerNotificationDevice(
  host: Host,
  payload: NotificationDevicePayload
): Promise<{ ok: boolean }> {
  return request(host, '/notifications/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function unregisterNotificationDevice(
  host: Host,
  deviceId: string
): Promise<{ ok: boolean }> {
  return request(host, '/notifications/register', {
    method: 'DELETE',
    body: JSON.stringify({ deviceId }),
  });
}

export async function sendTestPushNotification(
  host: Host,
  payload?: { title?: string; body?: string }
): Promise<{ ok: boolean; count?: number }> {
  return request(host, '/notifications/test', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  }, 15000);
}

// AI Sessions API

export type AiSessionsOptions = {
  provider?: AiProvider;
  limit?: number;
  offset?: number;
  directory?: string;
  maxAgeDays?: number;
  refresh?: boolean;
};

export async function getAiSessions(
  host: Host,
  options?: AiSessionsOptions
): Promise<AiSessionListResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.provider) params.set('provider', options.provider);
  if (options?.directory) params.set('directory', options.directory);
  if (options?.maxAgeDays) params.set('maxAgeDays', String(options.maxAgeDays));
  if (options?.refresh) params.set('refresh', '1');
  const query = params.toString();
  return request(host, `/ai-sessions${query ? `?${query}` : ''}`, { method: 'GET' });
}

export async function getAiSessionDetail(
  host: Host,
  provider: AiProvider,
  id: string
): Promise<AiSessionDetail> {
  return request(
    host,
    `/ai-sessions/${encodeURIComponent(provider)}/${encodeURIComponent(id)}`,
    { method: 'GET' }
  );
}

export async function resumeAiSession(
  host: Host,
  provider: AiProvider,
  id: string
): Promise<void> {
  // Resume an AI session by creating a new tmux session with the resume command
  // Each provider has a different resume command structure
  const resumeCommands: Record<AiProvider, string> = {
    claude: `claude --resume ${id}`,
    codex: `codex --resume ${id}`,
    opencode: `opencode --resume ${id}`,
  };

  const command = resumeCommands[provider];
  const sessionName = `${provider}-${id.slice(0, 8)}`;

  // Create a new tmux session running the resume command
  await request(host, '/sessions', {
    method: 'POST',
    body: JSON.stringify({
      name: sessionName,
      command,
    }),
  });
}

// CLI Assets API

export type CliAssetsOptions = {
  provider?: AiProvider;
  type: CliAssetType;
};

export async function getCliAssets(
  host: Host,
  options: CliAssetsOptions
): Promise<CliAssetListResponse> {
  const params = new URLSearchParams();
  params.set('type', options.type);
  if (options.provider) params.set('provider', options.provider);
  const query = params.toString();
  return request(host, `/cli-assets?${query}`, { method: 'GET' });
}

export async function upsertCliAsset(
  host: Host,
  payload: { provider: AiProvider; type: CliAssetType; name: string; content: string }
): Promise<{ ok: boolean }> {
  return request(host, '/cli-assets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteCliAsset(
  host: Host,
  payload: { provider: AiProvider; type: CliAssetType; name: string }
): Promise<{ ok: boolean }> {
  return request(host, '/cli-assets', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
}

// Copilot Auth API

export type CopilotAuthStartResponse = {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
};

export type CopilotAuthPollResponse = {
  status: 'pending' | 'success' | 'expired';
  token?: string;
  error?: string;
};

export type CopilotAuthStatusResponse = {
  authenticated: boolean;
  error?: string;
};

export async function startCopilotAuth(host: Host): Promise<CopilotAuthStartResponse> {
  return request(host, '/copilot/auth/start', { method: 'POST' });
}

export async function pollCopilotAuth(host: Host): Promise<CopilotAuthPollResponse> {
  return request(host, '/copilot/auth/poll', { method: 'GET' });
}

export async function getCopilotAuthStatus(host: Host): Promise<CopilotAuthStatusResponse> {
  return request(host, '/copilot/auth/status', { method: 'GET' });
}

export async function logoutCopilot(host: Host): Promise<{ ok: boolean }> {
  return request(host, '/copilot/auth', { method: 'DELETE' });
}

// Service Management API

export type ServiceStatus = {
  status: 'running' | 'stopped' | 'unknown';
  pid: number;
  uptimeSeconds: number;
  platform: 'linux' | 'macos' | 'windows';
  initSystem: 'systemd' | 'openrc' | 'launchd' | 'task-scheduler' | 'manual';
  autoRestart: boolean;
  version: string;
  installDir: string;
};

export type ServiceLogs = {
  lines: string[];
  source: 'journald' | 'file' | 'eventlog';
};

export async function getServiceStatus(host: Host): Promise<ServiceStatus> {
  return request(host, '/service/status', { method: 'GET' });
}

export async function restartService(host: Host): Promise<{ success: boolean; message: string }> {
  return request(host, '/service/restart', { method: 'POST' });
}

export async function getServiceLogs(host: Host, lines?: number): Promise<ServiceLogs> {
  const params = new URLSearchParams();
  if (lines) params.set('lines', String(lines));
  const query = params.toString();
  return request(host, `/service/logs${query ? `?${query}` : ''}`, { method: 'GET' });
}
