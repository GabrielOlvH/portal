import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { useHostsLive } from '@/lib/live';
import { useProjects } from '@/lib/projects-store';
import { Host } from '@/lib/types';

export function ProjectSyncManager() {
  const { hosts } = useStore();
  const { syncWithHost } = useProjects();
  const { stateMap } = useHostsLive(hosts, { enabled: true });
  const syncedHostsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const host of hosts) {
      const state = stateMap[host.id];
      if (state?.status === 'online' && !syncedHostsRef.current.has(host.id)) {
        syncedHostsRef.current.add(host.id);
        syncWithHost(host).catch((err) => {
          console.warn(`Failed to sync projects with host ${host.name}:`, err);
        });
      } else if (state?.status === 'offline') {
        syncedHostsRef.current.delete(host.id);
      }
    }
  }, [hosts, stateMap, syncWithHost]);

  return null;
}
