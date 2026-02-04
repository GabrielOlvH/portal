import { Platform } from 'react-native';

// Notifee is Android-only, lazy load to avoid iOS issues
type NotifeeModule = {
  createChannel(channel: {
    id: string;
    name: string;
    importance: number;
  }): Promise<string>;
  displayNotification(notification: {
    id?: string;
    title?: string;
    body?: string;
    android?: {
      channelId: string;
      ongoing?: boolean;
      onlyAlertOnce?: boolean;
      smallIcon?: string;
      pressAction?: { id: string };
    };
  }): Promise<string>;
  cancelNotification(notificationId: string): Promise<void>;
};

// Android notification importance levels (from notifee)
const IMPORTANCE_HIGH = 4;

const CHANNEL_ID = 'task-updates';
const NOTIFICATION_ID = 'task-ongoing';

let moduleCache: NotifeeModule | null | undefined;
let channelReady = false;

function getNotifee(): NotifeeModule | null {
  if (Platform.OS !== 'android') return null;
  if (moduleCache !== undefined) return moduleCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@notifee/react-native');
    moduleCache = mod.default as NotifeeModule;
  } catch (error) {
    console.warn('[OngoingNotifications] Failed to load notifee module:', error);
    moduleCache = null;
  }
  return moduleCache;
}

async function ensureChannel(notifee: NotifeeModule): Promise<string> {
  if (channelReady) return CHANNEL_ID;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Task updates',
    importance: IMPORTANCE_HIGH,
  });
  channelReady = true;
  return CHANNEL_ID;
}

export async function updateOngoingNotification(title: string, body: string): Promise<void> {
  const notifee = getNotifee();
  if (!notifee) return;
  const channelId = await ensureChannel(notifee);
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title,
    body,
    android: {
      channelId,
      ongoing: true,
      onlyAlertOnce: true,
      smallIcon: 'ic_launcher',
      pressAction: { id: 'default' },
    },
  });
}

export async function clearOngoingNotification(): Promise<void> {
  const notifee = getNotifee();
  if (!notifee) return;
  await notifee.cancelNotification(NOTIFICATION_ID);
}
