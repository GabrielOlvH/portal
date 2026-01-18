import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveBinary, resolveClaudeRoots } from './binaries';
import { formatOAuthError, stripAnsi } from './utils';
import { CLAUDE_PROBE_DIR, CLAUDE_PROMPT_RESPONSES } from './config';
import { claudeSession, oauthCache, tokenCache, usageInflight } from './state';
import { pty } from './pty';
import { MAX_TOKEN_FILES } from './config';

import type { ProviderUsage, TokenUsage } from './state';

async function ensureClaudeProbeDir(): Promise<void> {
  try {
    await fs.promises.mkdir(CLAUDE_PROBE_DIR, { recursive: true });
  } catch {}
}

type ClaudeOAuthCredentials = {
  accessToken?: string;
  expiresAt: Date | null;
  scopes: string[];
  rateLimitTier: string | null;
  error?: string;
};

async function loadClaudeOAuthCredentials(): Promise<ClaudeOAuthCredentials> {
  const credentialPath = path.join(os.homedir(), '.claude', '.credentials.json');
  let raw;
  try {
    raw = await fs.promises.readFile(credentialPath, 'utf8');
  } catch {
    return { error: 'claude oauth credentials not found', expiresAt: null, scopes: [], rateLimitTier: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'claude oauth credentials invalid', expiresAt: null, scopes: [], rateLimitTier: null };
  }
  const oauth = parsed?.claudeAiOauth;
  if (!oauth?.accessToken) {
    return { error: 'claude oauth token missing', expiresAt: null, scopes: [], rateLimitTier: null };
  }
  const expiresAt = oauth.expiresAt ? new Date(oauth.expiresAt) : null;
  const scopes = Array.isArray(oauth.scopes) ? oauth.scopes : [];
  const rateLimitTier = oauth.rateLimitTier || null;
  return {
    accessToken: oauth.accessToken,
    expiresAt,
    scopes,
    rateLimitTier,
  };
}

function makeClaudeRateWindow(window: { utilization?: number; resets_at?: string; resetsAt?: string } | null | undefined, windowMinutes: number): { percentLeft: number; reset?: string; windowMinutes: number } | null {
  if (!window?.utilization && window?.utilization !== 0) return null;
  const used = Number(window.utilization);
  if (!Number.isFinite(used)) return null;
  const usedPercent = Math.max(0, Math.min(100, used));
  const percentLeft = Math.max(0, Math.round(100 - usedPercent));
  const reset = window.resets_at || window.resetsAt;
  return {
    percentLeft,
    reset: reset || undefined,
    windowMinutes,
  };
}

type ClaudeOAuthResult = { data: any } | { error: string };

type ClaudeUsageResult = ProviderUsage & { error?: string; opus?: { percentLeft?: number; reset?: string } };

type ClaudeOutputHandlers = {
  onData: (data: string) => void;
  onDone: () => void;
};

async function fetchClaudeOAuthUsage(accessToken: string): Promise<ClaudeOAuthResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'tmux-agent',
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      return { error: `claude oauth http ${response.status}: ${text.slice(0, 240)}` };
    }
    try {
      return { data: JSON.parse(text) };
    } catch {
      return { error: 'claude oauth response invalid' };
    }
  } catch (err) {
    return { error: formatOAuthError(err) || 'claude oauth request failed' };
  } finally {
    clearTimeout(timeout);
  }
}

