import { HOST_LABEL } from '../config';
import { getSessionInsights } from '../agents';
import { listSessions } from '../sessions';
import { parseSessions } from '../tmux';
import { listNotificationDevices } from './registry';
import { sendExpoPushMessages, type ExpoPushMessage } from './push';

type AgentState = 'running' | 'idle' | 'stopped';

const lastStates = new Map<string, AgentState>();
const runningSince = new Map<string, number>();
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

    if (state === 'running') {
      if (!runningSince.has(session.name)) {
        runningSince.set(session.name, Date.now());
      }
      continue;
    }

    if (state === 'idle') {
      const startedAt = runningSince.get(session.name);
      const durationMs = startedAt ? Date.now() - startedAt : 0;
      if (previous === 'running' && durationMs >= 30000) {
        messages.push(...buildMessages(session.name, HOST_LABEL, devices));
      }
      runningSince.delete(session.name);
      continue;
    }

    runningSince.delete(session.name);
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
