import type { Hono } from 'hono';
import { killProcesses, listPorts } from '../../ports';
import { jsonError } from '../errors';

export function registerPortRoutes(app: Hono): void {
  app.get('/ports', async (c) => {
    try {
      const ports = await listPorts();
      return c.json({ ports });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.post('/ports/kill', async (c) => {
    try {
      const body = (await c.req.json()) as { pids?: unknown };
      if (!Array.isArray(body.pids) || body.pids.length === 0) {
        return c.json({ error: 'pids array is required' }, 400);
      }
      const pids = body.pids
        .map((p) => Number(p))
        .filter((p) => Number.isFinite(p) && p > 0);
      if (pids.length === 0) {
        return c.json({ error: 'No valid PIDs provided' }, 400);
      }
      const result = await killProcesses(pids);
      return c.json(result);
    } catch (err) {
      return jsonError(c, err);
    }
  });
}

