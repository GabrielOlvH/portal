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
    setWorkspaces(prev => {
      // Check for singleton (non-terminal, non-browser routes open at most once per workspace)
      if (route !== 'terminal' && route !== 'browser' && wsIndex < prev.length) {
        const existing = prev[wsIndex].windows.findIndex(w => w.route === route);
        if (existing >= 0) {
          // Navigate to it instead
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
      navigateToWindow,
      setActiveWorkspace: setActiveWorkspaceIndex,
      setActiveWindowInWorkspace,
      activeWorkspaceIndex,
      activeWindowIndices,
      getCurrentSessionKey,
    },
  };
}
