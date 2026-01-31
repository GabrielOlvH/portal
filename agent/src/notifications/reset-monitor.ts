import type { UsageSnapshot, ProviderUsage, UsageWindow } from '../state';
import { getUsageSnapshot } from '../usage';
import { listNotificationDevices } from './registry';
import { sendExpoPushMessages, type ExpoPushMessage } from './push';
import { HOST_LABEL, RESET_NOTIFY_THRESHOLD } from '../config';

type WindowType = 'session' | 'weekly';
type ResetKey = `${string}:${WindowType}`;

type ResetEvent = {
  provider: string;
  window: WindowType;
  previousPercent: number;
  currentPercent: number;
};

const lastResets = new Map<ResetKey, string>();
const lastPercents = new Map<ResetKey, number>();
const lastNotified = new Map<ResetKey, number>();
let inflight: Promise<void> | null = null;

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours between notifications for same provider/window

function makeKey(provider: string, window: WindowType): ResetKey {
  return `${provider}:${window}`;
}

function detectWindowReset(
  provider: string,
  windowType: WindowType,
  window: UsageWindow | undefined
): ResetEvent | null {
  if (!window) return null;

  // Only notify on weekly resets - session resets are too frequent
  if (windowType !== 'weekly') return null;

  const key = makeKey(provider, windowType);
  const currentPercent = window.percentLeft ?? 100;
  const currentReset = window.reset;

  const previousPercent = lastPercents.get(key);
  const previousReset = lastResets.get(key);

  // Update tracking state
  if (currentReset) {
    lastResets.set(key, currentReset);
  }
  lastPercents.set(key, currentPercent);

  // First poll - no notification
  if (previousPercent === undefined) {
    return null;
  }

  // Check cooldown - don't spam same provider/window
  const lastNotifiedAt = lastNotified.get(key);
  if (lastNotifiedAt && Date.now() - lastNotifiedAt < COOLDOWN_MS) {
    return null;
  }

  // Detect reset: percent jumped significantly (from low to high)
  // Using 30% jump to avoid false positives from API fluctuations
  const percentJumpedUp = currentPercent > previousPercent + 30;

  // Only notify if:
  // - Significant percent increase detected
  // - Previous usage was below threshold (user was actually constrained)
  // - Current percent is high (actually reset, not just fluctuation)
  const wasConstrained = previousPercent < RESET_NOTIFY_THRESHOLD;
  const isNowAvailable = currentPercent >= 80;

  if (percentJumpedUp && wasConstrained && isNowAvailable) {
    lastNotified.set(key, Date.now());
    return {
      provider,
      window: windowType,
      previousPercent,
      currentPercent,
    };
  }

  return null;
}

function detectProviderResets(provider: string, usage: ProviderUsage | undefined): ResetEvent[] {
  if (!usage || usage.error) return [];

  const events: ResetEvent[] = [];

  const sessionReset = detectWindowReset(provider, 'session', usage.session);
  if (sessionReset) events.push(sessionReset);

  const weeklyReset = detectWindowReset(provider, 'weekly', usage.weekly);
  if (weeklyReset) events.push(weeklyReset);

  return events;
}

async function detectResets(): Promise<ResetEvent[]> {
  const snapshot = await getUsageSnapshot();
  const events: ResetEvent[] = [];

  const providers: (keyof Omit<UsageSnapshot, 'meta'>)[] = ['claude', 'codex', 'copilot', 'cursor'];

  for (const provider of providers) {
    const usage = snapshot[provider];
    events.push(...detectProviderResets(provider, usage));
  }

  return events;
}

function formatProviderName(provider: string): string {
  const names: Record<string, string> = {
    claude: 'Claude',
    codex: 'Codex',
    copilot: 'Copilot',
    cursor: 'Cursor',
  };
  return names[provider] || provider;
}

function buildResetMessages(
  events: ResetEvent[],
  devices: { expoPushToken: string }[]
): ExpoPushMessage[] {
  const messages: ExpoPushMessage[] = [];

  for (const event of events) {
    const providerName = formatProviderName(event.provider);
    const windowLabel = event.window === 'session' ? 'session' : 'weekly';

    const title = event.window === 'weekly' ? 'Weekly Limit Reset' : 'Usage Reset';
    const body = `${providerName} ${windowLabel} limit reset - ${event.currentPercent}% capacity available`;

    for (const device of devices) {
      messages.push({
        to: device.expoPushToken,
        title,
        body,
        sound: 'default',
        channelId: 'usage-resets',
        data: {
          type: 'usage-reset',
          provider: event.provider,
          window: event.window,
          percentLeft: event.currentPercent,
          host: HOST_LABEL,
        },
      });
    }
  }

  return messages;
}

async function pollOnce(): Promise<void> {
  const devices = await listNotificationDevices();
  if (devices.length === 0) return;

  const events = await detectResets();
  if (events.length === 0) return;

  const messages = buildResetMessages(events, devices);
  if (messages.length > 0) {
    await sendExpoPushMessages(messages);
  }
}

export function startResetMonitor(): void {
  if (inflight) return;
  inflight = pollOnce()
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
}

// Export for testing
export const _testing = {
  detectWindowReset,
  detectProviderResets,
  buildResetMessages,
  lastResets,
  lastPercents,
  lastNotified,
  clearState: () => {
    lastResets.clear();
    lastPercents.clear();
    lastNotified.clear();
  },
};
