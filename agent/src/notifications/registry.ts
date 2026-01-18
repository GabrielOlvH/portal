import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type NotificationDevice = {
  deviceId: string;
  expoPushToken: string;
  platform: 'ios' | 'android';
  updatedAt: number;
};

const REGISTRY_PATH = path.join(os.homedir(), '.tmux-agent', 'notifications', 'devices.json');

type RegistryMap = Record<string, NotificationDevice>;

async function loadRegistry(): Promise<RegistryMap> {
  try {
    const raw = await fs.readFile(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw) as RegistryMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveRegistry(registry: RegistryMap): Promise<void> {
  await fs.mkdir(path.dirname(REGISTRY_PATH), { recursive: true });
  await fs.writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

export async function listNotificationDevices(): Promise<NotificationDevice[]> {
  const registry = await loadRegistry();
  return Object.values(registry);
}

export async function upsertNotificationDevice(
  device: Omit<NotificationDevice, 'updatedAt'>
): Promise<NotificationDevice> {
  const registry = await loadRegistry();
  const entry: NotificationDevice = { ...device, updatedAt: Date.now() };
  registry[device.deviceId] = entry;
  await saveRegistry(registry);
  return entry;
}

export async function removeNotificationDevice(deviceId: string): Promise<boolean> {
  const registry = await loadRegistry();
  if (!registry[deviceId]) return false;
  delete registry[deviceId];
  await saveRegistry(registry);
  return true;
}
