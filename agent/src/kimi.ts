import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ProviderUsage } from './state';
import { oauthCache } from './state';

const execFileAsync = promisify(execFile);

type KimiUsageDetail = {
  limit: string;
  used?: string;
  remaining?: string;
  resetTime: string;
};

type KimiRateLimit = {
  window: {
    duration: number;
    timeUnit: string;
  };
  detail: KimiUsageDetail;
};

type KimiUsage = {
  scope: string;
  detail: KimiUsageDetail;
  limits?: KimiRateLimit[];
};

type KimiUsageResponse = {
  usages: KimiUsage[];
};

async function getKimiTokenFromShell(): Promise<string | null> {
  try {
    // Try to read from bash environment
    const { stdout } = await execFileAsync('bash', ['-c', 'echo "$KIMI_AUTH_TOKEN"'], {
      timeout: 5000,
      encoding: 'utf8',
    });
    const token = stdout.trim();
    if (token && token !== '$KIMI_AUTH_TOKEN') {
      return token;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function getKimiToken(): Promise<string | null> {
  // Check environment variable first
  const envToken = process.env.KIMI_AUTH_TOKEN;
  if (envToken) {
    return envToken;
  }
  
  // Try to read from shell environment (for systemd user services)
  const shellToken = await getKimiTokenFromShell();
  if (shellToken) {
    return shellToken;
  }
  
  return null;
}

function decodeJWT(jwt: string): { device_id?: string; ssid?: string; sub?: string } | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  let payload = parts[1];
  // Convert base64url to base64
  payload = payload.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding
  while (payload.length % 4 !== 0) {
    payload += '=';
  }
  try {
    const payloadData = Buffer.from(payload, 'base64').toString('utf8');
    const json = JSON.parse(payloadData) as Record<string, unknown>;
    return {
      device_id: typeof json.device_id === 'string' ? json.device_id : undefined,
      ssid: typeof json.ssid === 'string' ? json.ssid : undefined,
      sub: typeof json.sub === 'string' ? json.sub : undefined,
    };
  } catch {
    return null;
  }
}

async function fetchKimiUsage(accessToken: string): Promise<ProviderUsage | { error: string }> {
  const url = 'https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages';
  const sessionInfo = decodeJWT(accessToken);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      Cookie: `kimi-auth=${accessToken}`,
      Origin: 'https://www.kimi.com',
      Referer: 'https://www.kimi.com/code/console',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'connect-protocol-version': '1',
      'x-language': 'en-US',
      'x-msh-platform': 'web',
      'r-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    };
    if (sessionInfo?.device_id) {
      headers['x-msh-device-id'] = sessionInfo.device_id;
    }
    if (sessionInfo?.ssid) {
      headers['x-msh-session-id'] = sessionInfo.ssid;
    }
    if (sessionInfo?.sub) {
      headers['x-traffic-id'] = sessionInfo.sub;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ scope: ['FEATURE_CODING'] }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { error: 'kimi token invalid or expired' };
      }
      return { error: `kimi api error ${response.status}: ${text.slice(0, 200)}` };
    }
    let data: KimiUsageResponse;
    try {
      data = JSON.parse(text) as KimiUsageResponse;
    } catch {
      return { error: 'kimi response invalid json' };
    }
    const codingUsage = data.usages?.find((u) => u.scope === 'FEATURE_CODING');
    if (!codingUsage) {
      return { error: 'kimi usage data not found' };
    }
    const weekly = codingUsage.detail;
    const rateLimit = codingUsage.limits?.[0]?.detail;
    const result: ProviderUsage = {
      source: 'oauth',
    };
    // Weekly quota
    if (weekly) {
      const limit = parseInt(weekly.limit, 10);
      const used = weekly.used ? parseInt(weekly.used, 10) : undefined;
      const remaining = weekly.remaining ? parseInt(weekly.remaining, 10) : undefined;
      if (Number.isFinite(limit)) {
        let percentLeft: number | undefined;
        if (remaining !== undefined && Number.isFinite(remaining)) {
          percentLeft = Math.round((remaining / limit) * 100);
        } else if (used !== undefined && Number.isFinite(used)) {
          percentLeft = Math.max(0, Math.round(100 - (used / limit) * 100));
        }
        if (percentLeft !== undefined) {
          result.weekly = {
            percentLeft,
            reset: weekly.resetTime,
            windowMinutes: 10080, // 7 days in minutes
          };
        }
      }
    }
    // Rate limit (5-hour window)
    if (rateLimit) {
      const limit = parseInt(rateLimit.limit, 10);
      const used = rateLimit.used ? parseInt(rateLimit.used, 10) : undefined;
      const remaining = rateLimit.remaining ? parseInt(rateLimit.remaining, 10) : undefined;
      if (Number.isFinite(limit)) {
        let percentLeft: number | undefined;
        if (remaining !== undefined && Number.isFinite(remaining)) {
          percentLeft = Math.round((remaining / limit) * 100);
        } else if (used !== undefined && Number.isFinite(used)) {
          percentLeft = Math.max(0, Math.round(100 - (used / limit) * 100));
        }
        if (percentLeft !== undefined) {
          result.session = {
            percentLeft,
            reset: rateLimit.resetTime,
            windowMinutes: 300, // 5 hours in minutes
          };
        }
      }
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'request failed');
    return { error: `kimi request failed: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getKimiStatus(): Promise<ProviderUsage | { error: string }> {
  const now = Date.now();
  // Check cache
  if (oauthCache.kimi?.value && now - oauthCache.kimi.ts < 60000) {
    return oauthCache.kimi.value;
  }
  if (oauthCache.kimi?.error && now - oauthCache.kimi.ts < 60000) {
    return { error: oauthCache.kimi.error };
  }
  
  const token = await getKimiToken();
  if (!token) {
    const error = 'kimi auth token not configured. Set KIMI_AUTH_TOKEN environment variable.';
    oauthCache.kimi = { ts: now, value: null, error };
    return { error };
  }
  
  const result = await fetchKimiUsage(token);
  if ('error' in result) {
    oauthCache.kimi = { ts: now, value: null, error: result.error ?? null };
    return result;
  }
  oauthCache.kimi = { ts: now, value: result, error: null };
  return result;
}