async function getClaudeOAuthStatus() {
  const now = Date.now();
  if (oauthCache.claude.value && now - oauthCache.claude.ts < 60000) {
    return oauthCache.claude.value;
  }
  if (oauthCache.claude.error && now - oauthCache.claude.ts < 60000) {
    return null;
  }

  const creds = await loadClaudeOAuthCredentials();
  if (creds.error) {
    oauthCache.claude = { ts: now, value: null, error: creds.error };
    return null;
  }

  if (creds.expiresAt && creds.expiresAt.getTime() <= now) {
    oauthCache.claude = { ts: now, value: null, error: 'claude oauth expired' };
    return null;
  }

  if (!creds.scopes.includes('user:profile')) {
    oauthCache.claude = { ts: now, value: null, error: 'claude oauth missing user:profile scope' };
    return null;
  }

  if (!creds.accessToken) {
    oauthCache.claude = { ts: now, value: null, error: 'claude oauth token missing' };
    return null;
  }
  const result = await fetchClaudeOAuthUsage(creds.accessToken);
  if ('error' in result) {
    oauthCache.claude = { ts: now, value: null, error: result.error };
    return null;
  }

  const payload = result.data || {};
  const session = makeClaudeRateWindow(payload.five_hour || payload.fiveHour, 300);
  const weekly = makeClaudeRateWindow(payload.seven_day || payload.sevenDay, 10080);
  const opus = makeClaudeRateWindow(
    payload.seven_day_sonnet || payload.seven_day_opus || payload.sevenDaySonnet || payload.sevenDayOpus,
    10080
  );

  const value = {
    session: session ? { percentLeft: session.percentLeft, reset: session.reset } : undefined,
    weekly: weekly ? { percentLeft: weekly.percentLeft, reset: weekly.reset } : undefined,
    opus: opus ? { percentLeft: opus.percentLeft, reset: opus.reset } : undefined,
    source: 'oauth',
  };
  oauthCache.claude = { ts: now, value, error: null };
  return value;
}

function cleanupClaudeListeners() {
  for (const cleanup of claudeSession.listeners) {
    try {
      cleanup();
    } catch {}
  }
  claudeSession.listeners.clear();
}

function startClaudeSession(binary: string) {
  if (claudeSession.term && claudeSession.binary === binary) {
    return claudeSession.term;
  }
  try {
    claudeSession.term?.kill();
  } catch {}

  const term = pty.spawn(binary, ['--allowed-tools', ''], {
    name: 'xterm-256color',
    cols: 160,
    rows: 50,
    cwd: CLAUDE_PROBE_DIR,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      PWD: CLAUDE_PROBE_DIR,
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR || undefined,
    },
  });

  claudeSession.term = term;
  claudeSession.binary = binary;
  claudeSession.startedAt = Date.now();

  term.onExit(() => {
    cleanupClaudeListeners();
    claudeSession.term = null;
    claudeSession.binary = null;
    claudeSession.startedAt = 0;
  });

  return term;
}

function watchClaudeOutput(term: typeof claudeSession.term, { onData, onDone }: ClaudeOutputHandlers): () => void {
  if (!term) {
    return () => {};
  }
  const handleData = (data: string) => {
    onData(data);
  };
  const handleExit = () => {
    onDone();
  };
  term.onData(handleData);
  term.onExit(handleExit);
  return () => {
    try {
      if (typeof (term as any).off === 'function') {
        (term as any).off('data', handleData);
      } else if (typeof (term as any).removeListener === 'function') {
        (term as any).removeListener('data', handleData);
      }
    } catch {}
    try {
      if (typeof (term as any).off === 'function') {
        (term as any).off('exit', handleExit);
      } else if (typeof (term as any).removeListener === 'function') {
        (term as any).removeListener('exit', handleExit);
      }
    } catch {}
  };
}

