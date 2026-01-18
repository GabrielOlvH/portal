import type { Hono } from 'hono';
import { getStoredToken, storeToken, clearToken } from '../../copilot';
import { startDeviceFlow, pollForToken, type DeviceFlowSession } from '../../copilot-oauth';
import { jsonError } from '../errors';

let activeDeviceSession: DeviceFlowSession | null = null;

export function registerCopilotRoutes(app: Hono): void {
  app.post('/copilot/auth/start', async (c) => {
    try {
      const result = await startDeviceFlow();
      if (!result.success) {
        return c.json({ error: (result as { success: false; error: string }).error }, 400);
      }
      activeDeviceSession = result.session;
      return c.json({
        userCode: result.session.userCode,
        verificationUri: result.session.verificationUri,
        expiresIn: Math.floor((result.session.expiresAt - Date.now()) / 1000),
        interval: result.session.interval,
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.get('/copilot/auth/poll', async (c) => {
    try {
      if (!activeDeviceSession) {
        return c.json({ error: 'No active device flow session. Call /copilot/auth/start first.' }, 400);
      }

      const remainingMs = activeDeviceSession.expiresAt - Date.now();
      if (remainingMs <= 0) {
        activeDeviceSession = null;
        return c.json({ status: 'expired', error: 'Device code has expired. Please restart authentication.' });
      }

      const result = await pollForToken({
        deviceCode: activeDeviceSession.deviceCode,
        expiresIn: Math.ceil(remainingMs / 1000),
        initialInterval: activeDeviceSession.interval,
      });

      if (result.success) {
        await storeToken(result.token.access_token);
        activeDeviceSession = null;
        return c.json({ status: 'success', token: result.token.access_token });
      }

      const errorMsg = (result as { success: false; error: string }).error;
      if (errorMsg.includes('authorization_pending') || errorMsg.includes('Polling timed out')) {
        return c.json({ status: 'pending' });
      }

      activeDeviceSession = null;
      return c.json({ status: 'expired', error: errorMsg });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.delete('/copilot/auth', async (c) => {
    try {
      await clearToken();
      activeDeviceSession = null;
      return c.json({ ok: true });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.get('/copilot/auth/status', (c) => {
    try {
      const token = getStoredToken();
      if (!token) {
        return c.json({ authenticated: false });
      }
      return c.json({ authenticated: true });
    } catch (err) {
      return jsonError(c, err, 500, { authenticated: false });
    }
  });
}

