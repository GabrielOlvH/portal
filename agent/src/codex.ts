import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { resolveBinary } from './binaries';
import { runPtyCommand } from './pty-runner';
import { stripAnsi } from './utils';
import { tokenCache } from './state';
import { MAX_TOKEN_FILES } from './config';
import { toInt, scanJsonlFile, resetFromLine } from './utils/jsonl';

import type { ProviderUsage, TokenUsage } from './state';

type CodexStatus = ProviderUsage & { credits?: number };

type CodexRpcResult = {
  session?: { percentLeft?: number; reset?: string };
  weekly?: { percentLeft?: number; reset?: string };
  credits?: number;
  source?: string;
};

type RateLimitWindow = {
  usedPercent?: number;
  resetsAt?: number;
};

type RateLimitCredits = {
  balance?: number | string;
};

type RateLimitsPayload = {
  rateLimits?: {
    primary?: RateLimitWindow;
    secondary?: RateLimitWindow;
    credits?: RateLimitCredits;
  };
  primary?: RateLimitWindow;
  secondary?: RateLimitWindow;
  credits?: RateLimitCredits;
};

function percentLeftFromLine(line: string): number | undefined {
  const left = line.match(/(\d{1,3})%\s*(left|remaining)/i);
  if (left) return Number(left[1]);
  const used = line.match(/(\d{1,3})%\s*used/i);
  if (used) return Math.max(0, 100 - Number(used[1]));
  const any = line.match(/(\d{1,3})%/);
  return any ? Number(any[1]) : undefined;
}

export async function getCodexStatus(): Promise<CodexStatus | { error: string }> {
  const binary = await resolveBinary('codex', 'TMUX_AGENT_CODEX_BIN');
  if (!binary) return { error: 'codex not installed' };
  const rpc = await getCodexStatusRPC(binary);
  if (rpc && !('error' in rpc)) return rpc as CodexStatus;
  const fallbackError = rpc && 'error' in rpc ? String(rpc.error) : null;
  const output = await runPtyCommand(binary, ['-s', 'read-only', '-a', 'untrusted'], '/status\n', {
    rows: 60,
    cols: 200,
    timeoutMs: 8000,
  });
  const clean = stripAnsi(output).trim();
  if (!clean) return fallbackError ? { error: fallbackError } : { error: 'codex status unavailable' };
  const lower = clean.toLowerCase();
  if (lower.includes('update available') && lower.includes('codex')) {
    return { error: 'codex update required' };
  }
  const lines = clean.split('\n');
  const creditsMatch = clean.match(/Credits:\s*([0-9][0-9.,]*)/i);
  const credits = creditsMatch ? Number(creditsMatch[1].replace(/,/g, '')) : undefined;
  const fiveLine =
    lines.find((line) => /5\s*h/i.test(line)) ||
    lines.find((line) => /5-hour/i.test(line)) ||
    lines.find((line) => /5 hour/i.test(line));
  const weekLine = lines.find((line) => /week/i.test(line));
  const session = fiveLine
    ? {
        percentLeft: percentLeftFromLine(fiveLine),
        reset: resetFromLine(fiveLine) ?? undefined,
      }
    : undefined;
  const weekly = weekLine
    ? {
        percentLeft: percentLeftFromLine(weekLine),
        reset: resetFromLine(weekLine) ?? undefined,
      }
    : undefined;
  const percentLines = lines.filter((line) => /\b\d{1,3}%\b/.test(line));
  if (session && !Number.isFinite(session.percentLeft) && percentLines[0]) {
    session.percentLeft = percentLeftFromLine(percentLines[0]);
  }
  if (weekly && !Number.isFinite(weekly.percentLeft) && percentLines[1]) {
    weekly.percentLeft = percentLeftFromLine(percentLines[1]);
  }
  if (!session?.percentLeft && !weekly?.percentLeft && rpc && 'error' in rpc) return rpc;
  return { session, weekly, credits, source: 'cli' };
}

type RpcPending = {
  resolve: (value: RpcResponse) => void;
  reject: (reason?: unknown) => void;
};

