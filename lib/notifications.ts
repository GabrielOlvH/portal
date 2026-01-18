import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerNotificationDevice, unregisterNotificationDevice } from '@/lib/api';
import { createId } from '@/lib/defaults';
import type { Host } from '@/lib/types';

const DEVICE_ID_KEY = 'tmux.notifications.deviceId.v1';
const REGISTRY_KEY = 'tmux.notifications.registry.v1';
const CHANNEL_ID = 'task-updates';

type RegistrationRegistry = Record<string, string>;

let handlerConfigured = false;

function getProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

async function ensureNotificationHandler() {
  if (handlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  handlerConfigured = true;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Task updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#59A6FF',
    sound: 'default',
  });
}

async function loadRegistry(): Promise<RegistrationRegistry> {
  const raw = await AsyncStorage.getItem(REGISTRY_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as RegistrationRegistry;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveRegistry(next: RegistrationRegistry): Promise<void> {
  await AsyncStorage.setItem(REGISTRY_KEY, JSON.stringify(next));
}

async function getOrCreateDeviceId(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const next = createId('device');
  await AsyncStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

export type NotificationSetup = {
  status: Notifications.PermissionStatus;
  deviceId: string | null;
  expoPushToken: string | null;
};

export async function setupNotifications(): Promise<NotificationSetup> {
  await ensureNotificationHandler();
  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    return { status, deviceId: null, expoPushToken: null };
  }

  if (!Device.isDevice) {
    return { status, deviceId: null, expoPushToken: null };
  }

  let expoPushToken: string | null = null;
  try {
    const projectId = getProjectId();
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    expoPushToken = token.data;
  } catch {
    expoPushToken = null;
  }

  const deviceId = await getOrCreateDeviceId();
  return { status, deviceId, expoPushToken };
}

export async function registerNotificationsForHosts(hosts: Host[]): Promise<void> {
  if (hosts.length === 0) return;
  const { status, deviceId, expoPushToken } = await setupNotifications();
  if (status !== 'granted' || !deviceId || !expoPushToken) return;

  const registry = await loadRegistry();
  const hostIds = new Set(hosts.map((host) => host.id));
  const nextRegistry: RegistrationRegistry = {};

  for (const [id, token] of Object.entries(registry)) {
    if (hostIds.has(id)) nextRegistry[id] = token;
  }

  await Promise.all(
    hosts.map(async (host) => {
      if (nextRegistry[host.id] === expoPushToken) return;
      try {
        await registerNotificationDevice(host, {
          deviceId,
          expoPushToken,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
        });
        nextRegistry[host.id] = expoPushToken;
      } catch {}
    })
  );

  await saveRegistry(nextRegistry);
}

export async function unregisterNotificationsForHosts(hosts: Host[]): Promise<void> {
  if (hosts.length === 0) return;
  const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) return;
  const registry = await loadRegistry();
  const hostIds = new Set(hosts.map((host) => host.id));
  const nextRegistry: RegistrationRegistry = {};

  await Promise.all(
    hosts.map(async (host) => {
      try {
        await unregisterNotificationDevice(host, deviceId);
      } catch {}
    })
  );

  for (const [id, token] of Object.entries(registry)) {
    if (!hostIds.has(id)) nextRegistry[id] = token;
  }

  await saveRegistry(nextRegistry);
}

export type TestNotificationResult =
  | { status: 'success'; id: string }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export async function sendTestNotification(): Promise<TestNotificationResult> {
  try {
    await ensureNotificationHandler();
    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') {
      return { status: 'denied' };
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Bridge',
        body: 'Notifications are working on this device.',
        channelId: CHANNEL_ID,
        sound: 'default',
      },
      trigger: null,
    });

    return { status: 'success', id };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Unable to send test notification.',
    };
  }
}
