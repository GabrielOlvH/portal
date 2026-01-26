import { useEffect, useMemo, useRef } from 'react';

import type { Host, Session } from '@/lib/types';
import { endTaskLiveActivity, startTaskLiveActivity, updateTaskLiveActivity } from '@/lib/live-activity';
import { clearOngoingNotification, updateOngoingNotification } from '@/lib/ongoing-notifications';

type SessionWithHost = Session & { host: Host };
type AgentState = 'running' | 'idle' | 'stopped';

function getAgentState(session: SessionWithHost): AgentState {
  return (session.insights?.meta?.agentState ?? 'stopped') as AgentState;
}

function buildSubtitle(session: SessionWithHost, state: AgentState): string {
  const verb = state === 'idle' ? 'Paused' : 'Running';
  return `${verb} on ${session.host.name}`;
}

export function useTaskLiveUpdates(sessions: SessionWithHost[], enabled: boolean) {
  const activityIdRef = useRef<string | null>(null);
  const currentKeyRef = useRef<string | null>(null);
  const currentStateRef = useRef<AgentState>('stopped');
  const currentTitleRef = useRef<string | null>(null);

  const activeSession = useMemo(() => {
    return sessions.find((session) => {
      const state = getAgentState(session);
      return state === 'running' || state === 'idle';
    });
  }, [sessions]);

  useEffect(() => {
    if (!enabled) {
      if (activityIdRef.current) {
        endTaskLiveActivity(activityIdRef.current);
      }
      activityIdRef.current = null;
      currentKeyRef.current = null;
      currentStateRef.current = 'stopped';
      currentTitleRef.current = null;
      void clearOngoingNotification();
      return;
    }

    const key = activeSession ? `${activeSession.host.id}:${activeSession.name}` : null;
    const state = activeSession ? getAgentState(activeSession) : 'stopped';

    if (!activeSession || state === 'stopped') {
      if (activityIdRef.current) {
        endTaskLiveActivity(activityIdRef.current);
      }
      activityIdRef.current = null;
      currentKeyRef.current = null;
      currentStateRef.current = 'stopped';
      currentTitleRef.current = null;
      void clearOngoingNotification();
      return;
    }

    const subtitle = buildSubtitle(activeSession, state);
    const title = activeSession.title || activeSession.name;

    if (currentKeyRef.current !== key) {
      if (activityIdRef.current) {
        endTaskLiveActivity(activityIdRef.current);
      }
      activityIdRef.current = startTaskLiveActivity({ title, subtitle });
      currentKeyRef.current = key;
      currentStateRef.current = state;
      currentTitleRef.current = title;
      void updateOngoingNotification(title, subtitle);
      return;
    }

    if (currentStateRef.current !== state || currentTitleRef.current !== title) {
      if (activityIdRef.current) {
        updateTaskLiveActivity(activityIdRef.current, { title, subtitle });
      }
      currentStateRef.current = state;
      currentTitleRef.current = title;
      void updateOngoingNotification(title, subtitle);
    }
  }, [activeSession]);
}
