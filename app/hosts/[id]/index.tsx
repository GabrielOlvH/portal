import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Pill } from '@/components/Pill';
import { PulsingDot } from '@/components/PulsingDot';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import {
  getServiceStatus,
  restartService,
  dockerContainerAction,
  ServiceStatus,
} from '@/lib/api';
import { systemColors } from '@/lib/colors';
import { useHostLive } from '@/lib/live';
import { useStore } from '@/lib/store';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { DockerContainer, HostInfo } from '@/lib/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Play, Square, ChevronDown, ChevronRight } from 'lucide-react-native';

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

function formatUptime(seconds?: number) {
  if (!seconds || seconds <= 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function isContainerRunning(container: DockerContainer): boolean {
  if (container.state) return container.state.toLowerCase() === 'running';
  if (container.status) return container.status.toLowerCase().startsWith('up');
  return false;
}


export default function HostDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const { hosts, updateHostLastSeen, removeHost } = useStore();
  const host = hosts.find((item) => item.id === params.id);
  const [syncing, setSyncing] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const isFocused = useIsFocused();

  const { state, refresh } = useHostLive(host, {
    sessions: false,
    host: true,
    docker: true,
    enabled: isFocused,
  });

  const [dockerExpanded, setDockerExpanded] = useState(false);
  const [dockerActionInProgress, setDockerActionInProgress] = useState<string | null>(null);

  const status = state?.status ?? 'unknown';
  const error = state?.error ?? null;
  const hostInfo: HostInfo | undefined = state?.hostInfo;
  const dockerSnapshot = state?.docker;
  const containers = dockerSnapshot?.containers ?? [];
  const hasDocker = dockerSnapshot?.available === true;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const runningContainers = useMemo(
    () => containers.filter((c) => isContainerRunning(c)),
    [containers]
  );
  const stoppedContainers = useMemo(
    () => containers.filter((c) => !isContainerRunning(c)),
    [containers]
  );

  const handleDockerAction = useCallback(
    async (container: DockerContainer, action: 'start' | 'stop') => {
      if (!host) return;
      const actionLabel = action === 'start' ? 'Start' : 'Stop';
      Alert.alert(
        `${actionLabel} Container`,
        `${actionLabel} "${container.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: actionLabel,
            style: action === 'stop' ? 'destructive' : 'default',
            onPress: async () => {
              setDockerActionInProgress(container.id);
              try {
                await dockerContainerAction(host, container.id, action);
                refresh();
              } catch (err) {
                Alert.alert(
                  'Failed',
                  err instanceof Error ? err.message : `Could not ${action} container`
                );
              } finally {
                setDockerActionInProgress(null);
              }
            },
          },
        ]
      );
    },
    [host, refresh]
  );

  useEffect(() => {
    if (!host?.id || !state?.lastUpdate) return;
    if (host.lastSeen === state.lastUpdate) return;
    updateHostLastSeen(host.id, state.lastUpdate);
  }, [host?.id, host?.lastSeen, state?.lastUpdate, updateHostLastSeen]);

  useEffect(() => {
    if (!host || !isFocused) return;
    let cancelled = false;
    const fetchServiceStatus = async () => {
      try {
        const svcStatus = await getServiceStatus(host);
        if (!cancelled) {
          setServiceStatus(svcStatus);
          setServiceError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setServiceStatus(null);
          if (err instanceof Error && err.message.includes('404')) {
            setServiceError('Service info unavailable');
          } else {
            setServiceError(err instanceof Error ? err.message : 'Failed to fetch service status');
          }
        }
      }
    };
    fetchServiceStatus();
    return () => { cancelled = true; };
  }, [host, isFocused, state?.lastUpdate]);

  const handleRestartService = useCallback(async () => {
    if (!host || restarting) return;
    Alert.alert('Restart service', 'Restart the ter agent service?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restart',
        style: 'destructive',
        onPress: async () => {
          setRestarting(true);
          try {
            const result = await restartService(host);
            if (result.success) {
              Alert.alert('Service restarting', result.message);
            } else {
              Alert.alert('Restart failed', result.message);
            }
          } catch (err) {
            Alert.alert('Restart failed', err instanceof Error ? err.message : 'Unable to restart service.');
          } finally {
            setRestarting(false);
          }
        },
      },
    ]);
  }, [host, restarting]);

  if (!host) {
    return (
      <Screen>
        <AppText variant="title">Host not found</AppText>
        <Pressable onPress={() => router.replace('/')}
          style={{ marginTop: theme.spacing.md }}
        >
          <AppText variant="subtitle" tone="accent">
            Back to hosts
          </AppText>
        </Pressable>
      </Screen>
    );
  }

  const hostDisplay = (() => {
    try {
      return new URL(host.baseUrl).hostname;
    } catch {
      return host.baseUrl;
    }
  })();

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">{host.name}</AppText>
        <Pressable onPress={() => router.push(`/hosts/${host.id}/edit`)}>
          <AppText variant="caps" tone="accent">
            Edit
          </AppText>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={syncing}
            onRefresh={() => {
              setSyncing(true);
              refresh();
              setTimeout(() => setSyncing(false), 600);
            }}
            tintColor={systemColors.blue as string}
          />
        }
      >
        <View style={styles.statusRow}>
          <Pill
            label={status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Unknown'}
            tone={status === 'online' ? 'success' : status === 'offline' ? 'warning' : 'neutral'}
          />
          <AppText variant="label" tone="muted">
            {hostDisplay}
          </AppText>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <AppText variant="body" tone="clay">
              {error}
            </AppText>
          </View>
        ) : null}

        <SectionHeader title="System" />
        <Card style={styles.infoCard}>
          {hostInfo ? (
            <>
              <View style={styles.metricRow}>
                <AppText variant="caps" tone="muted" style={styles.metricLabel}>CPU</AppText>
                <View style={styles.metricBar}>
                  <View
                    style={[
                      styles.metricFill,
                      { width: `${Math.min(100, hostInfo.cpu.usage ?? 0)}%`, backgroundColor: colors.blue },
                    ]}
                  />
                </View>
                <AppText variant="mono" style={styles.metricValue}>
                  {hostInfo.cpu.usage !== undefined ? `${hostInfo.cpu.usage}%` : '-'}
                </AppText>
              </View>
              <View style={styles.metricRow}>
                <AppText variant="caps" tone="muted" style={styles.metricLabel}>RAM</AppText>
                <View style={styles.metricBar}>
                  <View
                    style={[
                      styles.metricFill,
                      { width: `${Math.min(100, hostInfo.memory.usedPercent)}%`, backgroundColor: colors.green },
                    ]}
                  />
                </View>
                <AppText variant="mono" style={styles.metricValue}>
                  {hostInfo.memory.usedPercent}%
                </AppText>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <AppText variant="caps" tone="muted">UP</AppText>
                  <AppText variant="mono">{formatUptime(hostInfo.uptime)}</AppText>
                </View>
                <View style={styles.statItem}>
                  <AppText variant="caps" tone="muted">LOAD</AppText>
                  <AppText variant="mono">{hostInfo.load[0]?.toFixed(2) ?? '-'}</AppText>
                </View>
                <View style={styles.statItem}>
                  <AppText variant="caps" tone="muted">MEM</AppText>
                  <AppText variant="mono">{formatBytes(hostInfo.memory.used)}</AppText>
                </View>
              </View>
              <AppText variant="label" tone="muted" style={styles.platformText}>
                {hostInfo.platform} {hostInfo.arch}
              </AppText>
            </>
          ) : (
            <AppText variant="body" tone="muted">
              Waiting for telemetry...
            </AppText>
          )}
        </Card>

        <SectionHeader title="Service" />
        <Card style={styles.serviceCard}>
          {serviceError ? (
            <AppText variant="body" tone="muted">{serviceError}</AppText>
          ) : serviceStatus ? (
            <>
              <View style={styles.serviceHeader}>
                <View style={styles.serviceStatusRow}>
                  <Pill
                    label={serviceStatus.status === 'running' ? 'Running' : serviceStatus.status === 'stopped' ? 'Stopped' : 'Unknown'}
                    tone={serviceStatus.status === 'running' ? 'success' : serviceStatus.status === 'stopped' ? 'warning' : 'neutral'}
                  />
                  <AppText variant="label" tone="muted">
                    {formatUptime(serviceStatus.uptimeSeconds)}
                  </AppText>
                </View>
                <AppText variant="label" tone="muted">
                  v{serviceStatus.version}
                </AppText>
              </View>
              <View style={styles.serviceInfo}>
                <View style={styles.serviceInfoRow}>
                  <AppText variant="caps" tone="muted">Platform</AppText>
                  <AppText variant="label">
                    {serviceStatus.platform} ({serviceStatus.initSystem})
                  </AppText>
                </View>
                <View style={styles.serviceInfoRow}>
                  <AppText variant="caps" tone="muted">PID</AppText>
                  <AppText variant="label">{serviceStatus.pid}</AppText>
                </View>
                <View style={styles.serviceInfoRow}>
                  <AppText variant="caps" tone="muted">Auto-restart</AppText>
                  <AppText variant="label">{serviceStatus.autoRestart ? 'Yes' : 'No'}</AppText>
                </View>
              </View>
              <View style={styles.serviceActions}>
                <Pressable
                  onPress={handleRestartService}
                  disabled={restarting}
                  style={[styles.serviceButton, restarting && styles.serviceButtonDisabled]}
                >
                  <AppText variant="caps" tone={restarting ? 'muted' : 'accent'}>
                    {restarting ? 'Restarting...' : 'Restart'}
                  </AppText>
                </Pressable>
              </View>
            </>
          ) : (
            <AppText variant="body" tone="muted">Loading service status...</AppText>
          )}
        </Card>

        {hasDocker && (
          <>
            <SectionHeader title={`Docker (${containers.length})`} />
            <Card style={styles.dockerCard}>
              <Pressable
                style={styles.dockerHeader}
                onPress={() => setDockerExpanded(!dockerExpanded)}
              >
                {dockerExpanded ? (
                  <ChevronDown size={18} color={colors.textMuted} />
                ) : (
                  <ChevronRight size={18} color={colors.textMuted} />
                )}
                <View style={styles.dockerHeaderInfo}>
                  <AppText variant="body">
                    {containers.length} container{containers.length !== 1 ? 's' : ''}
                  </AppText>
                  <View style={styles.dockerStats}>
                    {runningContainers.length > 0 && (
                      <View style={styles.dockerStat}>
                        <View style={[styles.statDot, { backgroundColor: colors.green }]} />
                        <AppText variant="caps" style={{ color: colors.green }}>
                          {runningContainers.length}
                        </AppText>
                      </View>
                    )}
                    {stoppedContainers.length > 0 && (
                      <View style={styles.dockerStat}>
                        <View style={[styles.statDot, { backgroundColor: colors.textMuted }]} />
                        <AppText variant="caps" tone="muted">
                          {stoppedContainers.length}
                        </AppText>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
              {dockerExpanded && (
                <View style={styles.dockerContainers}>
                  {containers.map((container, idx) => {
                    const isRunning = isContainerRunning(container);
                    const isActionLoading = dockerActionInProgress === container.id;
                    const isLast = idx === containers.length - 1;
                    return (
                      <Pressable
                        key={container.id}
                        style={[styles.containerRow, !isLast && styles.containerRowBorder]}
                        onPress={() => router.push(`/hosts/${host.id}/docker/${encodeURIComponent(container.id)}`)}
                      >
                        <PulsingDot
                          color={isRunning ? colors.accent : colors.textMuted}
                          active={isRunning}
                          size={8}
                        />
                        <View style={styles.containerInfo}>
                          <AppText variant="body" numberOfLines={1}>
                            {container.name}
                          </AppText>
                          <AppText variant="caps" tone="muted" numberOfLines={1}>
                            {container.image}
                          </AppText>
                        </View>
                        <View style={styles.containerActions}>
                          {isActionLoading ? (
                            <ActivityIndicator size="small" color={isRunning ? colors.red : colors.accent} />
                          ) : isRunning ? (
                            <Pressable
                              style={styles.actionButton}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDockerAction(container, 'stop');
                              }}
                              hitSlop={8}
                            >
                              <Square size={14} color={colors.red} />
                            </Pressable>
                          ) : (
                            <Pressable
                              style={styles.actionButton}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDockerAction(container, 'start');
                              }}
                              hitSlop={8}
                            >
                              <Play size={14} color={colors.accent} />
                            </Pressable>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Card>
          </>
        )}

        <Pressable
          onPress={() =>
            Alert.alert('Remove host', `Remove ${host.name}?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                  await removeHost(host.id);
                  router.replace('/');
                },
              },
            ])
          }
          style={styles.remove}
        >
          <AppText variant="caps" tone="clay">
            Remove host
          </AppText>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  errorBox: {
    backgroundColor: withAlpha(colors.red, 0.12),
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  infoCard: {
    padding: 12,
    gap: 8,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricLabel: {
    width: 36,
  },
  metricBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.barBg,
    borderRadius: 4,
    overflow: 'hidden',
  },
  metricFill: {
    height: '100%',
    borderRadius: 4,
  },
  metricValue: {
    width: 40,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  statItem: {
    gap: 2,
  },
  platformText: {
    marginTop: 4,
  },
  serviceCard: {
    padding: 14,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  serviceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serviceInfo: {
    gap: 6,
  },
  serviceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.sm,
    gap: 12,
  },
  serviceButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
    backgroundColor: colors.cardPressed,
  },
  serviceButtonDisabled: {
    opacity: 0.5,
  },
  remove: {
    marginTop: theme.spacing.lg,
    alignSelf: 'center',
  },
  dockerCard: {
    padding: 0,
    overflow: 'hidden',
  },
  dockerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.md,
  },
  dockerHeaderInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dockerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dockerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dockerContainers: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  containerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.md,
  },
  containerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  containerInfo: {
    flex: 1,
    gap: 2,
  },
  containerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
});