type RpcResponse = {
  id?: number;
  result?: unknown;
} & Record<string, unknown>;

type RpcState = {
  settled: boolean;
  pending: Map<number, RpcPending>;
  nextId: number;
};

function createRpcState(): RpcState {
  return {
    settled: false,
    pending: new Map<number, RpcPending>(),
    nextId: 1,
  };
}

function finishRpc(
  state: RpcState,
  result: CodexRpcResult | { error: string },
  proc: ReturnType<typeof spawn>,
  resolve: (value: CodexRpcResult | { error: string } | null) => void
): void {
  if (state.settled) return;
  state.settled = true;
  try {
    proc.kill();
  } catch {}
  resolve(result);
}

function sendRpc(proc: ReturnType<typeof spawn>, payload: Record<string, unknown>): void {
  try {
    if (proc.stdin) {
      proc.stdin.write(`${JSON.stringify(payload)}\n`);
    }
  } catch {}
}

function createRpcRequest(
  state: RpcState,
  proc: ReturnType<typeof spawn>
): (method: string, params?: Record<string, unknown>) => Promise<RpcResponse> {
  return (method: string, params?: Record<string, unknown>): Promise<RpcResponse> => {
    const id = state.nextId++;
    return new Promise<RpcResponse>((resolveReq, rejectReq) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        rejectReq(new Error('request timeout'));
      }, 5000);
      state.pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolveReq(msg);
        },
        reject: rejectReq,
      });
      sendRpc(proc, { id, method, params: params || {} });
    });
  };
}

function buildRateLimitResult(result: RateLimitsPayload): CodexRpcResult {
  const rateLimits = result.rateLimits || result;
  const primary = rateLimits.primary;
  const secondary = rateLimits.secondary;
  const credits = rateLimits.credits;
  
  const session = primary
    ? {
        percentLeft:
          typeof primary.usedPercent === 'number' ? Math.max(0, Math.round(100 - primary.usedPercent)) : undefined,
        reset:
          primary.resetsAt != null
            ? new Date(primary.resetsAt * 1000).toISOString()
            : undefined,
      }
    : undefined;
    
  const weekly = secondary
    ? {
        percentLeft:
          typeof secondary.usedPercent === 'number'
            ? Math.max(0, Math.round(100 - secondary.usedPercent))
            : undefined,
        reset:
          secondary.resetsAt != null
            ? new Date(secondary.resetsAt * 1000).toISOString()
            : undefined,
      }
    : undefined;
    
  const creditValue = credits?.balance != null ? Number(String(credits.balance).replace(/,/g, '')) : undefined;
  
  return {
    session,
    weekly,
    credits: Number.isFinite(creditValue) ? creditValue : undefined,
    source: 'rpc',
  };
}

async function executeRpcFlow(
  state: RpcState,
  proc: ReturnType<typeof spawn>,
  timeout: ReturnType<typeof setTimeout>,
  resolve: (value: CodexRpcResult | { error: string } | null) => void
): Promise<void> {
  const request = createRpcRequest(state, proc);
  
  try {
    await request('initialize', { clientInfo: { name: 'ter', version: '0.1' } });
    sendRpc(proc, { method: 'initialized', params: {} });
    const rateLimitsResponse = await request('account/rateLimits/read', {});
    const result = (rateLimitsResponse.result || rateLimitsResponse) as RateLimitsPayload;
    const rpcResult = buildRateLimitResult(result);
    clearTimeout(timeout);
    finishRpc(state, rpcResult, proc, resolve);
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : String(err ?? 'rpc failed');
    finishRpc(state, { error: `codex rpc failed: ${message}` }, proc, resolve);
  }
}

