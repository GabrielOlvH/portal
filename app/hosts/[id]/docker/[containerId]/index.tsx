import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { SectionHeader } from '@/components/SectionHeader';
import { useStore } from '@/lib/store';
import { useHostLive } from '@/lib/live';
import { dockerContainerAction } from '@/lib/api';
import { DockerContainer } from '@/lib/types';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { formatBytes } from '@/lib/formatters';
import { isContainerRunning } from '@/lib/docker-utils';
import { withAlpha } from '@/lib/colors';

export default function DockerContainerScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id: string; containerId: string }>();
  const { hosts } = useStore();
  const host = hosts.find((item) => item.id === params.id);
  const isFocused = useIsFocused();
  const { state, refresh } = useHostLive(host, { docker: true, enabled: isFocused });
  const docker = state?.docker;
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const container = useMemo(() => {
    if (!docker?.containers || !params.containerId) return null;
    const id = decodeURIComponent(params.containerId);
    return docker.containers.find((item) => item.id === id || item.name === id) || null;
  }, [docker?.containers, params.containerId]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!host) {
    return (
      <Screen>
        <AppText variant="title">Host not found</AppText>
      </Screen>
    );
  }

  if (!docker || !docker.available) {
    return (
      <Screen>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <AppText variant="subtitle">Back</AppText>
          </Pressable>
        </View>
        <View style={styles.noticeCard}>
          <AppText variant="body" tone="clay">{docker?.error || 'Docker unavailable'}</AppText>
        </View>
      </Screen>
    );
  }

  if (!container) {
    return (
      <Screen>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <AppText variant="subtitle">Back</AppText>
          </Pressable>
        </View>
        <View style={styles.noticeCard}>
          <AppText variant="body" tone="muted">Container not found</AppText>
        </View>
      </Screen>
    );
  }

  const running = isContainerRunning(container);
  const actionButton = (action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill', label: string, tone?: 'accent' | 'clay') => (
    <Pressable
      key={action}
      style={[styles.actionButton, tone === 'clay' && styles.actionButtonDanger]}
      onPress={() => {
        if (!host) return;
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
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <AppText variant="subtitle">Back</AppText>
        </Pressable>
        <View style={styles.headerCenter}>
          <AppText variant="title" numberOfLines={1}>{container.name}</AppText>
          <AppText variant="caps" tone="muted">{container.image}</AppText>
        </View>
        <Pressable
          onPress={() => router.push(`/hosts/${host.id}/docker/${encodeURIComponent(container.id)}/logs`)}
          style={styles.attachButton}
        >
          <AppText variant="caps" tone="muted">Logs</AppText>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/hosts/${host.id}/docker/${encodeURIComponent(container.id)}/terminal`)}
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
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: theme.spacing.sm,
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 4,
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
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    ...theme.shadow.card,
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
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.sm,
    gap: 10,
    ...theme.shadow.card,
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
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: 10,
    ...theme.shadow.card,
  },
  detailRow: {
    gap: 4,
  },
  noticeCard: {
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    ...theme.shadow.card,
  },
});


