import type { Hono } from 'hono';
import type { Context } from 'hono';
import { stream } from 'hono/streaming';
import { getServiceStatus, getServiceInfo, getServiceLogs, restartService } from '../../service/manager';
import { getHealthStatus, getCachedHealthStatus, checkForUpdates, type UpdateInfo } from '../../service/health';
import { applyUpdate, isUpdateInProgress, type UpdateEvent } from '../../service/updater';
import { jsonError } from '../errors';

// Store active SSE connections for update streaming
const activeUpdateStreams = new Map<string, (event: UpdateEvent) => void>();

export function registerSystemRoutes(app: Hono) {
  // Public health endpoint - no auth required
  app.get('/health', async (c) => {
    try {
      const health = await getHealthStatus();
      return c.json(health);
    } catch (err) {
      return jsonError(c, err, 500, { status: 'unhealthy' });
    }
  });

  // System status - includes health, service info, and update status
  app.get('/system/status', async (c) => {
    try {
      const [serviceStatus, serviceInfo, health] = await Promise.all([
        getServiceStatus(),
        getServiceInfo(),
        getHealthStatus(),
      ]);

      return c.json({
        service: serviceStatus,
        info: serviceInfo,
        health: health,
        updateInProgress: isUpdateInProgress(),
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  // Service logs
  app.get('/system/logs', async (c) => {
    try {
      const linesParam = c.req.query('lines');
      const lines = linesParam ? parseInt(linesParam, 10) : 100;

      if (isNaN(lines) || lines < 1 || lines > 10000) {
        return c.json({ error: 'lines must be between 1 and 10000' }, 400);
      }

      const logs = await getServiceLogs(lines);
      return c.json({ lines, logs });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  // Restart service
  app.post('/system/restart', async (c) => {
    try {
      const result = await restartService();
      if (!result.success) {
        return c.json(result, 400);
      }
      return c.json(result);
    } catch (err) {
      return jsonError(c, err);
    }
  });

  // Trigger update check
  app.post('/system/update/check', async (c) => {
    try {
      const updateInfo = await checkForUpdates();
      if (!updateInfo) {
        return c.json({ error: 'Failed to check for updates' }, 500);
      }
      return c.json(updateInfo);
    } catch (err) {
      return jsonError(c, err);
    }
  });

  // Trigger update (returns immediately, use SSE for progress)
  app.post('/system/update', async (c) => {
    try {
      if (isUpdateInProgress()) {
        return c.json({ 
          success: false, 
          message: 'Update already in progress',
          updateId: '' 
        }, 409);
      }

      // Generate update ID and start update in background
      const updateId = crypto.randomUUID();
      
      // Start update process in background
      setImmediate(() => {
        const progressCallback = (event: UpdateEvent) => {
          // Notify all connected SSE clients
          activeUpdateStreams.forEach((callback) => {
            callback(event);
          });
        };

        applyUpdate(progressCallback);
      });

      return c.json({
        success: true,
        message: 'Update started',
        updateId,
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  // SSE endpoint for update progress
  app.get('/system/update/stream', async (c) => {
    const updateId = c.req.query('id');
    
    if (!updateId) {
      return c.json({ error: 'Missing update ID. Use ?id=<updateId>' }, 400);
    }

    if (!isUpdateInProgress()) {
      // Check if we have cached health with update info
      const health = getCachedHealthStatus();
      if (health?.lastUpdateAttempt && health.lastUpdateAttempt.updateId === updateId) {
        // Return the final status
        return stream(c, async (stream) => {
          const attempt = health.lastUpdateAttempt!;
          const event: UpdateEvent = {
            type: attempt.status === 'success' ? 'complete' : attempt.status === 'rollback' ? 'rollback' : 'error',
            message: attempt.status === 'success' ? 'Update completed' : attempt.error || 'Update failed',
            updateId,
            progress: 100,
            error: attempt.error,
          };
          
          await stream.write(`data: ${JSON.stringify(event)}\n\n`);
          await stream.close();
        });
      }
      
      return c.json({ error: 'No update in progress with that ID' }, 404);
    }

    return stream(c, async (stream) => {
      // Register this stream
      const streamCallback = (event: UpdateEvent) => {
        stream.write(`data: ${JSON.stringify(event)}\n\n`).catch(() => {
          // Stream closed, remove callback
          activeUpdateStreams.delete(updateId);
        });
      };

      activeUpdateStreams.set(updateId, streamCallback);

      // Send initial event
      const initialEvent: UpdateEvent = {
        type: 'start',
        message: 'Connected to update stream',
        updateId,
        progress: 0,
      };
      await stream.write(`data: ${JSON.stringify(initialEvent)}\n\n`);

      // Keep connection alive until update completes or client disconnects
      // Check every second if update is still in progress
      const checkInterval = setInterval(() => {
        if (!isUpdateInProgress()) {
          clearInterval(checkInterval);
          activeUpdateStreams.delete(updateId);
          // Give a moment for final events to be sent
          setTimeout(() => {
            stream.close().catch(() => {
              // Ignore close errors
            });
          }, 1000);
        }
      }, 1000);

      // Handle client disconnect
      c.req.raw.signal.addEventListener('abort', () => {
        clearInterval(checkInterval);
        activeUpdateStreams.delete(updateId);
      });

      // Keep the stream open
      while (isUpdateInProgress() && !c.req.raw.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    });
  });

  // Get update status (poll-based alternative to SSE)
  app.get('/system/update/status', async (c) => {
    try {
      const health = getCachedHealthStatus();
      
      return c.json({
        inProgress: isUpdateInProgress(),
        lastAttempt: health?.lastUpdateAttempt || null,
        updateAvailable: health?.update.available || false,
        currentVersion: health?.update.currentVersion || 'unknown',
        latestVersion: health?.update.latestVersion || 'unknown',
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });
}
