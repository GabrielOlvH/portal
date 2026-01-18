import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { HostCard } from '@/components/HostCard';
import { SkeletonList } from '@/components/Skeleton';
import { applyUpdate, checkForUpdate, UpdateStatus } from '@/lib/api';
import { systemColors } from '@/lib/colors';
import { useStore } from '@/lib/store';
import { useHostsLive } from '@/lib/live';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';

type CardStatus = 'online' | 'offline' | 'checking';

export default function HostsTabScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hosts, updateHostLastSeen, ready } = useStore();
  const [manualRefresh, setManualRefresh] = useState(false);
  const [updateStatusMap, setUpdateStatusMap] = useState<Record<string, UpdateStatus>>({});
  const [updatingHosts, setUpdatingHosts] = useState<Record<string, boolean>>({});

  const { stateMap, refreshAll } = useHostsLive(hosts, { sessions: true, docker: true });

  const statusMap = useMemo(() => {
    const next: Record<string, CardStatus> = {};
    hosts.forEach((host) => {
      const s = stateMap[host.id]?.status;
      next[host.id] = s === 'online' ? 'online' : s === 'offline' ? 'offline' : 'checking';
    });
    return next;
  }, [hosts, stateMap]);

  useEffect(() => {
    Object.entries(stateMap).forEach(([id, state]) => {
      if (state.lastUpdate) updateHostLastSeen(id, state.lastUpdate);
    });
  }, [stateMap, updateHostLastSeen]);

  const onlineCount = useMemo(
    () => Object.values(statusMap).filter((s) => s === 'online').length,
    [statusMap]
  );

  const onlineHosts = useMemo(
    () => hosts.filter((host) => statusMap[host.id] === 'online'),
    [hosts, statusMap]
  );

  const isInitialLoading = useMemo(
    () =>
      hosts.length > 0 &&
      Object.values(statusMap).every((s) => s === 'checking'),
    [hosts, statusMap]
  );
  const isBooting = !ready;

  const sessionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    hosts.forEach((host) => {
      counts[host.id] = stateMap[host.id]?.sessions?.length ?? 0;
    });
    return counts;
  }, [hosts, stateMap]);

  const containerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    hosts.forEach((host) => {
      counts[host.id] = stateMap[host.id]?.docker?.containers?.length ?? 0;
    });
    return counts;
  }, [hosts, stateMap]);

  const handleTerminal = useCallback(
    (hostId: string) => {
      router.push(`/hosts/${hostId}`);
    },
    [router]
  );

  const handleDocker = useCallback(
    (hostId: string) => {
      router.push(`/(tabs)/docker?hostId=${hostId}`);
    },
    [router]
  );

  useEffect(() => {
    let cancelled = false;
    if (onlineHosts.length === 0) {
      setUpdateStatusMap({});
      return;
    }

    const checkUpdates = async () => {
      const next: Record<string, UpdateStatus> = {};
      await Promise.all(
        onlineHosts.map(async (host) => {
          try {
            const status = await checkForUpdate(host);
            if (status.updateAvailable) {
              next[host.id] = status;
            }
          } catch {
            // Ignore errors, host might not support updates
          }
        })
      );
      if (!cancelled) setUpdateStatusMap(next);
    };

    checkUpdates();
    const interval = setInterval(checkUpdates, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onlineHosts]);

  const handleUpdate = useCallback(
    async (hostId: string) => {
      const host = hosts.find((item) => item.id === hostId);
      if (!host || updatingHosts[hostId]) return;
      setUpdatingHosts((prev) => ({ ...prev, [hostId]: true }));
      try {
        await applyUpdate(host);
        Alert.alert('Update Started', 'The agent is updating and will restart.');
        setUpdateStatusMap((prev) => {
          const next = { ...prev };
          delete next[hostId];
          return next;
        });
      } catch (err) {
        Alert.alert('Update Failed', err instanceof Error ? err.message : 'Could not apply update');
      } finally {
        setUpdatingHosts((prev) => ({ ...prev, [hostId]: false }));
      }
    },
    [hosts, updatingHosts]
  );

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="caps" tone="muted">
          {ready ? `${onlineCount}/${hosts.length} online` : 'Loading...'}
        </AppText>
        <Pressable style={styles.addButton} onPress={() => router.push('/hosts/new')}>
          <AppText variant="subtitle" style={styles.addButtonText}>
            +
          </AppText>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={manualRefresh}
            onRefresh={() => {
              setManualRefresh(true);
              refreshAll();
              setTimeout(() => setManualRefresh(false), 600);
            }}
            tintColor={systemColors.blue as string}
          />
        }
      >
        {isBooting ? (
          <FadeIn delay={100}>
            <SkeletonList type="host" count={3} />
          </FadeIn>
        ) : hosts.length === 0 ? (
          <FadeIn style={styles.empty}>
            <View style={styles.emptyIcon}>
              <AppText variant="title" style={styles.emptyIconText}>
                ~
              </AppText>
            </View>
            <AppText variant="subtitle">No hosts configured</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyBody}>
              Add a host running the tmux agent to manage sessions remotely.
            </AppText>
            <Pressable style={styles.cta} onPress={() => router.push('/hosts/new')}>
              <AppText variant="subtitle" style={styles.ctaText}>
                Add Host
              </AppText>
            </Pressable>
          </FadeIn>
        ) : isInitialLoading ? (
          <FadeIn delay={100}>
            <SkeletonList type="host" count={hosts.length} />
          </FadeIn>
        ) : (
          hosts.map((host, index) => (
            <FadeIn key={host.id} delay={index * 50}>
              <HostCard
                host={host}
                status={statusMap[host.id]}
                sessionCount={sessionCounts[host.id]}
                containerCount={containerCounts[host.id] || undefined}
                updateStatus={updateStatusMap[host.id]}
                isUpdating={Boolean(updatingHosts[host.id])}
                onUpdate={() => handleUpdate(host.id)}
                onPress={() => router.push(`/hosts/${host.id}`)}
                onTerminal={() => handleTerminal(host.id)}
                onDocker={() => handleDocker(host.id)}
              />
            </FadeIn>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: colors.accentText,
    fontSize: 20,
    marginTop: -2,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  empty: {
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadow.card,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.cardPressed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  emptyIconText: {
    color: colors.textSecondary,
  },
  emptyBody: {
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  ctaText: {
    color: colors.accentText,
  },
});
