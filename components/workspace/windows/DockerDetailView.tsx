import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { SectionHeader } from '@/components/SectionHeader';
import { useHostLive } from '@/lib/live';
import { dockerContainerAction } from '@/lib/api';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { formatBytes } from '@/lib/formatters';
import { isContainerRunning } from '@/lib/docker-utils';
import { withAlpha } from '@/lib/colors';
import type { Host } from '@/lib/types';

export function DockerDetailView({
  host,
  containerId,
  isActive,
  onBack,
  onOpenLogs,
  onOpenTerminal,
}: {
  host: Host;
  containerId: string;
  isActive: boolean;
  onBack: () => void;
  onOpenLogs: (containerId: string) => void;
  onOpenTerminal: (containerId: string) => void;
}) {
  const { colors } = useTheme();
  const { state, refresh } = useHostLive(host, { docker: true, enabled: isActive });
  const docker = state?.docker;
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const container = useMemo(() => {
    if (!docker?.containers || !containerId) return null;
    const id = decodeURIComponent(containerId);
    return docker.containers.find((item) => item.id === id || item.name === id) || null;
  }, [docker?.containers, containerId]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!docker || !docker.available) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
            <ChevronLeft size={20} color={colors.text} />
          </Pressable>
          <AppText variant="title">Docker</AppText>
        </View>
        <View style={styles.noticeCard}>
          <AppText variant="body" tone="clay">{docker?.error || 'Docker unavailable'}</AppText>
        </View>
      </View>
    );
  }

  if (!container) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
            <ChevronLeft size={20} color={colors.text} />
          </Pressable>
          <AppText variant="title">Container</AppText>
        </View>
        <View style={styles.noticeCard}>
          <AppText variant="body" tone="muted">Container not found</AppText>
        </View>
      </View>
    );
  }

  const running = isContainerRunning(container);
  const actionButton = (action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill', label: string, tone?: 'accent' | 'clay') => (
    <Pressable
      key={action}
      style={[styles.actionButton, tone === 'clay' && styles.actionButtonDanger]}
      onPress={() => {
        Alert.alert(label, `${label} ${container.name}?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: label,
            style: tone === 'clay' ? 'destructive' : 'default',
            onPress: async () => {
              setBusyAction(action);
              try {
                await dockerContainerAction(host, container.id, action);
                refresh();
              } catch (err) {
                Alert.alert('Action failed', err instanceof Error ? err.message : 'Unable to run docker command.');
              } finally {
                setBusyAction(null);
              }
            },
          },
        ]);
      }}
      disabled={busyAction !== null}
    >
      <AppText variant="caps" style={tone === 'clay' ? styles.actionTextDanger : styles.actionText}>
        {busyAction === action ? 'Working...' : label}
      </AppText>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
          <ChevronLeft size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <AppText variant="title" numberOfLines={1}>{container.name}</AppText>
          <AppText variant="caps" tone="muted">{container.image}</AppText>
        </View>
        <Pressable
          onPress={() => onOpenLogs(encodeURIComponent(container.id))}
          style={styles.attachButton}
        >
          <AppText variant="caps" tone="muted">Logs</AppText>
        </Pressable>
        <Pressable
          onPress={() => onOpenTerminal(encodeURIComponent(container.id))}
          style={styles.attachButton}
        >
          <AppText variant="caps" tone="accent">Terminal</AppText>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <AppText variant="caps" tone="muted">Status</AppText>
              <AppText variant="label" style={running ? styles.statusRunning : styles.statusStopped}>
                {container.state || container.status || 'unknown'}
              </AppText>
            </View>
            <View style={styles.statusItem}>
              <AppText variant="caps" tone="muted">CPU</AppText>
              <AppText variant="label">
                {container.cpuPercent !== undefined ? `${container.cpuPercent.toFixed(1)}%` : '-'}
              </AppText>
            </View>
            <View style={styles.statusItem}>
              <AppText variant="caps" tone="muted">Memory</AppText>
              <AppText variant="label">
                {container.memoryUsage || formatBytes(container.memoryUsedBytes)}
              </AppText>
            </View>
          </View>
        </View>

        <SectionHeader title="Controls" />
        <View style={styles.actionsRow}>
          {running ? actionButton('stop', 'Stop') : actionButton('start', 'Start')}
          {actionButton('restart', 'Restart')}
          {running ? actionButton('pause', 'Pause') : actionButton('unpause', 'Unpause')}
          {actionButton('kill', 'Kill', 'clay')}
        </View>

        <SectionHeader title="Details" />
        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <AppText variant="caps" tone="muted">ID</AppText>
            <AppText variant="label" numberOfLines={1}>{container.id}</AppText>
          </View>
          <View style={styles.detailRow}>
            <AppText variant="caps" tone="muted">Image</AppText>
            <AppText variant="label" numberOfLines={1}>{container.image}</AppText>
          </View>
          {container.ports ? (
            <View style={styles.detailRow}>
              <AppText variant="caps" tone="muted">Ports</AppText>
              <AppText variant="label" numberOfLines={2}>{container.ports}</AppText>
            </View>
          ) : null}
          {container.runningFor ? (
            <View style={styles.detailRow}>
              <AppText variant="caps" tone="muted">Running</AppText>
              <AppText variant="label">{container.runningFor}</AppText>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
  },
  attachButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  statusCard: {
    padding: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusItem: {
    flex: 1,
    gap: 4,
  },
  statusRunning: {
    color: colors.green,
  },
  statusStopped: {
    color: colors.red,
  },
  actionsRow: {
    padding: theme.spacing.sm,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  actionButton: {
    paddingVertical: 10,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    backgroundColor: colors.cardPressed,
  },
  actionButtonDanger: {
    backgroundColor: withAlpha(colors.red, 0.12),
  },
  actionText: {
    color: colors.accent,
  },
  actionTextDanger: {
    color: colors.red,
  },
  detailCard: {
    padding: theme.spacing.md,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  detailRow: {
    gap: 4,
  },
  noticeCard: {
    padding: theme.spacing.md,
  },
});
