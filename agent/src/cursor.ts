import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { oauthCache } from './state';
import { formatOAuthError } from './utils';

const execFileAsync = promisify(execFile);

type CursorAuth = {
  type: 'cookie' | 'token';
  value: string;
};

async function getCursorCookieFromShell(): Promise<string | null> {
  try {
    // Source login shell to get vars from ~/.profile
    const { stdout } = await execFileAsync('bash', ['-lc', 'echo "$CURSOR_COOKIE"'], {
      timeout: 5000,
      encoding: 'utf8',
    });
    const cookie = stdout.trim();
    if (cookie && cookie !== '$CURSOR_COOKIE') {
      return cookie;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function readAccessTokenFromDb(): string | null {
  const home = os.homedir();
  const dbPath = path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  try {
    if (!fs.existsSync(dbPath)) return null;
    // Use Python to read from SQLite since it's universally available
    const script = `
import sqlite3, sys
try:
    conn = sqlite3.connect('${dbPath.replace(/'/g, "\\'")}')
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'")
    row = cursor.fetchone()
    conn.close()
    if row: print(row[0], end='')
except: pass
`;
    const result = execSync(`python3 -c "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

async function resolveCursorAuth(): Promise<CursorAuth | null> {
  // 1. Check environment variable (cookie format)
  const envHeader = (process.env.CURSOR_COOKIE || '').trim();
  if (envHeader) return { type: 'cookie', value: envHeader };

  // 2. Check environment variable (token format)
  const envToken = (process.env.CURSOR_TOKEN || '').trim();
  if (envToken) return { type: 'token', value: envToken };

  // 3. Try getting cookie from login shell (sources ~/.profile)
  const shellCookie = await getCursorCookieFromShell();
  if (shellCookie) return { type: 'cookie', value: shellCookie };

  const home = os.homedir();

  // 4. Check JSON cookie files
  const candidates = [
    path.join(home, '.cursor', 'session.json'),
    path.join(home, '.cursor', 'cookie.json'),
  ];
  for (const candidate of candidates) {
    try {
      const raw = fs.readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.cookie === 'string') return { type: 'cookie', value: parsed.cookie };
      if (parsed && Array.isArray(parsed.cookies)) {
        const header = (parsed.cookies as Array<{ name?: string; value?: string }>)
          .map((cookie) => `${cookie.name ?? ''}=${cookie.value ?? ''}`)
          .filter((cookie: string) => cookie !== '=')
          .join('; ');
        if (header) return { type: 'cookie', value: header };
      }
    } catch {}
  }

  // 5. Read access token from Cursor's SQLite database (fallback, may not work with web API)
  const dbToken = readAccessTokenFromDb();
  if (dbToken) return { type: 'token', value: dbToken };

  return null;
}

type CursorAuthResult = { data: any } | { error: string };

type CursorUsage = {
  session?: { percentLeft?: number; reset?: string };
  source?: string;
  error?: string;
};

async function fetchCursorUsage(auth: CursorAuth): Promise<CursorAuthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (auth.type === 'cookie') {
      headers.Cookie = auth.value;
    } else {
      headers.Authorization = `Bearer ${auth.value}`;
    }
    const response = await fetch('https://cursor.com/api/usage-summary', {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      return { error: 'cursor not logged in' };
    }
    if (!response.ok) {
      return { error: `cursor http ${response.status}: ${text.slice(0, 200)}` };
    }
    const payload = JSON.parse(text);
    return { data: payload };
  } catch (err) {
    return { error: formatOAuthError(err) || 'cursor request failed' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCursorStatus(): Promise<CursorUsage> {
  const now = Date.now();
  if (oauthCache.cursor.value && now - oauthCache.cursor.ts < 60000) {
    return oauthCache.cursor.value;
  }
  if (oauthCache.cursor.error && now - oauthCache.cursor.ts < 60000) {
    return { error: oauthCache.cursor.error };
  }
  const auth = await resolveCursorAuth();
  if (!auth) {
    oauthCache.cursor = { ts: now, value: null, error: 'cursor auth missing' };
    return { error: 'cursor not configured' };
  }
  const result = await fetchCursorUsage(auth);
  if ('error' in result) {
    oauthCache.cursor = { ts: now, value: null, error: result.error };
    return { error: result.error };
  }
  const summary = result.data || {};
  const billingCycleEnd = summary.billingCycleEnd || summary.billing_cycle_end;
  const planUsed = Number(summary.individualUsage?.plan?.totalPercentUsed ?? summary.individual_usage?.plan?.total_percent_used ?? 0);
  const planPercentLeft = Number.isFinite(planUsed) ? Math.max(0, Math.round(100 - planUsed)) : undefined;
  const value = {
    session: Number.isFinite(planPercentLeft) ? { percentLeft: planPercentLeft, reset: billingCycleEnd } : undefined,
    source: 'web',
  };
  oauthCache.cursor = { ts: now, value, error: null };
  return value;
}
