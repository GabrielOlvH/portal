import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { oauthCache } from './state';
import { formatOAuthError } from './utils';

const TOKEN_DIR = path.join(os.homedir(), '.ter');
const TOKEN_FILE = path.join(TOKEN_DIR, 'copilot-token');

type CopilotAuthResult = { data: any } | { error: string };

export function getStoredToken(): string | null {
  try {
    const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    return token || null;
  } catch {
    return null;
  }
}

export async function storeToken(token: string): Promise<void> {
  await fs.promises.mkdir(TOKEN_DIR, { recursive: true });
  await fs.promises.writeFile(TOKEN_FILE, token, { mode: 0o600 });
}

export async function clearToken(): Promise<void> {
  try {
    await fs.promises.unlink(TOKEN_FILE);
  } catch {}
}

async function fetchCopilotUsage(token: string): Promise<CopilotAuthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const schemes = ['Bearer', 'token'] as const;
  let lastAuthError: string | null = null;

  try {
    for (const scheme of schemes) {
      const response = await fetch('https://api.github.com/copilot_internal/user', {
        method: 'GET',
        headers: {
          Authorization: `${scheme} ${token}`,
          Accept: 'application/json',
          'Editor-Version': 'vscode/1.96.2',
          'Editor-Plugin-Version': 'copilot-chat/0.26.7',
          'User-Agent': 'GitHubCopilotChat/0.26.7',
          'X-Github-Api-Version': '2025-04-01',
        },
        signal: controller.signal,
      });
      const text = await response.text();

      if (response.ok) {
        const payload = JSON.parse(text);
        return { data: payload };
      }

      if (response.status === 401 || response.status === 403) {
        lastAuthError = `copilot unauthorized (${scheme.toLowerCase()})`;
        continue;
      }

      return { error: `copilot http ${response.status}: ${text.slice(0, 200)}` };
    }

    return { error: lastAuthError || 'copilot unauthorized' };
  } catch (err) {
    return { error: formatOAuthError(err) || 'copilot request failed' };
  } finally {
    clearTimeout(timeout);
  }
}

function copilotWindow(snapshot: { percent_remaining?: number } | null | undefined): { percentLeft: number } | null {
  if (!snapshot || typeof snapshot.percent_remaining !== 'number') return null;
  const percentLeft = Math.max(0, Math.round(snapshot.percent_remaining));
  return { percentLeft };
}

export async function getCopilotStatus(): Promise<{ session?: { percentLeft?: number }; weekly?: { percentLeft?: number }; source?: string; error?: string }> {
  const now = Date.now();
  if (oauthCache.copilot.value && now - oauthCache.copilot.ts < 60000) {
    return oauthCache.copilot.value;
  }
  if (oauthCache.copilot.error && now - oauthCache.copilot.ts < 60000) {
    return { error: oauthCache.copilot.error };
  }
  const token = getStoredToken();
  if (!token) {
    oauthCache.copilot = { ts: now, value: null, error: 'copilot token missing' };
    return { error: 'copilot token missing' };
  }
  const result = await fetchCopilotUsage(token);
  if ('error' in result) {
    oauthCache.copilot = { ts: now, value: null, error: result.error };
    return { error: result.error };
  }
  const quota = result.data?.quotaSnapshots || result.data?.quota_snapshots || {};
  const premium = copilotWindow(quota.premiumInteractions || quota.premium_interactions);
  const chat = copilotWindow(quota.chat);
  const value = {
    session: premium ? { percentLeft: premium.percentLeft } : undefined,
    weekly: chat ? { percentLeft: chat.percentLeft } : undefined,
    source: 'api',
  };
  oauthCache.copilot = { ts: now, value, error: null };
  return value;
}
