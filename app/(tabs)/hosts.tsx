import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { HostCard } from '@/components/HostCard';
import { Card } from '@/components/Card';
import { SkeletonList } from '@/components/Skeleton';
import { applyUpdate, checkForUpdate, UpdateStatus } from '@/lib/api';
import { systemColors } from '@/lib/colors';
import { DiscoveredAgent, scanForAgents } from '@/lib/discovery';
import { useStore } from '@/lib/store';
import { useHostsLive } from '@/lib/live';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { TIMING, POLLING } from '@/lib/constants';

type CardStatus = 'online' | 'offline' | 'checking';

export default function HostsTabScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hosts, updateHostLastSeen, ready, upsertHost } = useStore();
  const [manualRefresh, setManualRefresh] = useState(false);
  const [updateStatusMap, setUpdateStatusMap] = useState<Record<string, UpdateStatus>>({});
  const [updatingHosts, setUpdatingHosts] = useState<Record<string, boolean>>({});
  const isFocused = useIsFocused();
  const [scanState, setScanState] = useState<{
    status: 'idle' | 'scanning' | 'done' | 'error';
    message?: string;
    results: DiscoveredAgent[];
  }>({ status: 'idle', results: [] });
  const [addingAgents, setAddingAgents] = useState<Record<string, boolean>>({});

  const { stateMap, refreshAll } = useHostsLive(hosts, { sessions: false, host: true, docker: false, enabled: isFocused });

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

  const handleTerminal = useCallback(
    (hostId: string) => {
      router.push(`/hosts/${hostId}`);
    },
    [router]
  );

  const isScanning = scanState.status === 'scanning';

  const handleScan = useCallback(async () => {
    if (isScanning) return;
    setScanState({ status: 'scanning', results: [] });
    const result = await scanForAgents({ hosts });
    if (result.error) {
      setScanState({ status: 'error', message: result.error, results: result.results });
      return;
    }
    setScanState({ status: 'done', results: result.results });
  }, [hosts, isScanning]);

  const handleAddAgent = useCallback(
    async (agent: DiscoveredAgent) => {
      if (addingAgents[agent.baseUrl]) return;
      setAddingAgents((prev) => ({ ...prev, [agent.baseUrl]: true }));
      try {
        await upsertHost({
          name: agent.label || agent.ip,
          baseUrl: agent.baseUrl,
        });
        setScanState((prev) => ({
          ...prev,
          results: prev.results.filter((item) => item.baseUrl !== agent.baseUrl),
        }));
      } finally {
        setAddingAgents((prev) => ({ ...prev, [agent.baseUrl]: false }));
      }
    },
    [addingAgents, upsertHost]
  );

  useEffect(() => {
    let cancelled = false;
    if (!isFocused) return () => {
      cancelled = true;
    };
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
      if (!cancelled) {
        setUpdateStatusMap(next);
      }
    };

    checkUpdates();
    const interval = setInterval(checkUpdates, POLLING.UPDATE_CHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onlineHosts, isFocused]);

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
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.scanButton, isScanning && styles.scanButtonDisabled]}
            onPress={handleScan}
            disabled={isScanning}
          >
            <AppText variant="caps" style={styles.scanButtonText}>
              {isScanning ? 'Scanning...' : 'Scan'}
            </AppText>
          </Pressable>
          <Pressable style={styles.addButton} onPress={() => router.push('/hosts/new')}>
            <AppText variant="subtitle" style={styles.addButtonText}>
              +
            </AppText>
          </Pressable>
        </View>
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
              setTimeout(() => setManualRefresh(false), TIMING.REFRESH_INDICATOR_MS);
            }}
            tintColor={systemColors.blue as string}
          />
        }
      >
        {scanState.status !== 'idle' && (
          <Card style={styles.scanCard}>
            <View style={styles.scanHeader}>
              <AppText variant="subtitle">Local scan</AppText>
              <Pressable
                onPress={handleScan}
                style={[styles.scanButtonSmall, isScanning && styles.scanButtonDisabled]}
                disabled={isScanning}
              >
                <AppText variant="caps" style={styles.scanButtonText}>
                  {isScanning ? 'Scanning...' : 'Rescan'}
                </AppText>
              </Pressable>
            </View>
            {isScanning && (
              <AppText variant="body" tone="muted">
                Scanning local network for agents on port 4020...
              </AppText>
            )}
            {scanState.message ? (
              <AppText variant="body" tone="warning">
                {scanState.message}
              </AppText>
            ) : null}
            {scanState.status === 'done' && scanState.results.length === 0 ? (
              <AppText variant="body" tone="muted">
                No agents found on port 4020.
              </AppText>
            ) : null}
            {scanState.results.map((agent) => {
              const isAdding = Boolean(addingAgents[agent.baseUrl]);
              return (
                <View key={agent.baseUrl} style={styles.scanRow}>
                  <View style={styles.scanInfo}>
                    <AppText variant="label">{agent.label}</AppText>
                    <AppText variant="mono" tone="muted">
                      {agent.baseUrl}
                    </AppText>
                    {agent.status === 'auth-required' && (
                      <AppText variant="caps" tone="warning" style={styles.scanStatus}>
                        Token required
                      </AppText>
                    )}
                  </View>
                  <Pressable
                    style={[styles.scanAddButton, isAdding && styles.scanAddButtonDisabled]}
                    onPress={() => handleAddAgent(agent)}
                    disabled={isAdding}
                  >
                    <AppText variant="caps" style={styles.scanAddText}>
                      {isAdding ? 'Adding...' : 'Add'}
                    </AppText>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        )}

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
                metrics={{
                  cpu: stateMap[host.id]?.hostInfo?.cpu?.usage,
                  ram: stateMap[host.id]?.hostInfo?.memory?.usedPercent,
                }}
                uptime={stateMap[host.id]?.hostInfo?.uptime}
                load={stateMap[host.id]?.hostInfo?.load}
                updateStatus={updateStatusMap[host.id]}
                isUpdating={Boolean(updatingHosts[host.id])}
                errorMessage={statusMap[host.id] === 'offline' ? stateMap[host.id]?.error : undefined}
                onUpdate={() => handleUpdate(host.id)}
                onPress={() => router.push(`/hosts/${host.id}`)}
                onTerminal={() => handleTerminal(host.id)}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.cardPressed,
  },
  scanButtonSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.cardPressed,
  },
  scanButtonDisabled: {
    opacity: 0.6,
  },
  scanButtonText: {
    color: colors.text,
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
  scanCard: {
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  scanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  scanInfo: {
    flex: 1,
    gap: 2,
  },
  scanStatus: {
    marginTop: 2,
  },
  scanAddButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  scanAddButtonDisabled: {
    backgroundColor: colors.cardPressed,
  },
  scanAddText: {
    color: colors.accentText,
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
