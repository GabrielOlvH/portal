import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Search, Plus, Radio, Server, ShieldAlert } from 'lucide-react-native';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { HostCard } from '@/components/HostCard';
import { SkeletonList } from '@/components/Skeleton';
import { GlassCard } from '@/components/ui/GlassCard';
import { applyUpdate, checkForUpdate, UpdateStatus } from '@/lib/api';
import { systemColors, withAlpha } from '@/lib/colors';
import { DiscoveredAgent, scanForAgents } from '@/lib/discovery';
import { useStore } from '@/lib/store';
import { useWindowActionsIfAvailable } from '@/lib/useWindowActions';
import { useHostsLive } from '@/lib/live';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { TIMING, POLLING } from '@/lib/constants';

type CardStatus = 'online' | 'offline' | 'checking';

export default function HostsTabScreen() {
  const router = useRouter();
  const windowActions = useWindowActionsIfAvailable();
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
      if (windowActions) {
        windowActions.openWindow('host-detail', { hostId });
      } else {
        router.push(`/hosts/${hostId}`);
      }
    },
    [router, windowActions]
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
        <AppText variant="title" style={styles.title}>Hosts</AppText>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.actionBtn, isScanning && styles.actionBtnDisabled]}
            onPress={handleScan}
            disabled={isScanning}
          >
            <Radio size={20} color={colors.text} />
          </Pressable>
          <Pressable style={[styles.actionBtn, { backgroundColor: colors.accent }]} onPress={() => router.push('/hosts/new')}>
            <Plus size={20} color={colors.accentText} />
          </Pressable>
        </View>
      </View>

      <View style={styles.statusRow}>
        <AppText variant="caps" tone="muted" style={styles.statusText}>
          {ready ? `${onlineCount} of ${hosts.length} online` : 'Loading...'}
        </AppText>
        <View style={styles.statusLine} />
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
          <FadeIn>
            <GlassCard style={styles.scanCard} intensity={20}>
              <View style={styles.scanHeader}>
                <View style={styles.scanTitleRow}>
                  <Search size={18} color={colors.accent} />
                  <AppText variant="subtitle" style={{ fontWeight: '600' }}>Network Scan</AppText>
                </View>
                <Pressable
                  onPress={handleScan}
                  style={[styles.rescanButton, isScanning && styles.rescanButtonDisabled]}
                  disabled={isScanning}
                >
                  <AppText variant="caps" style={styles.rescanText}>
                    {isScanning ? 'Scanning...' : 'Rescan'}
                  </AppText>
                </Pressable>
              </View>
              
              {isScanning && (
                <AppText variant="body" tone="muted" style={styles.scanDesc}>
                  Looking for agents on local network port 4020...
                </AppText>
              )}
              
              {scanState.message ? (
                <View style={styles.scanError}>
                  <ShieldAlert size={16} color={colors.red} />
                  <AppText variant="body" style={{ color: colors.red }}>{scanState.message}</AppText>
                </View>
              ) : null}
              
              {scanState.status === 'done' && scanState.results.length === 0 ? (
                <AppText variant="body" tone="muted" style={styles.scanDesc}>
                  No agents found. Ensure your host is running and accessible.
                </AppText>
              ) : null}
              
              {scanState.results.length > 0 && (
                <View style={styles.scanResultsList}>
                  {scanState.results.map((agent, idx) => {
                    const isAdding = Boolean(addingAgents[agent.baseUrl]);
                    return (
                      <View key={agent.baseUrl} style={[styles.scanRow, idx > 0 && styles.scanRowBorder]}>
                        <View style={styles.scanInfo}>
                          <AppText variant="body" style={{ fontWeight: '500' }}>{agent.label}</AppText>
                          <AppText variant="mono" tone="muted" style={{ fontSize: 11 }}>{agent.baseUrl}</AppText>
                          {agent.status === 'auth-required' && (
                            <View style={styles.authPill}>
                              <AppText variant="caps" style={{ color: colors.orange, fontSize: 10 }}>Token Required</AppText>
                            </View>
                          )}
                        </View>
                        <Pressable
                          style={[styles.scanAddButton, isAdding && styles.scanAddButtonDisabled]}
                          onPress={() => handleAddAgent(agent)}
                          disabled={isAdding}
                        >
                          <AppText variant="label" style={styles.scanAddText}>
                            {isAdding ? 'Adding' : 'Add Host'}
                          </AppText>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </GlassCard>
          </FadeIn>
        )}

        {isBooting ? (
          <FadeIn delay={100}>
            <SkeletonList type="host" count={3} />
          </FadeIn>
        ) : hosts.length === 0 ? (
          <FadeIn style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Server size={32} color={colors.textMuted} />
            </View>
            <AppText variant="title">No hosts connected</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyBody}>
              Add a host running the Portal agent to manage sessions remotely.
            </AppText>
            <Pressable style={styles.cta} onPress={() => router.push('/hosts/new')}>
              <Plus size={18} color={colors.accentText} />
              <AppText variant="subtitle" style={styles.ctaText}>
                Add First Host
              </AppText>
            </Pressable>
          </FadeIn>
        ) : isInitialLoading ? (
          <FadeIn delay={100}>
            <SkeletonList type="host" count={hosts.length} />
          </FadeIn>
        ) : (
          <FadeIn delay={50}>
            <View style={styles.hostsContainer}>
              {hosts.map((host, index) => (
                <HostCard
                  key={host.id}
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
                  isFirst={index === 0}
                  isLast={index === hosts.length - 1}
                  onUpdate={() => handleUpdate(host.id)}
                  onPress={() => windowActions ? windowActions.openWindow('host-detail', { hostId: host.id }) : router.push(`/hosts/${host.id}`)}
                  onTerminal={() => handleTerminal(host.id)}
                />
              ))}
            </View>
          </FadeIn>
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
    marginBottom: 8,
    marginTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(colors.text, 0.05),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  statusText: {
    fontWeight: '600',
    letterSpacing: 1,
  },
  statusLine: {
    flex: 1,
    height: 1,
    backgroundColor: withAlpha(colors.text, 0.1),
  },
  scrollContent: {
    paddingBottom: 60,
  },
  hostsContainer: {
    gap: 4,
  },
  scanCard: {
    padding: 16,
    marginBottom: 20,
  },
  scanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scanTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rescanButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: withAlpha(colors.text, 0.05),
  },
  rescanButtonDisabled: {
    opacity: 0.5,
  },
  rescanText: {
    color: colors.text,
    fontWeight: '600',
  },
  scanDesc: {
    marginBottom: 8,
  },
  scanError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: withAlpha(colors.red, 0.1),
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  scanResultsList: {
    marginTop: 12,
    backgroundColor: withAlpha(colors.text, 0.02),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: withAlpha(colors.text, 0.05),
  },
  scanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  scanRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(colors.text, 0.05),
  },
  scanInfo: {
    flex: 1,
    gap: 4,
  },
  authPill: {
    alignSelf: 'flex-start',
    backgroundColor: withAlpha(colors.orange, 0.1),
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  scanAddButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  scanAddButtonDisabled: {
    backgroundColor: withAlpha(colors.text, 0.05),
  },
  scanAddText: {
    color: colors.accentText,
    fontWeight: '600',
  },
  empty: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: withAlpha(colors.text, 0.02),
    borderRadius: 24,
    borderWidth: 1,
    borderColor: withAlpha(colors.text, 0.05),
    marginTop: 20,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: withAlpha(colors.text, 0.05),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyBody: {
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 20,
    maxWidth: 240,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 100,
    paddingVertical: 14,
    paddingHorizontal: 24,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  ctaText: {
    color: colors.accentText,
    fontWeight: '600',
  },
});
