import 'dotenv/config';
import { startServer } from './server';
import { NOTIFICATION_POLL_INTERVAL, USAGE_POLL_INTERVAL, TOKEN_POLL_INTERVAL } from './config';
import { startUsageRefresh, primeTokenRefresh } from './usage';
import { claudeSession } from './state';
import { logStartup } from './log';
import { startPauseMonitor } from './notifications/pause-monitor';

startServer();
logStartup();

if (USAGE_POLL_INTERVAL > 0) {
  startUsageRefresh();
  setInterval(() => {
    startUsageRefresh();
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
    primeTokenRefresh();
  }, TOKEN_POLL_INTERVAL);
}

if (NOTIFICATION_POLL_INTERVAL > 0) {
  startPauseMonitor();
  setInterval(() => {
    startPauseMonitor();
  }, NOTIFICATION_POLL_INTERVAL);
}
