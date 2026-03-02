import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { Screen } from '@/components/Screen';
import { WorkspaceGrid } from '@/components/workspace/WorkspaceGrid';
import { killSession } from '@/lib/api';
import { useLaunchSheet } from '@/lib/launch-sheet';
import { useHostsLive } from '@/lib/live';
import { useStore } from '@/lib/store';
import { useWorkspaceState } from '@/lib/useWorkspaceState';
import type { SessionWithHost } from '@/lib/workspace-types';

export default function SessionsScreen() {
  const { hosts } = useStore();
  const isFocused = useIsFocused();
  const { open: openLaunchSheet } = useLaunchSheet();
  const { stateMap } = useHostsLive(hosts, {
    sessions: true,
    insights: isFocused,
    preview: true,
    previewLines: 5,
    enabled: isFocused,
    intervalMs: 2000,
  });

  // ─── Build flat session list ───────────────────────────────────────

  const allSessions = useMemo<SessionWithHost[]>(() => {
    const all: SessionWithHost[] = [];
    hosts.forEach((host, hostIndex) => {
      const hostState = stateMap[host.id];
      const hostStatus = hostState?.status ?? 'checking';
      (hostState?.sessions ?? []).forEach((session) => {
        all.push({ ...session, host, hostStatus, hostIndex });
      });
    });
    all.sort((a, b) => {
      const aTime = a.lastAttached || a.createdAt || 0;
      const bTime = b.lastAttached || b.createdAt || 0;
      return bTime - aTime;
    });
    return all;
  }, [hosts, stateMap]);

  const sessionMap = useMemo(() => {
    const map = new Map<string, SessionWithHost>();
    allSessions.forEach(s => map.set(`${s.host.id}/${s.name}`, s));
    return map;
  }, [allSessions]);

  // ─── Workspace state ───────────────────────────────────────────────

  const { workspaces, actions } = useWorkspaceState(allSessions);

  const totalWorkspaces = workspaces.length + 1; // +1 for empty workspace at bottom

  // Aggregate usage from all sessions for overview rings
  const providerUsage = useMemo(() => {
    const providers = ['claude', 'codex', 'copilot', 'cursor', 'kimi'] as const;
    const result: { provider: typeof providers[number]; percentLeft: number }[] = [];
    for (const p of providers) {
      for (const s of allSessions) {
        const usage = s.insights?.[p];
        if (usage?.session?.percentLeft != null) {
          result.push({ provider: p, percentLeft: usage.session.percentLeft });
          break;
        }
      }
    }
    return result;
  }, [allSessions]);

  // ─── Kill window handler ──────────────────────────────────────────
  // For terminals: kill the tmux session then close the window
  // For non-terminals: just close the window

  const handleKillWindow = useCallback((wsIdx: number, winId: string) => {
    const ws = workspaces[wsIdx];
    if (!ws) return;
    const win = ws.windows.find(w => w.id === winId);
    if (!win) return;

    if (win.route === 'terminal' && win.params?.hostId && win.params?.sessionName) {
      const host = hosts.find(h => h.id === win.params!.hostId);
      if (host) {
        killSession(host, win.params!.sessionName).catch(() => {});
      }
    }
    actions.removeWindow(wsIdx, winId);
  }, [workspaces, hosts, actions]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <Screen variant="terminal">
      <View style={StyleSheet.absoluteFill}>
        <WorkspaceGrid
          workspaces={workspaces}
          sessionMap={sessionMap}
          activeWorkspaceIndex={actions.activeWorkspaceIndex}
          activeWindowIndices={actions.activeWindowIndices}
          onWorkspaceChanged={(idx) => actions.setActiveWorkspace(idx)}
          onWindowChanged={(wsIdx, winIdx) => actions.setActiveWindowInWorkspace(wsIdx, winIdx)}
          onCloseWindow={(wsIdx, winId) => actions.removeWindow(wsIdx, winId)}
          onKillWindow={handleKillWindow}
          onMoveWindow={(fromWsIdx, winId, toWsIdx, toIndex) => actions.moveWindow(fromWsIdx, winId, toWsIdx, toIndex)}
          onOpenWindow={(wsIdx, route, params) => actions.addWindow(wsIdx, route, params)}
          onNewSession={openLaunchSheet}
          providerUsage={providerUsage}
          totalWorkspaces={totalWorkspaces}
        />
      </View>
    </Screen>
  );
}
