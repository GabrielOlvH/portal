import 'dotenv/config';
import { startServer } from './server';
import { NOTIFICATION_POLL_INTERVAL, USAGE_POLL_INTERVAL, TOKEN_POLL_INTERVAL, RESET_MONITOR_INTERVAL } from './config';
import { startUsageRefresh, primeTokenRefresh } from './usage';
import { claudeSession } from './state';
import { logStartup } from './log';
import { startPauseMonitor } from './notifications/pause-monitor';
import { startResetMonitor } from './notifications/reset-monitor';
import { startHealthMonitoring } from './service/health';

startServer();
logStartup();
startHealthMonitoring();

if (USAGE_POLL_INTERVAL > 0) {
  startUsageRefresh();
  setInterval(() => {
    try {
      startUsageRefresh();
    } catch (error) {
      console.error('[Agent] Failed to refresh usage:', error);
    }
  }, USAGE_POLL_INTERVAL);
}

process.on('exit', () => {
  for (const cleanup of claudeSession.listeners) {
    try {
      cleanup();
    } catch {}
  }
  claudeSession.listeners.clear();
  try {
    claudeSession.term?.kill();
  } catch {}
});

if (TOKEN_POLL_INTERVAL > 0) {
  primeTokenRefresh();
  setInterval(() => {
    try {
      primeTokenRefresh();
    } catch (error) {
      console.error('[Agent] Failed to refresh token:', error);
    }
  }, TOKEN_POLL_INTERVAL);
}

if (NOTIFICATION_POLL_INTERVAL > 0) {
  startPauseMonitor();
  setInterval(() => {
    try {
      startPauseMonitor();
    } catch (error) {
      console.error('[Agent] Failed to run pause monitor:', error);
    }
  }, NOTIFICATION_POLL_INTERVAL);
}

if (RESET_MONITOR_INTERVAL > 0) {
  startResetMonitor();
  setInterval(() => {
    try {
      startResetMonitor();
    } catch (error) {
      console.error('[Agent] Failed to run reset monitor:', error);
    }
  }, RESET_MONITOR_INTERVAL);
}
