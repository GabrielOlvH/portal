import type { Hono } from 'hono';
import { HOST_LABEL } from '../../config';
import { getHostInfo } from '../../host';
import { runTmux } from '../../tmux';
import { getUsageSnapshot } from '../../usage';
import { jsonError } from '../errors';

export function registerCoreRoutes(app: Hono): void {
  app.get('/health', async (c) => {
    const tmuxVersion = await runTmux(['-V']).catch(() => 'unknown');
    return c.json({ ok: true, host: HOST_LABEL, tmuxVersion });
  });

  app.get('/host', (c) => {
    try {
      return c.json(getHostInfo());
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.get('/usage', async (c) => {
    try {
      const usage = await getUsageSnapshot();
      return c.json(usage);
    } catch (err) {
      return jsonError(c, err);
    }
  });
}

