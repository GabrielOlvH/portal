import { DockerSnapshot, Host, HostInfo, HostStatus, Session } from '@/lib/types';
import { probeHealth } from '@/lib/api';
import { AppState, type AppStateStatus } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type LiveOptions = {
  sessions?: boolean;
  preview?: boolean;
  previewLines?: number;
  insights?: boolean;
  host?: boolean;
  docker?: boolean;
  intervalMs?: number;
  enabled?: boolean;
};

type HostLiveState = {
  status: HostStatus;
  sessions: Session[];
  hostInfo?: HostInfo;
  docker?: DockerSnapshot;
  error?: string;
  lastUpdate?: number;
};

type LiveSnapshotMessage = {
  type: 'snapshot';
  ts?: number;
  sessions?: Session[];
  host?: HostInfo;
  docker?: DockerSnapshot;
};

type LiveErrorMessage = {
  type: 'error';
  message?: string;
};

type ConnectionEntry = {
  socket: WebSocket;
  optionsKey: string;
  reconnects: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  hasSnapshot: boolean;
  errorProbe: Promise<void> | null;
  ignoreClose?: boolean;
};

const CONNECTION_PROBE_TIMEOUT_MS = 2500;
const MAX_LIVE_STATE_CACHE_SIZE = 100;
const liveStateCache = new Map<string, HostLiveState>();

function evictLiveStateCache(): void {
  if (liveStateCache.size <= MAX_LIVE_STATE_CACHE_SIZE) return;
  // Evict oldest entries (by lastUpdate timestamp, or insertion order if no timestamp)
  const entries = [...liveStateCache.entries()];
  entries.sort((a, b) => (a[1].lastUpdate ?? 0) - (b[1].lastUpdate ?? 0));
  const toRemove = entries.slice(0, entries.length - MAX_LIVE_STATE_CACHE_SIZE);
  for (const [key] of toRemove) {
    liveStateCache.delete(key);
  }
}

function describeNoAgentMessage(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const port = url.port;
    if (port && port !== '4020') {
      return `No agent detected on port ${port}.`;
    }
  } catch {}
  return 'No agent detected on this port (default 4020).';
}

function formatProbeError(baseUrl: string, result: Awaited<ReturnType<typeof probeHealth>>): string | null {
  switch (result.status) {
    case 'unauthorized':
      return 'Agent requires token';
    case 'not-found':
    case 'invalid-response':
      return describeNoAgentMessage(baseUrl);
    case 'unreachable':
      return 'Host unreachable';
    case 'error':
      return result.statusCode ? `Connection failed (${result.statusCode})` : 'Connection failed';
    default:
      return null;
  }
}

function buildEventsUrl(host: Host, options: LiveOptions): string {
  try {
    const base = new URL(host.baseUrl);
    const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams();
    if (options.sessions) params.set('sessions', '1');
    if (options.preview) params.set('preview', '1');
    if (options.previewLines) params.set('previewLines', String(options.previewLines));
    if (options.insights) params.set('insights', '1');
    if (options.host) params.set('host', '1');
    if (options.docker) params.set('docker', '1');
    if (options.intervalMs) params.set('interval', String(options.intervalMs));
    if (host.authToken) params.set('token', host.authToken);
    const query = params.toString();
    return `${protocol}//${base.host}/events${query ? `?${query}` : ''}`;
  } catch {
    return '';
  }
}

function buildOptionsKey(options: LiveOptions): string {
  const enabled = options.enabled !== false;
  return [
    enabled ? 'e1' : 'e0',
    options.sessions ? 's1' : 's0',
    options.preview ? 'p1' : 'p0',
    options.previewLines ? `l${options.previewLines}` : 'l0',
    options.insights ? 'i1' : 'i0',
    options.host ? 'h1' : 'h0',
    options.docker ? 'd1' : 'd0',
    options.intervalMs ? `t${options.intervalMs}` : 't0',
  ].join('|');
}