async function runClaudeUsageCapture(binary: string): Promise<string> {
  if (usageInflight.claudeCapture) return usageInflight.claudeCapture;

  usageInflight.claudeCapture = new Promise<string>((resolve) => {
    let settled = false;
    let output = '';
    let sentUsage = false;
    let sentUsageAt = 0;
    let lastPromptAt = 0;
    let cleanup: (() => void) | null = null;
    const triggered = new Set<string>();

    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      if (cleanup) {
        try {
          cleanup();
        } catch {}
        claudeSession.listeners.delete(cleanup);
      }
      usageInflight.claudeCapture = null;
      resolve(result);
    };

    const timeout = setTimeout(() => finish(output), 25000);

    ensureClaudeProbeDir().then(() => {
      const term = startClaudeSession(binary);
      const stopNeedle = 'current session';
      const usageBlockers = ['do you trust the files in this folder?'];
      const usageTriggers = [
        'bypass permissions on',
        'claude code',
        'tips for getting started',
        'yes, proceed',
      ];
      const sendUsage = () => {
        if (sentUsage) return;
        sentUsage = true;
        sentUsageAt = Date.now();
        try {
          term.write('/usage\r');
        } catch {}
      };

      cleanup = watchClaudeOutput(term, {
        onData: (data) => {
          output += data;
          const clean = stripAnsi(output).toLowerCase();
          const hasStopNeedle = clean.includes(stopNeedle);
          const hasUsageBlocker = usageBlockers.some((needle) => clean.includes(needle));
          const hasUsageTrigger = usageTriggers.some((needle) => clean.includes(needle));

          for (const item of CLAUDE_PROMPT_RESPONSES) {
            if (!clean.includes(item.needle)) continue;
            if (triggered.has(item.needle) && !item.resend) continue;
            const now = Date.now();
            if (now - lastPromptAt < 800 && triggered.has(item.needle)) continue;
            triggered.add(item.needle);
            lastPromptAt = now;
            try {
              term.write(item.keys);
            } catch {}
          }

          if (hasStopNeedle) {
            clearTimeout(timeout);
            setTimeout(() => finish(output), 1600);
            return;
          }

          if (!sentUsage && (!hasUsageBlocker || hasUsageTrigger)) {
            sendUsage();
          }

          if (sentUsage && !hasStopNeedle && Date.now() - sentUsageAt > 4500) {
            sentUsage = false;
            sendUsage();
          }
        },
        onDone: () => {
          clearTimeout(timeout);
          finish(output);
        },
      });

      claudeSession.listeners.add(cleanup);

      setTimeout(() => {
        if (!sentUsage) {
          sendUsage();
        }
      }, 1400);
    });
  }).finally(() => {
    usageInflight.claudeCapture = null;
  });

  return usageInflight.claudeCapture;
}

function extractPercentAfterLabel(lines: string[], labelRegex: RegExp): number | undefined {
  for (let i = 0; i < lines.length; i += 1) {
    if (!labelRegex.test(lines[i])) continue;
    for (let j = i; j < Math.min(lines.length, i + 10); j += 1) {
      const match = lines[j].match(/(\d{1,3})%/);
      if (match) return Number(match[1]);
    }
  }
  return undefined;
}

function resetFromLine(line: string): string | undefined {
  const match = line.match(/reset[s]?\s*(?:in|at)?\s*(.*)$/i);
  if (match && match[1]) return match[1].trim();
  return undefined;
}

function extractResetAfterLabel(lines: string[], labelRegex: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i += 1) {
    if (!labelRegex.test(lines[i])) continue;
    for (let j = i; j < Math.min(lines.length, i + 10); j += 1) {
      const reset = resetFromLine(lines[j]);
      if (reset) return reset;
    }
  }
  return undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export async function getClaudeStatus(): Promise<ClaudeUsageResult> {
  const oauth = await getClaudeOAuthStatus();
  if (oauth) return oauth;

  const binary = await resolveBinary('claude', 'TMUX_AGENT_CLAUDE_BIN');
  if (!binary) {
    return { error: oauthCache.claude.error || 'claude not installed' };
  }

  const output = await runClaudeUsageCapture(binary);
  const clean = stripAnsi(output).trim();
  if (!clean) return { error: 'claude usage unavailable' };
  const lower = clean.toLowerCase();
  if (lower.includes('do you trust the files in this folder?') && !lower.includes('current session')) {
    return { error: 'claude needs folder trust' };
  }
  if (lower.includes('authentication_error') || lower.includes('token_expired')) {
    return { error: 'claude login required' };
  }
  const lines = clean.split('\n');
  const sessionPercent = extractPercentAfterLabel(lines, /current session/i);
  const weeklyPercent = extractPercentAfterLabel(lines, /current week/i);
  const sessionReset = extractResetAfterLabel(lines, /current session/i);
  const weeklyReset = extractResetAfterLabel(lines, /current week/i);
  let sessionValue = sessionPercent;
  let weeklyValue = weeklyPercent;
  if (!isFiniteNumber(sessionValue)) {
    const matches = clean.match(/\b(\d{1,3})%\b/g) || [];
    const percents = matches.map((entry) => Number(entry.replace('%', ''))).filter((v) => Number.isFinite(v));
    if (percents.length > 0) sessionValue = percents[0];
    if (percents.length > 1) weeklyValue = percents[1];
  }
  if (!isFiniteNumber(sessionValue)) {
    const hint = clean.slice(0, 400).replace(/\s+/g, ' ').trim();
    const needsRun = lower.includes('welcome to claude code') && !lower.includes('current session');
    return {
      error: needsRun
        ? 'claude needs /usage (open claude once)'
        : hint
          ? `claude usage parse failed: ${hint}`
          : 'claude usage parse failed',
    };
  }
  return {
    session: { percentLeft: sessionValue, reset: sessionReset || undefined },
    weekly: isFiniteNumber(weeklyValue) ? { percentLeft: weeklyValue, reset: weeklyReset || undefined } : undefined,
    source: 'cli',
  };
}

