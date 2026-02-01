import type { Hono } from 'hono';
import { createTunnel, listTunnels, closeTunnel, TunnelCreate } from '../../tunnels';
import { jsonError } from '../errors';

export function registerTunnelRoutes(app: Hono) {
  app.get('/tunnels', (c) => {
    try {
      const tunnels = listTunnels();
      return c.json({ tunnels });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.post('/tunnels', async (c) => {
    try {
      const body = await c.req.json<Partial<TunnelCreate>>();

      if (!body.listenPort || typeof body.listenPort !== 'number') {
        return c.json({ error: 'listenPort is required and must be a number' }, 400);
      }
      if (!body.targetPort || typeof body.targetPort !== 'number') {
        return c.json({ error: 'targetPort is required and must be a number' }, 400);
      }
      if (!body.targetHost || typeof body.targetHost !== 'string') {
        return c.json({ error: 'targetHost is required' }, 400);
      }

      const config: TunnelCreate = {
        listenPort: body.listenPort,
        targetHost: body.targetHost,
        targetPort: body.targetPort,
      };

      const tunnel = await createTunnel(config);
      return c.json({ tunnel }, 201);
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.delete('/tunnels/:id', (c) => {
    try {
      const id = c.req.param('id');
      if (!id) {
        return c.json({ error: 'Tunnel ID is required' }, 400);
      }

      const result = closeTunnel(id);
      if (!result.success) {
        return c.json({ error: result.error || 'Failed to close tunnel' }, 404);
      }

      return c.json({ ok: true });
    } catch (err) {
      return jsonError(c, err);
    }
  });
}
