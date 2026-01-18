import type { Context } from 'hono';

export function jsonError(
  c: Context,
  err: unknown,
  status = 500,
  extra: Record<string, unknown> = {}
): Response {
  const message = err instanceof Error ? err.message : String(err);
  return c.json({ ...extra, error: message }, status);
}

