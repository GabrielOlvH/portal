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
import { Play, Square, ChevronDown, ChevronRight, Cpu, MemoryStick, Clock, Activity, Server, Settings, RefreshCw, Box, Power, ArrowUpCircle, Trash2 } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { PulsingDot } from '@/components/PulsingDot';
import { DockerDetailView } from './DockerDetailView';
import { DockerLogsView } from './DockerLogsView';
import { DockerTerminalView } from './DockerTerminalView';
import { useWindowActions } from '@/lib/useWindowActions';
import {
  getServiceStatus,
  restartService,
  dockerContainerAction,
  ServiceStatus,
  getSystemStatus,
  triggerUpdate,
  createUpdateStream,
  SystemStatus,
  UpdateProgressEvent,
} from '@/lib/api';
import { systemColors, withAlpha } from '@/lib/colors';
import { useHostLive } from '@/lib/live';
import { useStore } from '@/lib/store';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { TIMING } from '@/lib/constants';
import { DockerContainer, HostInfo } from '@/lib/types';
import { formatBytes } from '@/lib/formatters';
import { isContainerRunning } from '@/lib/docker-utils';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinearGradient } from 'expo-linear-gradient';

function formatUptime(seconds?: number) {
  if (!seconds || seconds <= 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// Internal navigation stack for host detail
type InternalRoute =
  | { view: 'host' }
  | { view: 'docker-detail'; containerId: string }
  | { view: 'docker-logs'; containerId: string }
  | { view: 'docker-terminal'; containerId: string };

export function HostDetailWindow() {
  const { colors } = useTheme();
  const { params, isActive, closeWindow } = useWindowActions();
  const { hosts, updateHostLastSeen, removeHost } = useStore();
  const host = hosts.find((item) => item.id === params.hostId);

  const [route, setRoute] = useState<InternalRoute>({ view: 'host' });

  const goBack = useCallback(() => {
    if (route.view === 'docker-logs' || route.view === 'docker-terminal') {
      setRoute({ view: 'docker-detail', containerId: route.containerId });
    } else if (route.view === 'docker-detail') {
      setRoute({ view: 'host' });
    }
  }, [route]);

  const { state, refresh } = useHostLive(host, {
    sessions: false,
    host: true,
    docker: true,
    enabled: isActive,
  });

  if (!host) {
    return (
      <View style={{ flex: 1, padding: theme.spacing.md }}>
        <AppText variant="title">Host not found</AppText>
        <Pressable onPress={closeWindow} style={{ marginTop: theme.spacing.md }}>
          <AppText variant="subtitle" tone="accent">Close</AppText>
        </Pressable>
      </View>
    );
  }

  if (route.view === 'docker-detail') {
    return (
      <DockerDetailView
        host={host}
        containerId={route.containerId}
        isActive={isActive}
        onBack={goBack}
        onOpenLogs={(cId) => setRoute({ view: 'docker-logs', containerId: cId })}
        onOpenTerminal={(cId) => setRoute({ view: 'docker-terminal', containerId: cId })}
      />
    );
  }

  if (route.view === 'docker-logs') {
    return (
      <DockerLogsView
        host={host}
        containerId={route.containerId}
        onBack={goBack}
      />
    );
  }

  if (route.view === 'docker-terminal') {
    return (
      <DockerTerminalView
        host={host}
        containerId={route.containerId}
        onBack={goBack}
      />
    );
  }

  return (
    <HostOverview
      host={host}
      state={state}
      isActive={isActive}
      refresh={refresh}
      onOpenContainer={(cId) => setRoute({ view: 'docker-detail', containerId: cId })}
    />
  );
}

// ─── Host Overview (main view) ──────────────────────────────────────────────

function HostOverview({
  host,
  state,
  isActive,
  refresh,
  onOpenContainer,
}: {
  host: NonNullable<ReturnType<typeof useStore>['hosts'][number]>;
  state: ReturnType<typeof useHostLive>['state'];
  isActive: boolean;
  refresh: () => void;
  onOpenContainer: (containerId: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const { closeWindow } = useWindowActions();
  const { updateHostLastSeen, removeHost } = useStore();
  const [syncing, setSyncing] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [updateInProgress, setUpdateInProgress] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgressEvent | null>(null);
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
    if (!isActive) return;
    let cancelled = false;
    const fetchServiceStatus = async () => {
      try {
        try {
          const sysStatus = await getSystemStatus(host);
          if (!cancelled) {
            setSystemStatus(sysStatus);
            setServiceStatus(sysStatus.service);
            setServiceError(null);
          }
        } catch {
          const svcStatus = await getServiceStatus(host);
          if (!cancelled) {
            setServiceStatus(svcStatus);
            setServiceError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setServiceStatus(null);
          setSystemStatus(null);
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
  }, [host, isActive, state?.lastUpdate]);

  const handleRestartService = useCallback(async () => {
    if (restarting) return;
    Alert.alert('Restart service', 'Restart the Bridge agent service?', [
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

  const handleUpdate = useCallback(async () => {
    if (updateInProgress) return;

    const updateAvailable = systemStatus?.health?.update?.available;
    const currentVersion = systemStatus?.health?.update?.currentVersion;
    const latestVersion = systemStatus?.health?.update?.latestVersion;

    if (!updateAvailable) {
      Alert.alert('No updates', 'Your agent is up to date.');
      return;
    }

    Alert.alert(
      'Update available',
      `Update from ${currentVersion} to ${latestVersion}?\n\nThe agent will download, test, and automatically restart. If the update fails, it will roll back automatically.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          style: 'default',
          onPress: async () => {
            setUpdateInProgress(true);
            setUpdateProgress(null);

            try {
              const result = await triggerUpdate(host);
              if (!result.success) {
                Alert.alert('Update failed', result.message);
                setUpdateInProgress(false);
                return;
              }

              const cleanup = createUpdateStream(
                host,
                result.updateId,
                (event) => {
                  setUpdateProgress(event);
                  if (event.type === 'complete' || event.type === 'error') {
                    setUpdateInProgress(false);
                    cleanup();
                    if (event.type === 'complete') {
                      Alert.alert(
                        'Update complete',
                        `Successfully updated to ${event.newVersion || latestVersion}`,
                        [{ text: 'OK', onPress: () => refresh() }]
                      );
                    } else if (event.type === 'error') {
                      Alert.alert('Update failed', event.error || 'Unknown error');
                    }
                  }
                },
                (err) => {
                  console.error('SSE error:', err);
                  setUpdateInProgress(false);
                  Alert.alert('Update stream error', err.message);
                }
              );
            } catch (err) {
              setUpdateInProgress(false);
              Alert.alert('Update failed', err instanceof Error ? err.message : 'Unknown error');
            }
          },
        },
      ]
    );
  }, [host, updateInProgress, systemStatus, refresh]);

  const hostDisplay = (() => {
    try {
      return new URL(host.baseUrl).hostname;
    } catch {
      return host.baseUrl;
    }
  })();

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={syncing}
            onRefresh={() => {
              setSyncing(true);
              refresh();
              setTimeout(() => setSyncing(false), TIMING.SYNC_INDICATOR_MS);
            }}
            tintColor={systemColors.blue as string}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
              <Server size={28} color={colors.text} />
              <PulsingDot
                color={status === 'online' ? colors.green : status === 'offline' ? colors.red : colors.textMuted}
                active={status === 'online'}
                size={12}
                style={styles.headerPulsingDot}
              />
            </View>
            <View style={styles.headerTitles}>
              <AppText variant="title" style={styles.hostTitle}>{host.name}</AppText>
              <AppText variant="label" tone="muted">{hostDisplay}</AppText>
            </View>
          </View>
        </View>

        {error ? (
          <GlassCard style={styles.errorBox}>
            <AppText variant="body" style={{ color: colors.red }}>{error}</AppText>
          </GlassCard>
        ) : null}

        {hostInfo ? (
          <View style={styles.metricsGrid}>
            <GlassCard style={styles.metricCard}>
              <View style={styles.metricCardHeader}>
                <Cpu size={18} color={colors.blue} />
                <AppText variant="caps" tone="muted">CPU Usage</AppText>
              </View>
              <View style={styles.metricCardBody}>
                <AppText variant="title">{hostInfo.cpu.usage !== undefined ? `${hostInfo.cpu.usage}%` : '-'}</AppText>
                <View style={styles.metricBar}>
                  <LinearGradient
                    colors={[colors.blue, withAlpha(colors.blue, 0.4)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[
                      styles.metricFill,
                      { width: `${Math.min(100, hostInfo.cpu.usage ?? 0)}%` },
                    ]}
                  />
                </View>
              </View>
            </GlassCard>
            <GlassCard style={styles.metricCard}>
              <View style={styles.metricCardHeader}>
                <MemoryStick size={18} color={colors.green} />
                <AppText variant="caps" tone="muted">RAM Usage</AppText>
              </View>
              <View style={styles.metricCardBody}>
                <AppText variant="title">{hostInfo.memory.usedPercent}%</AppText>
                <View style={styles.metricBar}>
                  <LinearGradient
                    colors={[colors.green, withAlpha(colors.green, 0.4)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[
                      styles.metricFill,
                      { width: `${Math.min(100, hostInfo.memory.usedPercent)}%` },
                    ]}
                  />
                </View>
              </View>
            </GlassCard>
          </View>
        ) : (
          <GlassCard style={styles.loadingCard}>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <AppText variant="body" tone="muted">Waiting for telemetry...</AppText>
          </GlassCard>
        )}

        {hostInfo && (
          <GlassCard style={styles.statsCard}>
            <View style={styles.statGrid}>
              <View style={styles.statBlock}>
                <View style={styles.statBlockHeader}>
                  <Clock size={14} color={colors.textMuted} />
                  <AppText variant="caps" tone="muted">Uptime</AppText>
                </View>
                <AppText variant="body" style={styles.statValue}>{formatUptime(hostInfo.uptime)}</AppText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}>
                <View style={styles.statBlockHeader}>
                  <Activity size={14} color={colors.textMuted} />
                  <AppText variant="caps" tone="muted">Load</AppText>
                </View>
                <AppText variant="body" style={styles.statValue}>{hostInfo.load[0]?.toFixed(2) ?? '-'}</AppText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}>
                <View style={styles.statBlockHeader}>
                  <Box size={14} color={colors.textMuted} />
                  <AppText variant="caps" tone="muted">Platform</AppText>
                </View>
                <AppText variant="body" style={styles.statValue} numberOfLines={1}>{hostInfo.platform}</AppText>
              </View>
            </View>
          </GlassCard>
        )}

        <AppText variant="subtitle" style={styles.sectionTitle}>Agent Service</AppText>
        <GlassCard style={styles.serviceCard}>
          {serviceError ? (
            <AppText variant="body" tone="muted">{serviceError}</AppText>
          ) : serviceStatus ? (
            <>
              <View style={styles.serviceHeader}>
                <View style={styles.serviceStatusRow}>
                  <Settings size={18} color={colors.accent} />
                  <AppText variant="body">v{serviceStatus.version}</AppText>
                  <Pill
                    label={serviceStatus.status === 'running' ? 'Running' : serviceStatus.status === 'stopped' ? 'Stopped' : 'Unknown'}
                    tone={serviceStatus.status === 'running' ? 'success' : serviceStatus.status === 'stopped' ? 'warning' : 'neutral'}
                  />
                </View>
              </View>
              
              <View style={styles.serviceInfoGrid}>
                <View style={styles.serviceInfoCol}>
                  <AppText variant="caps" tone="muted">PID</AppText>
                  <AppText variant="label">{serviceStatus.pid}</AppText>
                </View>
                <View style={styles.serviceInfoCol}>
                  <AppText variant="caps" tone="muted">Auto-restart</AppText>
                  <AppText variant="label">{serviceStatus.autoRestart ? 'Yes' : 'No'}</AppText>
                </View>
                <View style={styles.serviceInfoCol}>
                  <AppText variant="caps" tone="muted">Uptime</AppText>
                  <AppText variant="label">{formatUptime(serviceStatus.uptimeSeconds)}</AppText>
                </View>
              </View>

              <View style={styles.serviceActions}>
                {systemStatus?.health?.update?.available && !updateInProgress && (
                  <Pressable onPress={handleUpdate} style={styles.updateButton}>
                    <LinearGradient
                      colors={[withAlpha(colors.accent, 0.2), withAlpha(colors.accent, 0.05)]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <ArrowUpCircle size={16} color={colors.accent} />
                    <AppText variant="label" tone="accent" style={{ fontWeight: '600' }}>
                      Update ({systemStatus.health.update.currentVersion} → {systemStatus.health.update.latestVersion})
                    </AppText>
                  </Pressable>
                )}
                
                {updateInProgress && updateProgress && (
                  <View style={styles.updateProgressContainer}>
                    <AppText variant="caps" tone="muted">{updateProgress.message}</AppText>
                    {updateProgress.progress !== undefined && (
                      <View style={styles.progressBar}>
                        <LinearGradient
                          colors={[colors.accent, withAlpha(colors.accent, 0.5)]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[
                            styles.progressFill,
                            { width: `${updateProgress.progress}%` },
                          ]}
                        />
                      </View>
                    )}
                  </View>
                )}

                <Pressable
                  onPress={handleRestartService}
                  disabled={restarting}
                  style={[styles.restartButton, restarting && styles.serviceButtonDisabled]}
                >
                  <Power size={16} color={colors.text} />
                  <AppText variant="label" tone={restarting ? 'muted' : 'base'}>
                    {restarting ? 'Restarting...' : 'Restart Agent'}
                  </AppText>
                </Pressable>
              </View>
            </>
          ) : (
            <ActivityIndicator size="small" color={colors.textMuted} />
          )}
        </GlassCard>

        {hasDocker && (
          <>
            <AppText variant="subtitle" style={styles.sectionTitle}>Docker Containers</AppText>
            <GlassCard style={styles.dockerCard} intensity={15}>
              <Pressable
                style={styles.dockerHeader}
                onPress={() => setDockerExpanded(!dockerExpanded)}
              >
                <View style={styles.dockerHeaderLeft}>
                  <Box size={20} color={colors.accent} />
                  <AppText variant="body" style={{ fontWeight: '600' }}>
                    {containers.length} Container{containers.length !== 1 ? 's' : ''}
                  </AppText>
                </View>
                <View style={styles.dockerHeaderRight}>
                  {runningContainers.length > 0 && (
                    <View style={styles.dockerStat}>
                      <View style={[styles.statDot, { backgroundColor: colors.green }]} />
                      <AppText variant="label" style={{ color: colors.green }}>{runningContainers.length}</AppText>
                    </View>
                  )}
                  {stoppedContainers.length > 0 && (
                    <View style={styles.dockerStat}>
                      <View style={[styles.statDot, { backgroundColor: colors.textMuted }]} />
                      <AppText variant="label" tone="muted">{stoppedContainers.length}</AppText>
                    </View>
                  )}
                  {dockerExpanded ? (
                    <ChevronDown size={20} color={colors.textMuted} style={{ marginLeft: 8 }} />
                  ) : (
                    <ChevronRight size={20} color={colors.textMuted} style={{ marginLeft: 8 }} />
                  )}
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
                        style={[styles.containerRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}
                        onPress={() => onOpenContainer(container.id)}
                      >
                        <PulsingDot
                          color={isRunning ? colors.accent : colors.textMuted}
                          active={isRunning}
                          size={10}
                        />
                        <View style={styles.containerInfo}>
                          <AppText variant="body" numberOfLines={1} style={{ fontWeight: '500' }}>{container.name}</AppText>
                          <AppText variant="caps" tone="muted" numberOfLines={1}>{container.image}</AppText>
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
                              <Square size={16} color={colors.red} fill={withAlpha(colors.red, 0.2)} />
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
                              <Play size={16} color={colors.accent} fill={withAlpha(colors.accent, 0.2)} />
                            </Pressable>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </GlassCard>
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
                  closeWindow();
                },
              },
            ])
          }
          style={styles.remove}
        >
          <Trash2 size={16} color={colors.red} style={{ opacity: 0.8 }} />
          <AppText variant="label" style={{ color: colors.red, opacity: 0.8 }}>Remove Host</AppText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.md,
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(colors.text, 0.05),
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerPulsingDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    borderWidth: 2,
    borderColor: colors.background,
  },
  headerTitles: {
    gap: 2,
  },
  hostTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  errorBox: {
    padding: theme.spacing.md,
    backgroundColor: withAlpha(colors.red, 0.1),
    borderWidth: 1,
    borderColor: withAlpha(colors.red, 0.2),
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricCardBody: {
    gap: 8,
  },
  metricBar: {
    height: 8,
    backgroundColor: withAlpha(colors.text, 0.05),
    borderRadius: 4,
    overflow: 'hidden',
  },
  metricFill: {
    height: '100%',
    borderRadius: 4,
  },
  loadingCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  statsCard: {
    padding: 16,
  },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statBlock: {
    flex: 1,
    gap: 4,
    alignItems: 'center',
  },
  statBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: withAlpha(colors.text, 0.1),
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: -4,
    fontSize: 18,
    fontWeight: '600',
  },
  serviceCard: {
    padding: 16,
    gap: 16,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  serviceInfoGrid: {
    flexDirection: 'row',
    backgroundColor: withAlpha(colors.text, 0.03),
    borderRadius: 8,
    padding: 12,
  },
  serviceInfoCol: {
    flex: 1,
    gap: 4,
  },
  serviceActions: {
    gap: 8,
  },
  restartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: withAlpha(colors.text, 0.05),
    borderRadius: 8,
  },
  serviceButtonDisabled: {
    opacity: 0.5,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: withAlpha(colors.accent, 0.2),
  },
  updateProgressContainer: {
    gap: 8,
    padding: 12,
    backgroundColor: withAlpha(colors.accent, 0.05),
    borderRadius: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: withAlpha(colors.text, 0.05),
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  dockerCard: {
    overflow: 'hidden',
  },
  dockerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  dockerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dockerHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dockerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: withAlpha(colors.text, 0.05),
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dockerContainers: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(colors.text, 0.1),
    backgroundColor: withAlpha(colors.text, 0.02),
  },
  containerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
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
    padding: 8,
    backgroundColor: withAlpha(colors.text, 0.05),
    borderRadius: 8,
  },
  remove: {
    marginTop: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 100,
    backgroundColor: withAlpha(colors.red, 0.1),
  },
});