export function useHostsLive(hosts: Host[], options: LiveOptions) {
  const initialState = (() => {
    const next: Record<string, HostLiveState> = {};
    hosts.forEach((host) => {
      const cached = liveStateCache.get(host.id);
      if (cached) next[host.id] = cached;
    });
    return next;
  })();
  const [stateMap, setStateMap] = useState<Record<string, HostLiveState>>(initialState);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const connectionsRef = useRef<Map<string, ConnectionEntry>>(new Map());
  const mountedRef = useRef(true);
  const optionsRef = useRef(options);
  const enabled = options.enabled !== false && appState === 'active';
  const optionsKey = useMemo(
    () => buildOptionsKey({ ...options, enabled }),
    [
      enabled,
      options.enabled,
      options.sessions,
      options.preview,
      options.previewLines,
      options.insights,
      options.host,
      options.docker,
      options.intervalMs,
    ]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    optionsRef.current = options;
  }, [optionsKey]);

  const updateState = useCallback((hostId: string, updater: (prev: HostLiveState) => HostLiveState) => {
    if (!mountedRef.current) return;
    setStateMap((prev) => {
      const current = prev[hostId] || liveStateCache.get(hostId) || { status: 'checking', sessions: [] };
      const nextState = updater(current);
      liveStateCache.set(hostId, nextState);
      evictLiveStateCache();
      return { ...prev, [hostId]: nextState };
    });
  }, []);

  const connectHost = useCallback(
    (host: Host) => {
      if (!enabled) return;
      const url = buildEventsUrl(host, optionsRef.current);
      if (!url) {
        updateState(host.id, (prev) => ({ ...prev, status: 'offline', error: 'Invalid URL' }));
        return;
      }

      updateState(host.id, (prev) => ({ ...prev, status: 'checking', error: undefined }));

      const socket = new WebSocket(url);
      const entry: ConnectionEntry = {
        socket,
        optionsKey,
        reconnects: 0,
        reconnectTimer: null,
        hasSnapshot: false,
        errorProbe: null,
      };
      connectionsRef.current.set(host.id, entry);

      const startErrorProbe = () => {
        if (entry.hasSnapshot || entry.errorProbe) return;
        entry.errorProbe = (async () => {
          const result = await probeHealth(host.baseUrl, host.authToken, CONNECTION_PROBE_TIMEOUT_MS);
          const current = connectionsRef.current.get(host.id);
          if (!current || current !== entry || current.socket !== socket || current.hasSnapshot) return;
          const message = formatProbeError(host.baseUrl, result);
          if (!message) return;
          updateState(host.id, (prev) => ({ ...prev, status: 'offline', error: message }));
        })();
      };

      socket.onmessage = (event) => {
        let payload: LiveSnapshotMessage | LiveErrorMessage | null = null;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!payload) return;
        if (payload.type === 'snapshot') {
          entry.hasSnapshot = true;
          updateState(host.id, (prev) => ({
            ...prev,
            status: 'online',
            sessions: payload.sessions ?? prev.sessions,
            hostInfo: payload.host ?? prev.hostInfo,
            docker: payload.docker ?? prev.docker,
            lastUpdate: payload.ts || Date.now(),
            error: undefined,
          }));
        } else if (payload.type === 'error') {
          updateState(host.id, (prev) => ({
            ...prev,
            status: prev.status === 'online' ? 'online' : 'offline',
            error: payload.message || 'Live feed error',
          }));
        }
      };

      socket.onclose = () => {
        if (entry.ignoreClose) return;
        updateState(host.id, (prev) => ({ ...prev, status: 'offline' }));
        startErrorProbe();
        const current = connectionsRef.current.get(host.id);
        if (!current || current.socket !== socket) return;
        const delay = Math.min(10000, 1000 * Math.pow(2, current.reconnects));
        current.reconnects += 1;
        current.reconnectTimer = setTimeout(() => {
          if (!mountedRef.current) return;
          const latest = connectionsRef.current.get(host.id);
          if (!latest || latest !== current) return;
          connectHost(host);
        }, delay);
      };

      socket.onerror = () => {
        if (entry.ignoreClose) return;
        updateState(host.id, (prev) => ({ ...prev, status: 'offline' }));
        startErrorProbe();
      };
    },
    [optionsKey, updateState, enabled]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const entry of connectionsRef.current.values()) {
        entry.ignoreClose = true;
        if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
        entry.socket.close();
      }
      connectionsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const hostIds = new Set(hosts.map((host) => host.id));
    setStateMap((prev) => {
      const next: Record<string, HostLiveState> = { ...prev };
      let changed = false;

      for (const id of Object.keys(next)) {
        if (!hostIds.has(id)) {
          delete next[id];
          liveStateCache.delete(id);
          changed = true;
        }
      }

      for (const host of hosts) {
        if (!next[host.id]) {
          const cached = liveStateCache.get(host.id);
          if (cached) {
            next[host.id] = cached;
            changed = true;
          }
        }
      }

      if (changed) return next;
      return prev;
    });

    if (!enabled) {
      for (const entry of connectionsRef.current.values()) {
        entry.ignoreClose = true;
        if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
        entry.socket.close();
      }
      connectionsRef.current.clear();
      return;
    }

    for (const [id, entry] of connectionsRef.current.entries()) {
      if (!hostIds.has(id) || entry.optionsKey !== optionsKey) {
        entry.ignoreClose = true;
        if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
        entry.socket.close();
        connectionsRef.current.delete(id);
      }
    }

    hosts.forEach((host) => {
      if (!connectionsRef.current.has(host.id)) {
        connectHost(host);
      }
    });
  }, [hosts, optionsKey, connectHost, enabled]);

  const refreshHost = useCallback((hostId: string) => {
    if (!enabled) return;
    const entry = connectionsRef.current.get(hostId);
    if (!entry || entry.socket.readyState !== WebSocket.OPEN) return;
    entry.socket.send(JSON.stringify({ type: 'refresh' }));
  }, [enabled]);

  const refreshAll = useCallback(() => {
    for (const [hostId] of connectionsRef.current.entries()) {
      refreshHost(hostId);
    }
  }, [refreshHost]);

  return { stateMap, refreshAll, refreshHost };
}

export function useHostLive(host: Host | undefined, options: LiveOptions) {
  const hosts = useMemo(() => (host ? [host] : []), [host]);
  const { stateMap, refreshAll, refreshHost } = useHostsLive(hosts, options);
  const state = host ? stateMap[host.id] : undefined;
  const refresh = useCallback(() => {
    if (host) refreshHost(host.id);
  }, [host, refreshHost]);
  return { state, refresh, refreshAll };
}

