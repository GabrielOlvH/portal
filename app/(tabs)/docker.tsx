import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
  ActivityIndicator,
  type ColorValue,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Play, Square, Terminal } from 'lucide-react-native';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { Card } from '@/components/Card';
import { PulsingDot } from '@/components/PulsingDot';
import { SectionHeader } from '@/components/SectionHeader';
import { SkeletonList } from '@/components/Skeleton';
import { hostColors, systemColors } from '@/lib/colors';
import {
  useAllDocker,
  ContainerWithHost,
  isContainerRunning,
  formatBytes,
} from '@/lib/docker-hooks';
import { dockerContainerAction } from '@/lib/api';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { Host } from '@/lib/types';
import { useStore } from '@/lib/store';

type HostFilter = string | null;

export default function DockerTabScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ hostId?: string }>();
  const { ready } = useStore();
  const {
    containers,
    running,
    stopped,
    refreshAll,
    refreshHost,
    hosts,
    isLoading,
    hasDocker,
  } = useAllDocker();

  const [manualRefresh, setManualRefresh] = useState(false);
  const [hostFilter, setHostFilter] = useState<HostFilter>(params.hostId ?? null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (params.hostId) {
      setHostFilter(params.hostId);
    }
  }, [params.hostId]);

  const filteredRunning = useMemo(() => {
    if (!hostFilter) return running;
    return running.filter((c) => c.host.id === hostFilter);
  }, [running, hostFilter]);

  const filteredStopped = useMemo(() => {
    if (!hostFilter) return stopped;
    return stopped.filter((c) => c.host.id === hostFilter);
  }, [stopped, hostFilter]);

  const hostsWithContainers = useMemo(() => {
    const hostIds = new Set(containers.map((c) => c.host.id));
    return hosts.filter((h) => hostIds.has(h.id));
  }, [hosts, containers]);

  const handleRefresh = useCallback(() => {
    setManualRefresh(true);
    refreshAll();
    setTimeout(() => setManualRefresh(false), 600);
  }, [refreshAll]);

  const handleContainerAction = useCallback(
    async (container: ContainerWithHost, action: 'start' | 'stop') => {
      const actionLabel = action === 'start' ? 'Start' : 'Stop';
      Alert.alert(
        `${actionLabel} Container`,
        `${actionLabel} "${container.name}" on ${container.host.name}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: actionLabel,
            style: action === 'stop' ? 'destructive' : 'default',
            onPress: async () => {
              setActionInProgress(container.id);
              try {
                await dockerContainerAction(container.host, container.id, action);
                refreshHost(container.host.id);
              } catch (err) {
                Alert.alert(
                  'Failed',
                  err instanceof Error ? err.message : `Could not ${action} container`
                );
              } finally {
                setActionInProgress(null);
              }
            },
          },
        ]
      );
    },
    [refreshHost]
  );

  const handleTerminal = useCallback(
    (container: ContainerWithHost) => {
      router.push(`/hosts/${container.host.id}/docker/${encodeURIComponent(container.id)}`);
    },
    [router]
  );

  const renderHostChip = (host: Host, index: number) => {
    const isSelected = hostFilter === host.id;
    const containerCount = containers.filter((c) => c.host.id === host.id).length;
    const chipColor = host.color || hostColors[index % hostColors.length];

    return (
      <Pressable
        key={host.id}
        style={[
          styles.hostChip,
          isSelected && styles.hostChipSelected,
          isSelected && { borderColor: chipColor },
        ]}
        onPress={() => setHostFilter(isSelected ? null : host.id)}
      >
        <View style={[styles.hostChipDot, { backgroundColor: chipColor }]} />
        <AppText
          variant="caps"
          style={[styles.hostChipText, isSelected && { color: chipColor }]}
        >
          {host.name}
        </AppText>
        <AppText variant="caps" tone="muted" style={styles.hostChipCount}>
          {containerCount}
        </AppText>
      </Pressable>
    );
  };

  const renderContainer = (container: ContainerWithHost, index: number) => {
    const isRunning = isContainerRunning(container);
    const isActionLoading = actionInProgress === container.id;
    const hostColor = container.host.color || colors.accent;

    return (
      <FadeIn key={container.id} delay={index * 30}>
        <Pressable onPress={() => handleTerminal(container)}>
          <Card style={styles.containerCard}>
            <View style={styles.containerHeader}>
              <PulsingDot
                color={isRunning ? colors.accent : colors.textMuted}
                active={isRunning}
                size={8}
              />
              <View style={styles.containerInfo}>
                <AppText variant="subtitle" numberOfLines={1}>
                  {container.name}
                </AppText>
                <View style={styles.containerMeta}>
                  <View style={[styles.hostBadge, { backgroundColor: withAlpha(hostColor, 0.12) }]}>
                    <View style={[styles.hostBadgeDot, { backgroundColor: hostColor }]} />
                    <AppText variant="caps" style={[styles.hostBadgeText, { color: hostColor }]}>
                      {container.host.name}
                    </AppText>
                  </View>
                  <AppText variant="caps" tone="muted">
                    {container.state || container.status || 'unknown'}
                  </AppText>
                </View>
              </View>
            </View>

            <View style={styles.containerStats}>
              {container.cpuPercent !== undefined && (
                <View style={styles.stat}>
                  <AppText variant="caps" tone="muted">
                    CPU
                  </AppText>
                  <AppText variant="mono" style={styles.statValue}>
                    {container.cpuPercent.toFixed(1)}%
                  </AppText>
                </View>
              )}
              {(container.memoryUsage || container.memoryUsedBytes) && (
                <View style={styles.stat}>
                  <AppText variant="caps" tone="muted">
                    Memory
                  </AppText>
                  <AppText variant="mono" style={styles.statValue}>
                    {container.memoryUsage || formatBytes(container.memoryUsedBytes)}
                  </AppText>
                </View>
              )}
              {container.ports && (
                <View style={[styles.stat, styles.statWide]}>
                  <AppText variant="caps" tone="muted">
                    Ports
                  </AppText>
                  <AppText variant="mono" numberOfLines={1} style={styles.statValue}>
                    {container.ports}
                  </AppText>
                </View>
              )}
            </View>

            <View style={styles.containerActions}>
              <Pressable
                style={[styles.actionButton, styles.actionButtonTerminal]}
                onPress={() => handleTerminal(container)}
                disabled={isActionLoading}
              >
                <Terminal size={16} color={colors.accent} />
                <AppText variant="caps" style={styles.actionButtonTextTerminal}>
                  Terminal
                </AppText>
              </Pressable>

              {isRunning ? (
                <Pressable
                  style={[styles.actionButton, styles.actionButtonStop]}
                  onPress={() => handleContainerAction(container, 'stop')}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? (
                    <ActivityIndicator size="small" color={colors.red} />
                  ) : (
                    <>
                      <Square size={14} color={colors.red} />
                      <AppText variant="caps" style={styles.actionButtonTextStop}>
                        Stop
                      </AppText>
                    </>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.actionButton, styles.actionButtonStart]}
                  onPress={() => handleContainerAction(container, 'start')}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <>
                      <Play size={14} color={colors.accent} />
                      <AppText variant="caps" style={styles.actionButtonTextStart}>
                        Start
                      </AppText>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          </Card>
        </Pressable>
      </FadeIn>
    );
  };

  if (!ready) {
    return (
      <Screen>
        <FadeIn delay={100}>
          <SkeletonList type="container" count={4} />
        </FadeIn>
      </Screen>
    );
  }

  if (hosts.length === 0) {
    return (
      <Screen>
        <FadeIn delay={100}>
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIconContainer}>
              <AppText variant="title" style={styles.emptyIcon}>
                {/* Container icon placeholder */}
              </AppText>
            </View>
            <AppText variant="subtitle">No hosts configured</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyBody}>
              Add a host to view and manage Docker containers across your servers.
            </AppText>
            <Pressable style={styles.cta} onPress={() => router.push('/hosts/new')}>
              <AppText variant="subtitle" style={styles.ctaText}>
                Add Host
              </AppText>
            </Pressable>
          </Card>
        </FadeIn>
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen>
        <FadeIn delay={100}>
          <SkeletonList type="container" count={4} />
        </FadeIn>
      </Screen>
    );
  }

  if (!hasDocker && containers.length === 0) {
    return (
      <Screen>
        <FadeIn delay={100}>
          <Card style={styles.emptyCard}>
            <AppText variant="subtitle">No Docker available</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyBody}>
              Docker is not available on any of your connected hosts, or no containers exist.
            </AppText>
            <Pressable style={styles.ctaSecondary} onPress={handleRefresh}>
              <AppText variant="caps" style={styles.ctaSecondaryText}>
                Refresh
              </AppText>
            </Pressable>
          </Card>
        </FadeIn>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={manualRefresh}
            onRefresh={handleRefresh}
            tintColor={systemColors.blue as string}
          />
        }
      >
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <AppText variant="title" style={styles.summaryValue}>
              {running.length}
            </AppText>
            <AppText variant="caps" tone="muted">
              Running
            </AppText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <AppText variant="title" style={styles.summaryValue}>
              {stopped.length}
            </AppText>
            <AppText variant="caps" tone="muted">
              Stopped
            </AppText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <AppText variant="title" style={styles.summaryValue}>
              {hostsWithContainers.length}
            </AppText>
            <AppText variant="caps" tone="muted">
              Hosts
            </AppText>
          </View>
        </View>

        {hostsWithContainers.length > 1 && (
          <View style={styles.hostFilters}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hostFiltersContent}
            >
              <Pressable
                style={[styles.hostChip, !hostFilter && styles.hostChipSelected]}
                onPress={() => setHostFilter(null)}
              >
                <AppText
                  variant="caps"
                  style={[styles.hostChipText, !hostFilter && { color: colors.accent }]}
                >
                  All Hosts
                </AppText>
              </Pressable>
              {hostsWithContainers.map((host, index) => renderHostChip(host, index))}
            </ScrollView>
          </View>
        )}

        {filteredRunning.length > 0 && (
          <>
            <SectionHeader title={`Running (${filteredRunning.length})`} />
            <View style={styles.containerList}>
              {filteredRunning.map((container, index) => renderContainer(container, index))}
            </View>
          </>
        )}

        {filteredStopped.length > 0 && (
          <>
            <SectionHeader title={`Stopped (${filteredStopped.length})`} />
            <View style={styles.containerList}>
              {filteredStopped.map((container, index) =>
                renderContainer(container, filteredRunning.length + index)
              )}
            </View>
          </>
        )}

        {filteredRunning.length === 0 && filteredStopped.length === 0 && hostFilter && (
          <FadeIn>
            <Card style={styles.emptyFiltered}>
              <AppText variant="body" tone="muted">
                No containers on this host
              </AppText>
              <Pressable onPress={() => setHostFilter(null)}>
                <AppText variant="caps" style={styles.clearFilter}>
                  Show all
                </AppText>
              </Pressable>
            </Card>
          </FadeIn>
        )}
      </ScrollView>
    </Screen>
  );
}

function withAlpha(color: ColorValue, alpha: number): ColorValue {
  if (typeof color !== 'string') return color;
  const trimmed = color.trim();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : '';
  if (hex.length !== 3 && hex.length !== 6) return color;
  const normalized = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((value) => Number.isNaN(value))) return color;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  summaryItem: {
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '600',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.separator,
  },
  hostFilters: {
    marginBottom: theme.spacing.xs,
  },
  hostFiltersContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  hostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.cardPressed,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  hostChipSelected: {
    backgroundColor: colors.card,
    borderColor: colors.accent,
  },
  hostChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hostChipText: {
    color: colors.textMuted,
  },
  hostChipCount: {
    fontSize: 10,
  },
  containerList: {
    gap: theme.spacing.sm,
  },
  containerCard: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  containerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  statusRunning: {
    backgroundColor: colors.green,
    shadowColor: colors.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  statusStopped: {
    backgroundColor: colors.textMuted,
  },
  containerInfo: {
    flex: 1,
    gap: 4,
  },
  containerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  hostBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  containerStats: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  stat: {
    gap: 2,
  },
  statWide: {
    flex: 1,
    minWidth: 80,
  },
  statValue: {
    fontSize: 13,
  },
  containerActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radii.sm,
    minWidth: 90,
  },
  actionButtonTerminal: {
    backgroundColor: withAlpha(colors.green, 0.12),
  },
  actionButtonStart: {
    backgroundColor: withAlpha(colors.green, 0.12),
  },
  actionButtonStop: {
    backgroundColor: withAlpha(colors.red, 0.12),
  },
  actionButtonTextTerminal: {
    color: colors.green,
    fontWeight: '600',
  },
  actionButtonTextStart: {
    color: colors.green,
    fontWeight: '600',
  },
  actionButtonTextStop: {
    color: colors.red,
    fontWeight: '600',
  },
  emptyCard: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.cardPressed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  emptyIcon: {
    color: colors.textSecondary,
  },
  emptyBody: {
    textAlign: 'center',
    maxWidth: 260,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: theme.spacing.sm,
  },
  ctaText: {
    color: colors.accentText,
  },
  ctaSecondary: {
    backgroundColor: colors.cardPressed,
    borderRadius: theme.radii.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: theme.spacing.sm,
  },
  ctaSecondaryText: {
    color: colors.accent,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    marginTop: theme.spacing.xs,
  },
  emptyFiltered: {
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  clearFilter: {
    color: colors.accent,
    marginTop: theme.spacing.xs,
  },
});
