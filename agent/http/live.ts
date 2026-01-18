import { getDockerSnapshot } from '../docker';
import { getHostInfo } from '../host';
import { fetchSessions } from './sessions';

export type LiveConfig = {
  sessions: boolean;
  preview: boolean;
  previewLines: number;
  insights: boolean;
  host: boolean;
  docker: boolean;
  intervalMs: number;
};

type LiveSnapshot = {
  type: 'snapshot';
  ts: number;
  sessions?: unknown;
  host?: unknown;
  docker?: unknown;
};

function parseNumericParam(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseLiveConfig(url: URL): LiveConfig {
  const sessions = url.searchParams.get('sessions') === '1';
  const preview = url.searchParams.get('preview') === '1';
  const previewLines = parseNumericParam(url.searchParams.get('previewLines'), 6);
  const insights = url.searchParams.get('insights') === '1';
  const host = url.searchParams.get('host') === '1';
  const docker = url.searchParams.get('docker') === '1';
  const intervalMs = Math.max(2000, parseNumericParam(url.searchParams.get('interval'), 5000));
  return {
    sessions,
    preview,
    previewLines,
    insights,
    host,
    docker,
    intervalMs,
  };
}

export async function buildLiveSnapshot(config: LiveConfig): Promise<LiveSnapshot> {
  const snapshot: LiveSnapshot = { type: 'snapshot', ts: Date.now() };
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

