import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Window, Workspace, SessionWithHost } from './workspace-types';

const STORAGE_KEY = 'bridge.workspaces.v1';

let idCounter = 0;
function genId(): string {
  return `w${Date.now()}-${++idCounter}`;
}

function makeTerminalWindow(hostId: string, sessionName: string): Window {
  return { id: genId(), route: 'terminal', params: { hostId, sessionName } };
}

function terminalKey(w: Window): string | null {
  if (w.route !== 'terminal' || !w.params) return null;
  return `${w.params.hostId}/${w.params.sessionName}`;
}

export type WorkspaceActions = {
  addWindow: (wsIndex: number, route: string, params?: Record<string, string>) => void;
  removeWindow: (wsIndex: number, windowId: string) => void;
  moveWindow: (sourceWsIndex: number, windowId: string, targetWsIndex: number, targetIndex: number) => void;
  navigateToWindow: (wsIndex: number, windowId: string) => void;
  setActiveWorkspace: (index: number) => void;
  setActiveWindowInWorkspace: (wsIndex: number, pageIndex: number) => void;
  activeWorkspaceIndex: number;
  activeWindowIndices: Map<number, number>;
  getCurrentSessionKey: () => string | null;
};

export type UseWorkspaceStateResult = {
  workspaces: Workspace[];
  actions: WorkspaceActions;
};

