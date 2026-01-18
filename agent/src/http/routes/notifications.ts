import type { Hono } from 'hono';
import { jsonError } from '../errors';
import {
  listNotificationDevices,
  removeNotificationDevice,
  upsertNotificationDevice,
} from '../../notifications/registry';

type RegistrationPayload = {
  deviceId?: string;
  expoPushToken?: string;
  platform?: string;
};

export function registerNotificationRoutes(app: Hono) {
  app.post('/notifications/register', async (c) => {
    try {
      const payload = (await c.req.json()) as RegistrationPayload;
      const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId.trim() : '';
      const expoPushToken =
        typeof payload.expoPushToken === 'string' ? payload.expoPushToken.trim() : '';
      const platform = payload.platform === 'ios' || payload.platform === 'android' ? payload.platform : null;

      if (!deviceId || !expoPushToken || !platform) {
        return c.json({ ok: false, error: 'deviceId, expoPushToken, platform required' }, 400);
      }

      const entry = await upsertNotificationDevice({ deviceId, expoPushToken, platform });
      return c.json({ ok: true, device: entry });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.delete('/notifications/register', async (c) => {
    try {
      const payload = (await c.req.json()) as { deviceId?: string };
      const deviceId = typeof payload.deviceId === 'string' ? payload.deviceId.trim() : '';
      if (!deviceId) {
        return c.json({ ok: false, error: 'deviceId required' }, 400);
      }
      const removed = await removeNotificationDevice(deviceId);
      return c.json({ ok: removed });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.get('/notifications/register', async (c) => {
    try {
      const devices = await listNotificationDevices();
      return c.json({ ok: true, devices });
    } catch (err) {
      return jsonError(c, err);
    }
  });
}
