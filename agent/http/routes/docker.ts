import type { Hono } from 'hono';
import { getDockerSnapshot, runDockerContainerAction } from '../../docker';
import { jsonError } from '../errors';

export function registerDockerRoutes(app: Hono): void {
  app.get('/docker', async (c) => {
    try {
      const snapshot = await getDockerSnapshot();
      return c.json(snapshot);
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.post('/docker/containers/:id/:action', async (c) => {
    try {
      const id = c.req.param('id');
      const action = c.req.param('action');
      if (!id || !action) {
        return c.json({ error: 'container id and action are required' }, 400);
      }
      await runDockerContainerAction(id, action);
      return c.json({ ok: true });
    } catch (err) {
      return jsonError(c, err, 400);
    }
  });
}

