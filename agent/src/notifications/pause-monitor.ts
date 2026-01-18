import { HOST_LABEL } from '../config';
import { getSessionInsights } from '../agents';
import { listSessions } from '../sessions';
import { parseSessions } from '../tmux';
import { listNotificationDevices } from './registry';
import { sendExpoPushMessages, type ExpoPushMessage } from './push';

type AgentState = 'running' | 'idle' | 'stopped';

const lastStates = new Map<string, AgentState>();
let inflight: Promise<void> | null = null;

function buildMessages(sessionName: string, hostLabel: string, devices: { expoPushToken: string }[]): ExpoPushMessage[] {
  const title = 'Task paused';
  const body = `${sessionName} on ${hostLabel} is idle`;
  return devices.map((device) => ({
    to: device.expoPushToken,
    title,
    body,
    sound: 'default',
    channelId: 'task-updates',
    data: {
      type: 'task-paused',
      sessionName,
      host: hostLabel,
    },
  }));
}

async function pollOnce() {
  const devices = await listNotificationDevices();
  if (devices.length === 0) return;

  const raw = await listSessions();
  const sessions = parseSessions(raw);
  if (sessions.length === 0) return;

  const activeNames = new Set(sessions.map((session) => session.name));
  for (const key of Array.from(lastStates.keys())) {
    if (!activeNames.has(key)) lastStates.delete(key);
  }

  const messages: ExpoPushMessage[] = [];

  for (const session of sessions) {
    const insights = await getSessionInsights(session.name);
    const state = (insights.meta?.agentState ?? 'stopped') as AgentState;
    const previous = lastStates.get(session.name);
    lastStates.set(session.name, state);

    if (previous === 'running' && state === 'idle') {
      messages.push(...buildMessages(session.name, HOST_LABEL, devices));
    }
  }

  if (messages.length > 0) {
    await sendExpoPushMessages(messages);
  }
}

export function startPauseMonitor(): void {
  if (inflight) return;
  inflight = pollOnce()
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
}
