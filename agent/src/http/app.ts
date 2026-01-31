import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { TOKEN } from '../config';
import { registerAiSessionRoutes } from './routes/ai-sessions';
import { registerCopilotRoutes } from './routes/copilot';
import { registerCoreRoutes } from './routes/core';
import { registerDockerRoutes } from './routes/docker';
import { registerFileRoutes } from './routes/files';
import { registerGitHubRoutes } from './routes/github';
import { registerNotificationRoutes } from './routes/notifications';
import { registerPortRoutes } from './routes/ports';
import { registerSessionRoutes } from './routes/sessions';
import { registerTunnelRoutes } from './routes/tunnels';
import { registerSystemRoutes } from './routes/system';
import { registerUpdateRoutes } from './routes/update';

export function buildApp() {
  const app = new Hono();

  app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));

  app.use('*', async (c, next) => {
    if (!TOKEN) return next();
    // Check header first, then query param (for SSE)
    const header = c.req.header('authorization') || c.req.header('x-api-key') || '';
    const queryToken = c.req.query('token') || '';
    const token = header.replace(/^Bearer\s+/i, '').trim() || queryToken;
    if (token !== TOKEN) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return next();
  });

  registerAiSessionRoutes(app);
  registerCoreRoutes(app);
  registerDockerRoutes(app);
  registerFileRoutes(app);
  registerGitHubRoutes(app);
  registerNotificationRoutes(app);
  registerPortRoutes(app);
  registerSessionRoutes(app);
  registerTunnelRoutes(app);
  registerSystemRoutes(app);
  registerUpdateRoutes(app);
  registerCopilotRoutes(app);

  return app;
}
