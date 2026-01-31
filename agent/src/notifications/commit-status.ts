import { HOST_LABEL } from '../config';
import {
  getAllProjectStatuses,
  getCachedStatus,
  type CommitStatus,
} from '../github';
import { listNotificationDevices } from './registry';
import { sendExpoPushMessages, type ExpoPushMessage } from './push';

// Track last known status for each project/branch
const lastKnownStatus = new Map<string, CommitStatus['state']>();
let inflight: Promise<void> | null = null;
let isEnabled = false;

function getStatusKey(projectId: string, branch: string): string {
  return `${projectId}:${branch}`;
}

function buildMessages(
  repo: string,
  branch: string,
  state: CommitStatus['state'],
  hostLabel: string,
  devices: { expoPushToken: string }[]
): ExpoPushMessage[] {
  const title = state === 'success' ? 'CI Passed' : 'CI Failed';
  const body =
    state === 'success'
      ? `${repo} (${branch}) completed successfully on ${hostLabel}`
      : `${repo} (${branch}) failed on ${hostLabel}`;

  return devices.map((device) => ({
    to: device.expoPushToken,
    title,
    body,
    sound: 'default',
    channelId: 'task-updates',
    data: {
      type: 'ci-status-change',
      repo,
      branch,
      state,
      host: hostLabel,
    },
  }));
}

async function pollOnce() {
  if (!isEnabled) return;

  const devices = await listNotificationDevices();
  if (devices.length === 0) return;

  // Get all projects from all hosts - this is a simplified version
  // In production, you'd want to get projects from a central store
  // For now, we'll rely on the cached statuses

  const messages: ExpoPushMessage[] = [];

  // Check all cached statuses for changes
  for (const [key, previousState] of lastKnownStatus.entries()) {
    // Parse key to get projectId and branch
    const [projectId, branch] = key.split(':');
    if (!projectId || !branch) continue;

    const current = getCachedStatus(projectId, branch);
    if (!current) continue;

    const currentState = current.state;

    // Only notify on transitions to success or failure (not pending)
    if (
      previousState !== currentState &&
      (currentState === 'success' || currentState === 'failure')
    ) {
      messages.push(
        ...buildMessages(current.repo, branch, currentState, HOST_LABEL, devices)
      );
    }

    // Update tracked state
    lastKnownStatus.set(key, currentState);
  }

  if (messages.length > 0) {
    await sendExpoPushMessages(messages);
  }
}

export function startCommitStatusMonitor(enabled: boolean = true): void {
  isEnabled = enabled;
  if (!enabled) return;
  if (inflight) return;

  inflight = pollOnce()
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
}

export function updateCommitStatusTracking(statuses: CommitStatus[]): void {
  for (const status of statuses) {
    const key = getStatusKey(status.projectId, status.branch);
    // Only update if we haven't seen this key before
    if (!lastKnownStatus.has(key)) {
      lastKnownStatus.set(key, status.state);
    }
  }
}

export function setCommitStatusMonitorEnabled(enabled: boolean): void {
  isEnabled = enabled;
  if (!enabled) {
    lastKnownStatus.clear();
  }
}

export function isCommitStatusMonitorEnabled(): boolean {
  return isEnabled;
}
