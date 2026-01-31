import type { IPty } from 'node-pty';

export type UsageWindow = {
  percentLeft?: number;
  reset?: string;
  windowMinutes?: number;
};

export type TokenUsage = {
  input?: number;
  output?: number;
  cached?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
  periodDays?: number;
  updatedAt?: number;
  source?: string;
};

export type ProviderUsage = {
  session?: UsageWindow;
  weekly?: UsageWindow;
  opus?: UsageWindow;
  tokens?: TokenUsage;
  source?: string;
  error?: string;
  credits?: number;
};

export type UsageMeta = {
  lastPolled?: number;
  lastAttempt?: number;
  refreshing?: boolean;
  error?: string;
  activeAgent?: 'codex' | 'claude' | null;
  agentState?: 'running' | 'idle' | 'stopped';
  agentCommand?: string | null;
};

export type UsageSnapshot = {
  codex?: ProviderUsage;
  claude?: ProviderUsage;
  copilot?: ProviderUsage;
  cursor?: ProviderUsage;
  kimi?: ProviderUsage;
  meta?: UsageMeta;
};

export type GitStatus = {
  repo: boolean;
  branch?: string;
  ahead?: number;
  behind?: number;
  dirty?: number;
  path?: string;
};

export type CacheEntry<T> = {
  ts: number;
  value: T | null;
  inflight: Promise<T | null> | null;
};

export type OAuthCacheEntry<T> = {
  ts: number;
  value: T | null;
  error: string | null;
};

export const usageCache: {
  ts: number;
  lastAttempt: number;
  lastError: string | null;
  value: UsageSnapshot | null;
  inflight: Promise<UsageSnapshot> | null;
} = {
  ts: 0,
  lastAttempt: 0,
  lastError: null,
  value: null,
  inflight: null,
};

export const tokenCache: {
  codex: CacheEntry<TokenUsage>;
  claude: CacheEntry<TokenUsage>;
} = {
  codex: { ts: 0, value: null, inflight: null },
  claude: { ts: 0, value: null, inflight: null },
};

export const gitCache: Map<string, { ts: number; value: GitStatus }> = new Map();

export const claudeSession: {
  term: IPty | null;
  binary: string | null;
  startedAt: number;
  listeners: Set<() => void>;
} = {
  term: null,
  binary: null,
  startedAt: 0,
  listeners: new Set(),
};

export const oauthCache: {
  claude: OAuthCacheEntry<ProviderUsage>;
  copilot: OAuthCacheEntry<ProviderUsage>;
  cursor: OAuthCacheEntry<ProviderUsage>;
  kimi: OAuthCacheEntry<ProviderUsage>;
} = {
  claude: { ts: 0, value: null, error: null },
  copilot: { ts: 0, value: null, error: null },
  cursor: { ts: 0, value: null, error: null },
  kimi: { ts: 0, value: null, error: null },
};

export const sessionActivity: Map<string, { hash: string; lastChangedAt: number; idleConfirmedAt: number | null }> = new Map();

export const usageInflight: {
  claudeCapture: Promise<string> | null;
} = {
  claudeCapture: null,
};
