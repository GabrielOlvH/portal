import type { Hono } from 'hono';
import { jsonError } from '../errors';
import {
  listNotificationDevices,
  removeNotificationDevice,
  upsertNotificationDevice,
} from '../../notifications/registry';
import { sendExpoPushMessages } from '../../notifications/push';

type RegistrationPayload = {
  deviceId?: string;
  expoPushToken?: string;
  platform?: string;
};

export function registerNotificationRoutes(app: Hono) {
  app.post('/notifications/register', async (c) => {
    try {
      const payload = await c.req.json<RegistrationPayload>();
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
      const payload = await c.req.json<{ deviceId?: string }>();
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

  app.post('/notifications/test', async (c) => {
    try {
      const payload = await c.req.json<{ title?: string; body?: string }>();
      const devices = await listNotificationDevices();
      const title = payload?.title?.trim() ?? 'Bridge';
      const body = payload?.body?.trim() ?? 'Test push notification';
      const messages = devices.map((device) => ({
        to: device.expoPushToken,
        title,
        body,
        sound: 'default' as const,
        channelId: 'task-updates',
        data: { type: 'test-push' },
      }));

      if (messages.length > 0) {
        await sendExpoPushMessages(messages);
      }

      return c.json({ ok: true, count: messages.length });
    } catch (err) {
      return jsonError(c, err);
    }
  });
}