async function getCodexStatusRPC(binary: string): Promise<CodexRpcResult | { error: string } | null> {
  return new Promise<CodexRpcResult | { error: string } | null>((resolve) => {
    const state = createRpcState();

    const proc = spawn(binary, ['-s', 'read-only', '-a', 'untrusted', 'app-server'], {
      env: { ...process.env, PATH: process.env.PATH ?? '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timeout = setTimeout(() => finishRpc(state, { error: 'codex rpc timeout' }, proc, resolve), 7000);

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      let msg: RpcResponse | null = null;
      try {
        msg = JSON.parse(line) as RpcResponse;
      } catch {
        return;
      }
      if (msg && msg.id != null && state.pending.has(msg.id)) {
        const pendingReq = state.pending.get(msg.id);
        if (!pendingReq) return;
        state.pending.delete(msg.id);
        pendingReq.resolve(msg);
      }
    });

    proc.on('exit', () => {
      clearTimeout(timeout);
      finishRpc(state, { error: 'codex rpc closed' }, proc, resolve);
    });

    executeRpcFlow(state, proc, timeout, resolve).catch((err) => {
      const message = err instanceof Error ? err.message : String(err ?? 'rpc failed');
      finishRpc(state, { error: `codex rpc failed: ${message}` }, proc, resolve);
    });
  });
}

type TokenUsageSnapshot = {
  input_tokens?: unknown;
  cached_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  output_tokens?: unknown;
};

function dayFolder(date: Date): { year: string; month: string; day: string } {
  const year = `${date.getFullYear()}`;
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return { year, month, day };
}

async function listCodexFiles(root: string, days: number): Promise<string[]> {
  const files: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i += 1) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const { year, month, day } = dayFolder(date);
    const dir = path.join(root, year, month, day);
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.jsonl')) continue;
        files.push(path.join(dir, entry.name));
        if (files.length >= MAX_TOKEN_FILES) return files;
      }
    } catch {}
  }
  return files;
}

export async function getCodexTokenUsage(days = 7): Promise<TokenUsage | null> {
  const now = Date.now();
  if (tokenCache.codex.value && now - tokenCache.codex.ts < 60000) {
    return tokenCache.codex.value;
  }
  if (tokenCache.codex.inflight) {
    return tokenCache.codex.value;
  }
  const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), '.codex');
  const root = path.join(codexHome, 'sessions');
  try {
    await fs.promises.access(root);
  } catch {
    return null;
  }
  const files = await listCodexFiles(root, days);
  if (files.length === 0) return null;
  const totals = { input: 0, cached: 0, output: 0 };
  for (const filePath of files) {
    let previousTotals: { input: number; cached: number; output: number } | null = null;
    await scanJsonlFile(filePath, (line) => {
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }
      const payload = (obj.payload || obj) as Record<string, unknown>;
      const info = (payload.info || obj.info) as { total_token_usage?: unknown; last_token_usage?: unknown } | undefined;
      if (!info) return;
      const total = info.total_token_usage;
      const last = info.last_token_usage;
      const inputKey = (data: TokenUsageSnapshot | null | undefined) => data?.input_tokens;
      const cachedKey = (data: TokenUsageSnapshot | null | undefined) => data?.cached_input_tokens ?? data?.cache_read_input_tokens;
      const outputKey = (data: TokenUsageSnapshot | null | undefined) => data?.output_tokens;
      if (total) {
        const snapshot = total as TokenUsageSnapshot;
        const input = toInt(inputKey(snapshot));
        const cached = toInt(cachedKey(snapshot));
        const output = toInt(outputKey(snapshot));
        const prev = previousTotals || { input: 0, cached: 0, output: 0 };
        totals.input += Math.max(0, input - prev.input);
        totals.cached += Math.max(0, cached - prev.cached);
        totals.output += Math.max(0, output - prev.output);
        previousTotals = { input, cached, output };
        return;
      }
      if (last) {
        const snapshot = last as TokenUsageSnapshot;
        totals.input += Math.max(0, toInt(inputKey(snapshot)));
        totals.cached += Math.max(0, toInt(cachedKey(snapshot)));
        totals.output += Math.max(0, toInt(outputKey(snapshot)));
      }
    });
  }
  const result = {
    input: totals.input,
    cached: totals.cached,
    output: totals.output,
    total: totals.input + totals.output,
    periodDays: days,
    updatedAt: Date.now(),
    source: 'logs',
  };
  tokenCache.codex = { ts: now, value: result, inflight: null };
  return result;
}
