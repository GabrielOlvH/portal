import type { ProviderUsage, UsageSnapshot } from './state';
import { tokenCache, usageCache } from './state';
import { TOKEN_POLL_INTERVAL } from './config';
import { getCodexStatus, getCodexTokenUsage } from './codex';
import { getClaudeStatus, getClaudeTokenUsage } from './claude';
import { getCopilotStatus } from './copilot';
import { getCursorStatus } from './cursor';
import { getKimiStatus } from './kimi';
import { shouldRefresh, snapshot } from './cache';

type ProviderStatus = ProviderUsage | { error: string } | { [key: string]: unknown };

async function ensureTokenRefresh(provider: 'codex' | 'claude', days: number) {
  if (provider === 'codex') {
    if (tokenCache.codex.inflight) return tokenCache.codex.inflight;
    tokenCache.codex.inflight = getCodexTokenUsage(days)
      .catch(() => null)
      .finally(() => {
        tokenCache.codex.inflight = null;
      });
    return tokenCache.codex.inflight;
  }
  if (tokenCache.claude.inflight) return tokenCache.claude.inflight;
  tokenCache.claude.inflight = getClaudeTokenUsage(days)
    .catch(() => null)
    .finally(() => {
      tokenCache.claude.inflight = null;
    });
  return tokenCache.claude.inflight;
}

async function buildUsageSnapshot(): Promise<UsageSnapshot> {
  const [codexResult, claudeResult, copilotResult, cursorResult, kimiResult] = await Promise.allSettled([
    getCodexStatus(),
    getClaudeStatus(),
    getCopilotStatus(),
    getCursorStatus(),
    getKimiStatus(),
  ]);

  const codexStatus: ProviderStatus =
    codexResult.status === 'fulfilled' ? codexResult.value : { error: 'codex fetch failed' };
  const claudeStatus: ProviderStatus =
    claudeResult.status === 'fulfilled' ? claudeResult.value : { error: 'claude fetch failed' };
  const copilotStatus: ProviderStatus =
    copilotResult.status === 'fulfilled' ? copilotResult.value : { error: 'copilot fetch failed' };
  const cursorStatus: ProviderStatus =
    cursorResult.status === 'fulfilled' ? cursorResult.value : { error: 'cursor fetch failed' };
  const kimiStatus: ProviderStatus =
    kimiResult.status === 'fulfilled' ? kimiResult.value : { error: 'kimi fetch failed' };

  const codexTokens = snapshot(tokenCache.codex);
  const claudeTokens = snapshot(tokenCache.claude);
  if (shouldRefresh(tokenCache.codex, TOKEN_POLL_INTERVAL)) ensureTokenRefresh('codex', 7);
  if (shouldRefresh(tokenCache.claude, TOKEN_POLL_INTERVAL)) ensureTokenRefresh('claude', 7);

  const codex = 'error' in codexStatus
    ? { error: String(codexStatus.error) }
    : {
        session: codexStatus.session,
        weekly: codexStatus.weekly,
        tokens: codexTokens || undefined,
        source: codexStatus.source,
        error: codexStatus.error ? String(codexStatus.error) : undefined,
        credits: codexStatus.credits,
      };

  const claude = 'error' in claudeStatus
    ? { error: String(claudeStatus.error) }
    : {
        session: claudeStatus.session,
        weekly: claudeStatus.weekly,
        tokens: claudeTokens || undefined,
        source: claudeStatus.source,
        error: claudeStatus.error ? String(claudeStatus.error) : undefined,
      };

  const copilot = 'error' in copilotStatus
    ? { error: String(copilotStatus.error) }
    : {
        session: copilotStatus.session,
        weekly: copilotStatus.weekly,
        source: copilotStatus.source,
        error: copilotStatus.error ? String(copilotStatus.error) : undefined,
      };

  const cursor = 'error' in cursorStatus
    ? { error: String(cursorStatus.error) }
    : {
        session: cursorStatus.session,
        weekly: cursorStatus.weekly,
        source: cursorStatus.source,
        error: cursorStatus.error ? String(cursorStatus.error) : undefined,
      };

  const kimi = 'error' in kimiStatus
    ? { error: String(kimiStatus.error) }
    : {
        session: kimiStatus.session,
        weekly: kimiStatus.weekly,
        source: kimiStatus.source,
        error: kimiStatus.error ? String(kimiStatus.error) : undefined,
      };

  return {
    codex: codex as ProviderUsage,
    claude: claude as ProviderUsage,
    copilot: copilot as ProviderUsage,
    cursor: cursor as ProviderUsage,
    kimi: kimi as ProviderUsage,
  };
}

export function startUsageRefresh() {
  if (usageCache.inflight) return usageCache.inflight;
  usageCache.lastAttempt = Date.now();
  usageCache.lastError = null;
  usageCache.inflight = buildUsageSnapshot()
    .then((value) => {
      usageCache.value = value;
      usageCache.ts = Date.now();
      return value;
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err || 'refresh failed');
      usageCache.lastError = message;
      return (
        usageCache.value || {
          codex: { error: 'unavailable' },
          claude: { error: 'unavailable' },
          copilot: { error: 'unavailable' },
          cursor: { error: 'unavailable' },
          kimi: { error: 'unavailable' },
        }
      );
    })
    .finally(() => {
      usageCache.inflight = null;
    });
  return usageCache.inflight;
}

function withUsageMeta(snapshot: UsageSnapshot) {
  return {
    ...snapshot,
    meta: {
      lastPolled: usageCache.ts || undefined,
      lastAttempt: usageCache.lastAttempt || undefined,
      refreshing: Boolean(usageCache.inflight),
      error: usageCache.lastError || undefined,
    },
  };
}

export async function getUsageSnapshot() {
  const now = Date.now();
  if (usageCache.value && now - usageCache.ts < 30000) {
    return withUsageMeta(usageCache.value);
  }

  if (usageCache.value) {
    startUsageRefresh();
    return withUsageMeta(usageCache.value);
  }

  const previous = usageCache.value;
  startUsageRefresh();
  return withUsageMeta(
    previous || {
      codex: { error: 'loading' },
      claude: { error: 'loading' },
      copilot: { error: 'loading' },
      cursor: { error: 'loading' },
      kimi: { error: 'loading' },
    }
  );
}

export function primeTokenRefresh() {
  ensureTokenRefresh('codex', 7);
  ensureTokenRefresh('claude', 7);
}
