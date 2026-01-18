import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function jsonError(
  c: Context,
  err: unknown,
  status: ContentfulStatusCode = 500,
  extra?: Record<string, unknown>
) {
  const message = err instanceof Error ? err.message : String(err);
  return c.json({ ...extra, error: message }, status);
}

