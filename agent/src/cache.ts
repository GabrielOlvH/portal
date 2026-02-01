import type { CacheEntry } from './state';

export function shouldRefresh<T>(cache: CacheEntry<T>, intervalMs: number): boolean {
  if (!cache.value) return true;
  return Date.now() - cache.ts > intervalMs;
}

export function snapshot<T>(cache: CacheEntry<T>): T | undefined {
  return cache.value ?? undefined;
}
