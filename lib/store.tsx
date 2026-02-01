import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppPreferences, Host, HostDraft, TerminalSettings, ThemeSetting, UsageCardsVisibility, GitHubPreferences } from '@/lib/types';
import { loadHosts, loadPreferences, saveHosts, savePreferences } from '@/lib/storage';
import { createId, defaultPreferences, pickHostAccent } from '@/lib/defaults';

const StoreContext = createContext<{
  hosts: Host[];
  preferences: AppPreferences;
  ready: boolean;
  upsertHost: (host: HostDraft, id?: string) => Promise<Host>;
  removeHost: (id: string) => Promise<void>;
  updateHostLastSeen: (id: string, timestamp: number) => void;
  updateUsageCardVisibility: (updates: Partial<UsageCardsVisibility>) => void;
  updateNotificationSettings: (updates: Partial<AppPreferences['notifications']>) => void;
  updateTheme: (theme: ThemeSetting) => void;
  updateTerminalSettings: (updates: Partial<TerminalSettings>) => void;
  updateGitHubSettings: (updates: Partial<GitHubPreferences>) => void;
  updateSessionOrder: (hostId: string, sessionNames: string[]) => void;
} | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [storedHosts, storedPreferences] = await Promise.all([loadHosts(), loadPreferences()]);
      if (!mounted) return;
      setHosts(storedHosts);
      setPreferences(storedPreferences);
      setReady(true);
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const persistHosts = useCallback(async (nextHosts: Host[]) => {
    setHosts(nextHosts);
    await saveHosts(nextHosts);
  }, []);

  const upsertHost = useCallback(
    async (draft: HostDraft, id?: string) => {
      const nextId = id ?? createId('host');
      const nextHosts = [...hosts];
      const index = nextHosts.findIndex((host) => host.id === nextId);
      const color = draft.color ?? (index >= 0 ? nextHosts[index]?.color : pickHostAccent(nextHosts));
      const host: Host = {
        ...draft,
        id: nextId,
        color,
      };

      if (index >= 0) {
        nextHosts[index] = host;
      } else {
        nextHosts.push(host);
      }

      await persistHosts(nextHosts);
      return host;
    },
    [hosts, persistHosts]
  );

  const removeHost = useCallback(
    async (id: string) => {
      const nextHosts = hosts.filter((host) => host.id !== id);
      await persistHosts(nextHosts);
    },
    [hosts, persistHosts]
  );

  const updateHostLastSeen = useCallback((id: string, timestamp: number) => {
    setHosts((prev) => {
      const next = prev.map((host) => (host.id === id ? { ...host, lastSeen: timestamp } : host));
      saveHosts(next);
      return next;
    });
  }, []);

  const updateUsageCardVisibility = useCallback(
    (updates: Partial<UsageCardsVisibility>) => {
      setPreferences((prev) => {
        const next: AppPreferences = {
          ...prev,
          usageCards: { ...prev.usageCards, ...updates },
        };
        savePreferences(next);
        return next;
      });
    },
    []
  );

  const updateNotificationSettings = useCallback(
    (updates: Partial<AppPreferences['notifications']>) => {
      setPreferences((prev) => {
        const next: AppPreferences = {
          ...prev,
          notifications: { ...prev.notifications, ...updates },
        };
        savePreferences(next);
        return next;
      });
    },
    []
  );

  const updateTheme = useCallback((theme: ThemeSetting) => {
    setPreferences((prev) => {
      const next: AppPreferences = { ...prev, theme };
      savePreferences(next);
      return next;
    });
  }, []);

  const updateTerminalSettings = useCallback(
    (updates: Partial<TerminalSettings>) => {
      setPreferences((prev) => {
        const next: AppPreferences = {
          ...prev,
          terminal: { ...prev.terminal, ...updates },
        };
        savePreferences(next);
        return next;
      });
    },
    []
  );

  const updateGitHubSettings = useCallback(
    (updates: Partial<GitHubPreferences>) => {
      setPreferences((prev) => {
        const next: AppPreferences = {
          ...prev,
          github: { ...prev.github, ...updates },
        };
        savePreferences(next);
        return next;
      });
    },
    []
  );

  const updateSessionOrder = useCallback((hostId: string, sessionNames: string[]) => {
    setPreferences((prev) => {
      const existingIndex = prev.sessionOrders.findIndex((o) => o.hostId === hostId);
      let nextOrders: typeof prev.sessionOrders;
      if (existingIndex >= 0) {
        nextOrders = [...prev.sessionOrders];
        nextOrders[existingIndex] = { hostId, sessionNames };
      } else {
        nextOrders = [...prev.sessionOrders, { hostId, sessionNames }];
      }
      const next: AppPreferences = { ...prev, sessionOrders: nextOrders };
      savePreferences(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      hosts,
      preferences,
      ready,
      upsertHost,
      removeHost,
      updateHostLastSeen,
      updateUsageCardVisibility,
      updateNotificationSettings,
      updateTheme,
      updateTerminalSettings,
      updateGitHubSettings,
      updateSessionOrder,
    }),
    [
      hosts,
      preferences,
      ready,
      upsertHost,
      removeHost,
      updateHostLastSeen,
      updateUsageCardVisibility,
      updateNotificationSettings,
      updateTheme,
      updateTerminalSettings,
      updateGitHubSettings,
      updateSessionOrder,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within StoreProvider');
  }
  return context;
}