export function useWorkspaceState(allSessions: SessionWithHost[]): UseWorkspaceStateResult {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceIndex, setActiveWorkspaceIndex] = useState(0);
  const [activeWindowIndices, setActiveWindowIndices] = useState<Map<number, number>>(new Map());
  const knownSessionKeysRef = useRef<Set<string> | null>(null);
  const loadedRef = useRef(false);

  // ─── Persistence ──────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Workspace[];
          if (Array.isArray(parsed)) setWorkspaces(parsed);
        } catch {}
      }
      loadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
  }, [workspaces]);

  // ─── Session Reconciliation ───────────────────────────────────────
  // Remove windows referencing dead sessions, collapse empty workspaces,
  // and auto-assign new sessions to the active workspace.

  const liveSessionKeys = useMemo(
    () => new Set(allSessions.map(s => `${s.host.id}/${s.name}`)),
    [allSessions]
  );

  // Remove dead terminal windows
  useEffect(() => {
    if (!loadedRef.current) return;
    setWorkspaces(prev => {
      let changed = false;
      const next = prev.map(ws => {
        const filtered = ws.windows.filter(w => {
          const key = terminalKey(w);
          if (key === null) return true; // non-terminal windows stay
          return liveSessionKeys.has(key);
        });
        if (filtered.length !== ws.windows.length) changed = true;
        return { ...ws, windows: filtered };
      }).filter(ws => ws.windows.length > 0);

      return changed ? next : prev;
    });
  }, [liveSessionKeys]);

  // Auto-assign new sessions
  useEffect(() => {
    if (!loadedRef.current) return;

    const currentKeys = allSessions.map(s => `${s.host.id}/${s.name}`);

    if (knownSessionKeysRef.current === null) {
      // First load: assign all existing sessions
      knownSessionKeysRef.current = new Set(currentKeys);

      // Only build workspaces from sessions if we have no persisted state
      setWorkspaces(prev => {
        if (prev.length > 0) return prev;
        if (currentKeys.length === 0) return prev;

        // Check which sessions are already in workspaces
        const assignedKeys = new Set(
          prev.flatMap(ws => ws.windows.map(terminalKey).filter(Boolean) as string[])
        );
        const unassigned = currentKeys.filter(k => !assignedKeys.has(k));
        if (unassigned.length === 0) return prev;

        return [{
          id: genId(),
          windows: unassigned.map(k => {
            const [hostId, ...rest] = k.split('/');
            return makeTerminalWindow(hostId, rest.join('/'));
          }),
        }];
      });
      return;
    }

    const newKeys = currentKeys.filter(k => !knownSessionKeysRef.current!.has(k));

    if (newKeys.length > 0) {
      setWorkspaces(prev => {
        const newWindows = newKeys.map(k => {
          const [hostId, ...rest] = k.split('/');
          return makeTerminalWindow(hostId, rest.join('/'));
        });

        // If on the implicit empty workspace, create a new real workspace
        if (activeWorkspaceIndex >= prev.length) {
          return [...prev, { id: genId(), windows: newWindows }];
        }

        // Add to active workspace
        return prev.map((ws, i) =>
          i === activeWorkspaceIndex
            ? { ...ws, windows: [...ws.windows, ...newWindows] }
            : ws
        );
      });
    }

    knownSessionKeysRef.current = new Set(currentKeys);
  }, [allSessions, activeWorkspaceIndex]);

  // ─── Actions ──────────────────────────────────────────────────────

  const addWindow = useCallback((wsIndex: number, route: string, params?: Record<string, string>) => {
    const MULTI_INSTANCE_ROUTES = new Set(['terminal', 'browser']);

    setWorkspaces(prev => {
      if (!MULTI_INSTANCE_ROUTES.has(route) && wsIndex < prev.length) {
        // Parameterized singleton: route must match AND all params must match
        const existing = prev[wsIndex].windows.findIndex(w => {
          if (w.route !== route) return false;
          const wp = w.params ?? {};
          const rp = params ?? {};
          const allKeys = new Set([...Object.keys(wp), ...Object.keys(rp)]);
          for (const k of allKeys) {
            if (wp[k] !== rp[k]) return false;
          }
          return true;
        });
        if (existing >= 0) {
          setActiveWindowIndices(m => new Map(m).set(wsIndex, existing));
          return prev;
        }
      }

      // Browser windows: navigate to existing if same URL
      if (route === 'browser' && params?.url && wsIndex < prev.length) {
        const existing = prev[wsIndex].windows.findIndex(
          w => w.route === 'browser' && w.params?.url === params.url
        );
        if (existing >= 0) {
          setActiveWindowIndices(m => new Map(m).set(wsIndex, existing));
          return prev;
        }
      }

      const newWindow: Window = { id: genId(), route, params };

      if (wsIndex >= prev.length) {
        // Creating in the empty workspace → new real workspace
        const newWs = [...prev, { id: genId(), windows: [newWindow] }];
        setActiveWindowIndices(m => new Map(m).set(wsIndex, 0));
        return newWs;
      }

      const updatedWindows = [...prev[wsIndex].windows, newWindow];
      setActiveWindowIndices(m => new Map(m).set(wsIndex, updatedWindows.length - 1));
      return prev.map((ws, i) =>
        i === wsIndex ? { ...ws, windows: updatedWindows } : ws
      );
    });
  }, []);

  const removeWindow = useCallback((wsIndex: number, windowId: string) => {
    setWorkspaces(prev => {
      const next = prev.map((ws, i) => {
        if (i !== wsIndex) return ws;
        return { ...ws, windows: ws.windows.filter(w => w.id !== windowId) };
      }).filter(ws => ws.windows.length > 0);
      return next;
    });
  }, []);

  const moveWindow = useCallback((sourceWsIndex: number, windowId: string, targetWsIndex: number, targetIndex: number) => {
    setWorkspaces((prev) => {
      if (sourceWsIndex < 0 || sourceWsIndex >= prev.length) return prev;
      const sourceWs = prev[sourceWsIndex];
      const sourceWinIndex = sourceWs.windows.findIndex((w) => w.id === windowId);
      if (sourceWinIndex < 0) return prev;
      const movingWindow = sourceWs.windows[sourceWinIndex];

      // Reorder within the same workspace.
      if (targetWsIndex === sourceWsIndex) {
        const maxInsertIndex = sourceWs.windows.length;
        let insertAt = Math.min(Math.max(targetIndex, 0), maxInsertIndex);
        if (insertAt > sourceWinIndex) insertAt -= 1;
        if (insertAt === sourceWinIndex) return prev;

        const nextWindows = sourceWs.windows.slice();
        nextWindows.splice(sourceWinIndex, 1);
        nextWindows.splice(insertAt, 0, movingWindow);

        setActiveWorkspaceIndex(sourceWsIndex);
        setActiveWindowIndices((m) => new Map(m).set(sourceWsIndex, insertAt));

        return prev.map((ws, idx) => (
          idx === sourceWsIndex
            ? { ...ws, windows: nextWindows }
            : ws
        ));
      }

      // Move across workspaces (or into the implicit empty workspace row).
      const next = prev.map((ws) => ({ ...ws, windows: [...ws.windows] }));
      next[sourceWsIndex].windows.splice(sourceWinIndex, 1);

      const sourceWorkspaceRemoved = next[sourceWsIndex].windows.length === 0;
      if (sourceWorkspaceRemoved) {
        next.splice(sourceWsIndex, 1);
      }

      let adjustedTargetWs = targetWsIndex;
      if (sourceWorkspaceRemoved && sourceWsIndex < adjustedTargetWs) {
        adjustedTargetWs -= 1;
      }
      adjustedTargetWs = Math.max(0, Math.min(adjustedTargetWs, next.length));

      let finalWsIndex = adjustedTargetWs;
      let finalWinIndex = 0;

      if (adjustedTargetWs >= next.length) {
        next.push({ id: genId(), windows: [movingWindow] });
        finalWsIndex = next.length - 1;
        finalWinIndex = 0;
      } else {
        const targetWs = next[adjustedTargetWs];
        const insertAt = Math.max(0, Math.min(targetIndex, targetWs.windows.length));
        targetWs.windows.splice(insertAt, 0, movingWindow);
        finalWsIndex = adjustedTargetWs;
        finalWinIndex = insertAt;
      }

      setActiveWorkspaceIndex(finalWsIndex);
      setActiveWindowIndices((m) => new Map(m).set(finalWsIndex, finalWinIndex));

      return next;
    });
  }, []);

  const navigateToWindow = useCallback((wsIndex: number, windowId: string) => {
    setActiveWorkspaceIndex(wsIndex);
    setWorkspaces(prev => {
      if (wsIndex >= prev.length) return prev;
      const pageIndex = prev[wsIndex].windows.findIndex(w => w.id === windowId);
      if (pageIndex >= 0) {
        setActiveWindowIndices(m => new Map(m).set(wsIndex, pageIndex));
      }
      return prev;
    });
  }, []);

  const setActiveWindowInWorkspace = useCallback((wsIndex: number, pageIndex: number) => {
    setActiveWindowIndices(m => new Map(m).set(wsIndex, pageIndex));
  }, []);

  const getCurrentSessionKey = useCallback((): string | null => {
    if (activeWorkspaceIndex >= workspaces.length) return null;
    const ws = workspaces[activeWorkspaceIndex];
    const pageIdx = activeWindowIndices.get(activeWorkspaceIndex) ?? 0;
    if (pageIdx >= ws.windows.length) return null;
    return terminalKey(ws.windows[pageIdx]);
  }, [workspaces, activeWorkspaceIndex, activeWindowIndices]);

  return {
    workspaces,
    actions: {
      addWindow,
      removeWindow,
      moveWindow,
      navigateToWindow,
      setActiveWorkspace: setActiveWorkspaceIndex,
      setActiveWindowInWorkspace,
      activeWorkspaceIndex,
      activeWindowIndices,
      getCurrentSessionKey,
    },
  };
}
