import { Platform } from 'react-native';

type NotifeeModule = typeof import('@notifee/react-native');

const CHANNEL_ID = 'task-updates';
const NOTIFICATION_ID = 'task-ongoing';

let moduleCache: NotifeeModule | null | undefined;
let channelReady = false;

function getNotifee(): NotifeeModule | null {
  if (Platform.OS !== 'android') return null;
  if (moduleCache !== undefined) return moduleCache;
  try {
    moduleCache = require('@notifee/react-native') as NotifeeModule;
  } catch {
    moduleCache = null;
  }
  return moduleCache;
}

async function ensureChannel(notifee: NotifeeModule): Promise<string> {
  if (channelReady) return CHANNEL_ID;
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Task updates',
    importance: notifee.AndroidImportance.HIGH,
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
