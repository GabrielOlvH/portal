import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { ChevronLeft, TerminalSquare, FileText, Play, Square, Pause, Power, RotateCw, Trash2, Box, Cpu, MemoryStick, Clock } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { useHostLive } from '@/lib/live';
import { dockerContainerAction } from '@/lib/api';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { formatBytes } from '@/lib/formatters';
import { isContainerRunning } from '@/lib/docker-utils';
import { withAlpha } from '@/lib/colors';
import { GlassCard } from '@/components/ui/GlassCard';
import type { Host } from '@/lib/types';
import { PulsingDot } from '@/components/PulsingDot';

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
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <AppText variant="title">Docker</AppText>
        </View>
        <GlassCard style={styles.noticeCard}>
          <AppText variant="body" style={{ color: colors.red }}>{docker?.error || 'Docker unavailable'}</AppText>
        </GlassCard>
      </View>
    );
  }

  if (!container) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <AppText variant="title">Container</AppText>
        </View>
        <GlassCard style={styles.noticeCard}>
          <AppText variant="body" tone="muted">Container not found</AppText>
        </GlassCard>
      </View>
    );
  }

  const running = isContainerRunning(container);
  
  const handleAction = (action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'kill', label: string, isDestructive?: boolean) => {
    Alert.alert(label, `${label} ${container.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: label,
        style: isDestructive ? 'destructive' : 'default',
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
  };

  const ActionButton = ({ action, label, icon: Icon, tone = 'base' }: { action: any, label: string, icon: any, tone?: 'base'|'accent'|'red' }) => {
    const isBusy = busyAction === action;
    const colorMap = {
      base: colors.text,
      accent: colors.accent,
      red: colors.red,
    };
    const activeColor = colorMap[tone];

    return (
      <Pressable
        style={[
          styles.actionButton,
          tone === 'red' && { backgroundColor: withAlpha(colors.red, 0.1) }
        ]}
        onPress={() => handleAction(action, label, tone === 'red')}
        disabled={busyAction !== null}
      >
        <Icon size={20} color={isBusy ? colors.textMuted : activeColor} />
        <AppText variant="label" style={{ color: isBusy ? colors.textMuted : activeColor }}>
          {isBusy ? '...' : label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.titleRow}>
            <Box size={20} color={colors.text} />
            <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>{container.name}</AppText>
          </View>
          <AppText variant="label" tone="muted" numberOfLines={1}>{container.image}</AppText>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.quickActions}>
          <Pressable
            onPress={() => onOpenLogs(encodeURIComponent(container.id))}
            style={styles.quickActionBtn}
          >
            <FileText size={20} color={colors.text} />
            <AppText variant="label">View Logs</AppText>
          </Pressable>
          <Pressable
            onPress={() => onOpenTerminal(encodeURIComponent(container.id))}
            style={[styles.quickActionBtn, { backgroundColor: withAlpha(colors.accent, 0.1) }]}
          >
            <TerminalSquare size={20} color={colors.accent} />
            <AppText variant="label" tone="accent">Open Terminal</AppText>
          </Pressable>
        </View>

        <GlassCard style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.statusPill}>
              <PulsingDot
                color={running ? colors.green : colors.red}
                active={running}
                size={12}
              />
              <AppText variant="label" style={{ color: running ? colors.green : colors.red, fontWeight: '600', textTransform: 'capitalize' }}>
                {container.state || container.status || 'unknown'}
              </AppText>
            </View>
            {container.runningFor && (
              <View style={styles.timeInfo}>
                <Clock size={14} color={colors.textMuted} />
                <AppText variant="label" tone="muted">{container.runningFor}</AppText>
              </View>
            )}
          </View>

          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Cpu size={16} color={colors.textMuted} style={{ marginBottom: 4 }} />
              <AppText variant="title">{container.cpuPercent !== undefined ? `${container.cpuPercent.toFixed(1)}%` : '-'}</AppText>
              <AppText variant="caps" tone="muted">CPU</AppText>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <MemoryStick size={16} color={colors.textMuted} style={{ marginBottom: 4 }} />
              <AppText variant="title">{container.memoryUsage || formatBytes(container.memoryUsedBytes)}</AppText>
              <AppText variant="caps" tone="muted">Memory</AppText>
            </View>
          </View>
        </GlassCard>

        <AppText variant="subtitle" style={styles.sectionTitle}>Controls</AppText>
        <GlassCard style={styles.controlsCard}>
          <View style={styles.actionsGrid}>
            {running ? (
              <ActionButton action="stop" label="Stop" icon={Square} tone="red" />
            ) : (
              <ActionButton action="start" label="Start" icon={Play} tone="accent" />
            )}
            <ActionButton action="restart" label="Restart" icon={RotateCw} />
            {running ? (
              <ActionButton action="pause" label="Pause" icon={Pause} />
            ) : (
              <ActionButton action="unpause" label="Resume" icon={Play} />
            )}
            <ActionButton action="kill" label="Kill" icon={Power} tone="red" />
          </View>
        </GlassCard>

        <AppText variant="subtitle" style={styles.sectionTitle}>Details</AppText>
        <GlassCard style={styles.detailCard}>
          <View style={styles.detailRow}>
            <AppText variant="caps" tone="muted" style={styles.detailLabel}>Container ID</AppText>
            <AppText variant="mono" style={styles.detailValue} numberOfLines={1} selectable>{container.id}</AppText>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <AppText variant="caps" tone="muted" style={styles.detailLabel}>Image</AppText>
            <AppText variant="mono" style={styles.detailValue} numberOfLines={1} selectable>{container.image}</AppText>
          </View>
          {container.ports ? (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <AppText variant="caps" tone="muted" style={styles.detailLabel}>Ports</AppText>
                <AppText variant="mono" style={styles.detailValue} selectable>{container.ports.split(',').join('\n')}</AppText>
              </View>
            </>
          ) : null}
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
    marginTop: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(colors.text, 0.05),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: withAlpha(colors.text, 0.05),
    borderRadius: 12,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  statusCard: {
    padding: 16,
    gap: 20,
    marginBottom: 24,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: withAlpha(colors.text, 0.05),
    borderRadius: 100,
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricsGrid: {
    flexDirection: 'row',
    backgroundColor: withAlpha(colors.text, 0.02),
    borderRadius: 12,
    padding: 16,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricDivider: {
    width: 1,
    backgroundColor: withAlpha(colors.text, 0.1),
    marginHorizontal: 16,
  },
  sectionTitle: {
    marginBottom: 12,
    fontSize: 18,
    fontWeight: '600',
  },
  controlsCard: {
    padding: 12,
    marginBottom: 24,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: withAlpha(colors.text, 0.05),
    borderRadius: 12,
    flexGrow: 1,
  },
  detailCard: {
    padding: 16,
    gap: 12,
  },
  detailRow: {
    gap: 6,
  },
  detailLabel: {
    fontSize: 12,
  },
  detailValue: {
    fontSize: 14,
    color: colors.text,
  },
  detailDivider: {
    height: 1,
    backgroundColor: withAlpha(colors.text, 0.05),
  },
  noticeCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
