import { useEffect, useMemo, useRef } from 'react';

import type { Host, Session } from '@/lib/types';
import { endTaskLiveActivity, startTaskLiveActivity, updateTaskLiveActivity } from '@/lib/live-activity';
import { clearOngoingNotification, updateOngoingNotification } from '@/lib/ongoing-notifications';

type SessionWithHost = Session & { host: Host };
type AgentState = 'running' | 'idle' | 'stopped';

function getAgentState(session: SessionWithHost): AgentState {
  return (session.insights?.meta?.agentState ?? 'stopped') as AgentState;
}

type SessionSummary = {
  running: number;
  idle: number;
  total: number;
  key: string;
};

function buildSessionSummary(sessions: SessionWithHost[]): SessionSummary {
  let running = 0;
  let idle = 0;
  const keys: string[] = [];

  for (const session of sessions) {
    const state = getAgentState(session);
    if (state === 'running') {
      running++;
      keys.push(`r:${session.host.id}:${session.name}`);
    } else if (state === 'idle') {
      idle++;
      keys.push(`i:${session.host.id}:${session.name}`);
    }
  }

  return {
    running,
    idle,
    total: running + idle,
    key: keys.sort().join('|'),
  };
}

function buildNotificationContent(summary: SessionSummary): { title: string; subtitle: string } {
  const parts: string[] = [];
  if (summary.running > 0) {
    parts.push(`${summary.running} running`);
  }
  if (summary.idle > 0) {
    parts.push(`${summary.idle} idle`);
  }

  const title = parts.join(', ') || 'No active sessions';
  const subtitle = summary.total === 1
    ? '1 active session'
    : `${summary.total} active sessions`;

  return { title, subtitle };
}

export function useTaskLiveUpdates(sessions: SessionWithHost[], enabled: boolean) {
  const activityIdRef = useRef<string | null>(null);
  const currentKeyRef = useRef<string | null>(null);

  const summary = useMemo(() => buildSessionSummary(sessions), [sessions]);

  useEffect(() => {
    if (!enabled) {
      if (activityIdRef.current) {
        endTaskLiveActivity(activityIdRef.current);
        activityIdRef.current = null;
      }
      currentKeyRef.current = null;
      void clearOngoingNotification();
      return;
    }

    if (summary.total === 0) {
      if (activityIdRef.current) {
        endTaskLiveActivity(activityIdRef.current);
        activityIdRef.current = null;
      }
      currentKeyRef.current = null;
      void clearOngoingNotification();
      return;
    }

    const { title, subtitle } = buildNotificationContent(summary);

    if (currentKeyRef.current !== summary.key) {
      if (activityIdRef.current) {
        endTaskLiveActivity(activityIdRef.current);
      }
      activityIdRef.current = startTaskLiveActivity({ title, subtitle });
      currentKeyRef.current = summary.key;
      void updateOngoingNotification(title, subtitle);
      return;
    }

    if (activityIdRef.current) {
      updateTaskLiveActivity(activityIdRef.current, { title, subtitle });
    }
    void updateOngoingNotification(title, subtitle);
  }, [enabled, summary]);
}
