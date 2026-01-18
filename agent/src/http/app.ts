import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { TOKEN } from '../config';
import { registerCopilotRoutes } from './routes/copilot';
import { registerCoreRoutes } from './routes/core';
import { registerDockerRoutes } from './routes/docker';
import { registerFileRoutes } from './routes/files';
import { registerNotificationRoutes } from './routes/notifications';
import { registerPortRoutes } from './routes/ports';
import { registerSessionRoutes } from './routes/sessions';
import { registerUpdateRoutes } from './routes/update';

export function buildApp() {
  const app = new Hono();

  app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));

  app.use('*', async (c, next) => {
    if (!TOKEN) return next();
    const header = c.req.header('authorization') || c.req.header('x-api-key') || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (token !== TOKEN) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return next();
  });

  registerCoreRoutes(app);
  registerDockerRoutes(app);
  registerFileRoutes(app);
  registerNotificationRoutes(app);
  registerPortRoutes(app);
  registerSessionRoutes(app);
  registerUpdateRoutes(app);
  registerCopilotRoutes(app);

  return app;
}