async function walkDir(root: string, fileCallback: (filePath: string) => Promise<void>): Promise<void> {
  let entries;
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, fileCallback);
    } else if (entry.isFile()) {
      await fileCallback(fullPath);
    }
  }
}

async function listClaudeFiles(roots: string[], days: number): Promise<string[]> {
  const files: string[] = [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const root of roots) {
    await walkDir(root, async (filePath) => {
      if (files.length >= MAX_TOKEN_FILES) return;
      if (!filePath.endsWith('.jsonl')) return;
      try {
        const stat = await fs.promises.stat(filePath);
        if (stat.mtimeMs < cutoff) return;
      } catch {
        return;
      }
      files.push(filePath);
    });
    if (files.length >= MAX_TOKEN_FILES) break;
  }
  return files;
}

export async function getClaudeTokenUsage(days = 7): Promise<TokenUsage | null> {
  const now = Date.now();
  if (tokenCache.claude.value && now - tokenCache.claude.ts < 60000) {
    return tokenCache.claude.value;
  }
  if (tokenCache.claude.inflight) {
    return tokenCache.claude.value;
  }
  const roots = resolveClaudeRoots();
  const files = await listClaudeFiles(roots, days);
  if (files.length === 0) return null;
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const filePath of files) {
    const seen = new Set();
    await scanJsonlFile(filePath, (line) => {
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        return;
      }
      if (obj.type !== 'assistant') return;
      if (!obj.message || !obj.message.usage) return;
      if (obj.timestamp) {
        const ts = Date.parse(obj.timestamp);
        if (Number.isFinite(ts)) {
          const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
          if (ts < cutoff) return;
        }
      }
      const messageId = obj.message?.id;
      const requestId = obj.requestId;
      if (messageId && requestId) {
        const key = `${messageId}:${requestId}`;
        if (seen.has(key)) return;
        seen.add(key);
      }
      const usage = obj.message.usage;
      totals.input += Math.max(0, toInt(usage.input_tokens));
      totals.output += Math.max(0, toInt(usage.output_tokens));
      totals.cacheRead += Math.max(0, toInt(usage.cache_read_input_tokens));
      totals.cacheWrite += Math.max(0, toInt(usage.cache_creation_input_tokens));
    });
  }
  const result = {
    input: totals.input,
    output: totals.output,
    cacheRead: totals.cacheRead,
    cacheWrite: totals.cacheWrite,
    total: totals.input + totals.output,
    periodDays: days,
    updatedAt: Date.now(),
    source: 'logs',
  };
  tokenCache.claude = { ts: now, value: result, inflight: null };
  return result;
}

async function scanJsonlFile(filePath: string, onLine: (line: string) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      let idx = buffer.indexOf('\n');
      while (idx >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.trim().length > 0) onLine(line);
        idx = buffer.indexOf('\n');
      }
    });
    stream.on('end', () => {
      if (buffer.trim().length > 0) onLine(buffer);
      resolve();
    });
    stream.on('error', () => resolve());
  });
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
