import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Download, Terminal, ChevronRight } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { PulsingDot } from '@/components/PulsingDot';
import { theme } from '@/lib/theme';
import { useTheme } from '@/lib/useTheme';
import type { UpdateStatus } from '@/lib/api';
import type { Host } from '@/lib/types';
import type { ThemeColors } from '@/lib/useTheme';
import { withAlpha } from '@/lib/colors';

type HostStatus = 'online' | 'offline' | 'checking';

type HostCardProps = {
  host: Host;
  status: HostStatus;
  metrics?: { cpu?: number; ram?: number };
  uptime?: number;
  load?: number[];
  updateStatus?: UpdateStatus;
  isUpdating?: boolean;
  errorMessage?: string;
  isFirst?: boolean;
  isLast?: boolean;
  onPress: () => void;
  onTerminal: () => void;
  onUpdate?: () => void;
};

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getStatusColor(status: HostStatus, colors: ThemeColors): string {
  switch (status) {
    case 'online':
      return colors.green;
    case 'offline':
      return colors.red;
    case 'checking':
    default:
      return colors.orange;
  }
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `<1h`;
}

export const HostCard = memo(function HostCard({
  host,
  status,
  metrics,
  uptime,
  load,
  updateStatus,
  isUpdating,
  errorMessage,
  isFirst,
  isLast,
  onPress,
  onTerminal,
  onUpdate,
}: HostCardProps): React.ReactElement {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOnline = status === 'online';
  const statusColor = getStatusColor(status, colors);
  const hostColor = host.color || colors.accent;
  const updateAvailable = Boolean(updateStatus?.updateAvailable);
  const showUpdate = updateAvailable || Boolean(isUpdating);

  // Build metrics string
  const metricsText = useMemo(() => {
    const parts: string[] = [];
    if (metrics?.cpu !== undefined) parts.push(`${metrics.cpu.toFixed(0)}%`);
    if (metrics?.ram !== undefined) parts.push(`${metrics.ram.toFixed(0)}%`);
    if (uptime) parts.push(formatUptime(uptime));
    if (load?.[0] !== undefined) parts.push(load[0].toFixed(2));
    return parts.join(' · ');
  }, [metrics, uptime, load]);

  return (
    <View style={[
      styles.row,
      !isLast && styles.rowBorder,
      { borderBottomColor: colors.separator },
    ]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.content,
          pressed && styles.contentPressed,
        ]}
      >
        {/* Left: Color dot + Name + Host */}
        <View style={[styles.colorDot, { backgroundColor: hostColor }]} />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <AppText variant="body" numberOfLines={1} style={styles.name}>
              {host.name}
            </AppText>
            <PulsingDot
              color={statusColor}
              active={status === 'online' || status === 'checking'}
              size={6}
            />
          </View>
          <AppText variant="mono" tone="muted" style={styles.hostname} numberOfLines={1}>
            {getHostname(host.baseUrl)}
            {metricsText ? ` · ${metricsText}` : ''}
          </AppText>
          {errorMessage && (
            <AppText variant="mono" tone="warning" style={styles.error} numberOfLines={1}>
              {errorMessage}
            </AppText>
          )}
        </View>

        {/* Right: Actions */}
        <View style={styles.actions}>
          {showUpdate && onUpdate && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onUpdate?.();
              }}
              disabled={!isOnline || isUpdating}
              style={({ pressed }) => [
                styles.actionPill,
                { backgroundColor: withAlpha(colors.blue, 0.12) },
                pressed && styles.actionPillPressed,
              ]}
              hitSlop={4}
            >
              <Download size={12} color={colors.blue} />
            </Pressable>
          )}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onTerminal();
            }}
            disabled={!isOnline}
            style={({ pressed }) => [
              styles.actionPill,
              { backgroundColor: withAlpha(colors.green, 0.12) },
              pressed && styles.actionPillPressed,
              !isOnline && styles.actionPillDisabled,
            ]}
            hitSlop={4}
          >
            <Terminal size={12} color={isOnline ? colors.green : colors.textMuted} />
          </Pressable>
          <ChevronRight size={16} color={colors.textMuted} />
        </View>
      </Pressable>
    </View>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {},
    rowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 10,
    },
    contentPressed: {
      backgroundColor: colors.cardPressed,
    },
    colorDot: {
      width: 4,
      height: 24,
      borderRadius: 2,
    },
    info: {
      flex: 1,
      gap: 2,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    name: {
      fontWeight: '500',
    },
    hostname: {
      fontSize: 11,
    },
    error: {
      fontSize: 10,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    actionPill: {
      width: 28,
      height: 28,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionPillPressed: {
      opacity: 0.7,
    },
    actionPillDisabled: {
      opacity: 0.4,
    },
  });
}
