import NetInfo from '@react-native-community/netinfo';
import { probeHealth } from '@/lib/api';
import type { Host } from '@/lib/types';

const DEFAULT_PORT = 4020;
const DEFAULT_TIMEOUT_MS = 1200;
const DEFAULT_CONCURRENCY = 30;
const MAX_DERIVED_HOSTS = 512;

export type DiscoveredAgent = {
  ip: string;
  baseUrl: string;
  label: string;
  status: 'ok' | 'auth-required';
  tmuxVersion?: string;
};

export type DiscoveryResult = {
  results: DiscoveredAgent[];
  error?: string;
};

type ScanOptions = {
  hosts: Host[];
  port?: number;
  timeoutMs?: number;
  concurrency?: number;
};

function parseIPv4(value: string): number | null {
  const parts = value.trim().split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return null;
  return (((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0) || 0;
}

function formatIPv4(value: number): string {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.');
}

function buildExistingHostSet(hosts: Host[]): Set<string> {
  const set = new Set<string>();
  hosts.forEach((host) => {
    try {
      const url = new URL(host.baseUrl);
      const port = url.port || (url.protocol === 'https:' ? '443' : '80');
      set.add(`${url.hostname}:${port}`);
    } catch {}
  });
  return set;
}

function deriveTargets(ipAddress: string, subnet?: string): string[] {
  const ip = parseIPv4(ipAddress);
  if (!ip) return [];

  const subnetValue = subnet ? parseIPv4(subnet) : null;
  let mask = subnetValue;
  let derivedHosts = 0;
  if (subnetValue !== null) {
    const network = ip & subnetValue;
    const broadcast = network | (~subnetValue >>> 0);
    const start = network + 1;
    const end = broadcast - 1;
    derivedHosts = end >= start ? end - start + 1 : 0;
  }

  if (!mask || derivedHosts === 0 || derivedHosts > MAX_DERIVED_HOSTS) {
    mask = 0xffffff00;
  }

  const network = ip & mask;
  const broadcast = network | (~mask >>> 0);
  const start = network + 1;
  const end = broadcast - 1;
  if (end < start) return [];

  const targets: string[] = [];
  for (let current = start; current <= end; current += 1) {
    if (current === ip) continue;
    targets.push(formatIPv4(current >>> 0));
  }
  return targets;
}

export async function scanForAgents({
  hosts,
  port = DEFAULT_PORT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  concurrency = DEFAULT_CONCURRENCY,
}: ScanOptions): Promise<DiscoveryResult> {
  const state = await NetInfo.fetch();
  if (!state.isConnected || state.type !== 'wifi') {
    return { results: [], error: 'Connect to Wi-Fi to scan the local network.' };
  }

  const details = state.details as { ipAddress?: string; subnet?: string } | null;
  const ipAddress = details?.ipAddress;
  if (!ipAddress) {
    return { results: [], error: 'Local network info unavailable in this build.' };
  }

  const targets = deriveTargets(ipAddress, details?.subnet);
  if (targets.length === 0) {
    return { results: [], error: 'Unable to derive local network range.' };
  }

  const existing = buildExistingHostSet(hosts);
  const queue = targets.filter((ip) => !existing.has(`${ip}:${port}`));
  if (queue.length === 0) {
    return { results: [], error: 'All local agents are already added.' };
  }

  const results: DiscoveredAgent[] = [];
  const maxWorkers = Math.min(concurrency, queue.length);
  let index = 0;

  const workers = Array.from({ length: maxWorkers }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= queue.length) return;
      const ip = queue[current];
      const baseUrl = `http://${ip}:${port}`;
      const probe = await probeHealth(baseUrl, undefined, timeoutMs);
      if (probe.status === 'ok') {
        results.push({
          ip,
          baseUrl,
          label: probe.payload.host || ip,
          status: 'ok',
          tmuxVersion: probe.payload.tmuxVersion,
        });
        continue;
      }
      if (probe.status === 'unauthorized') {
        results.push({
          ip,
          baseUrl,
          label: ip,
          status: 'auth-required',
        });
      }
    }
  });

  await Promise.all(workers);
  results.sort((a, b) => a.ip.localeCompare(b.ip));
  return { results };
}
