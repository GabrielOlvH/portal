import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Terminal, Box, Download } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { PulsingDot } from '@/components/PulsingDot';
import type { UpdateStatus } from '@/lib/api';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { Host } from '@/lib/types';

type HostStatus = 'online' | 'offline' | 'checking';

type HostCardProps = {
  host: Host;
  status: HostStatus;
  sessionCount: number;
  containerCount?: number;
  metrics?: { cpu?: number; ram?: number };
  updateStatus?: UpdateStatus;
  isUpdating?: boolean;
  onPress: () => void;
  onTerminal: () => void;
  onDocker: () => void;
  onUpdate?: () => void;
};

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStatusColors(status: HostStatus, colors: ThemeColors) {
  const statusColorMap = {
    online: { color: colors.green, bg: withAlpha(colors.green, 0.16) },
    offline: { color: colors.red, bg: withAlpha(colors.red, 0.16) },
    checking: { color: colors.orange, bg: withAlpha(colors.orange, 0.16) },
  } as const;

  return statusColorMap[status] || statusColorMap.checking;
}

function getStatusLabel(status: HostStatus) {
  switch (status) {
    case 'online':
      return 'Online';
    case 'offline':
      return 'Offline';
    case 'checking':
      return 'Checking';
    default:
      return 'Unknown';
  }
}

export function HostCard({
  host,
  status,
  sessionCount,
  containerCount,
  metrics,
  updateStatus,
  isUpdating,
  onPress,
  onTerminal,
  onDocker,
  onUpdate,
}: HostCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOnline = status === 'online';
  const { color: statusColor, bg: statusBg } = getStatusColors(status, colors);
  const hostColor = host.color || colors.accent;
  const updateAvailable = Boolean(updateStatus?.updateAvailable);
  const showUpdate = updateAvailable || isUpdating;
  const updateLabel = isUpdating
    ? 'Updating...'
    : updateStatus?.latestVersion
      ? `Update available (${updateStatus.latestVersion})`
      : 'Update available';
  const updateDisabled = !isOnline || isUpdating;
  const updateAccent = updateDisabled ? colors.textMuted : colors.blue;

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.card}>
        {/* Header Row: Color dot, name, status badge */}
        <View style={styles.header}>
          <View style={[styles.colorDot, { backgroundColor: hostColor }]} />
          <View style={styles.titleWrap}>
            <AppText variant="subtitle" numberOfLines={1}>
              {host.name}
            </AppText>
            <AppText variant="mono" tone="muted" style={styles.hostname} numberOfLines={1}>
              {host.sshHost || getHostname(host.baseUrl)}
            </AppText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <PulsingDot
              color={statusColor}
              active={status === 'online' || status === 'checking'}
              size={6}
            />
            <AppText variant="caps" style={[styles.statusText, { color: statusColor }]}>
              {getStatusLabel(status)}
            </AppText>
          </View>
        </View>

        {/* Stats Row: Sessions, Containers, Metrics */}
        <View style={styles.stats}>
          <View style={styles.stat}>
            <AppText variant="caps" tone="muted">
              Sessions
            </AppText>
            <AppText variant="mono" style={styles.statValue}>
              {sessionCount}
            </AppText>
          </View>

          {containerCount !== undefined && (
            <View style={styles.stat}>
              <AppText variant="caps" tone="muted">
                Containers
              </AppText>
              <AppText variant="mono" style={styles.statValue}>
                {containerCount}
              </AppText>
            </View>
          )}

          {metrics?.cpu !== undefined && (
            <View style={styles.stat}>
              <AppText variant="caps" tone="muted">
                CPU
              </AppText>
              <AppText variant="mono" style={styles.statValue}>
                {metrics.cpu.toFixed(0)}%
              </AppText>
            </View>
          )}

          {metrics?.ram !== undefined && (
            <View style={styles.stat}>
              <AppText variant="caps" tone="muted">
                RAM
              </AppText>
              <AppText variant="mono" style={styles.statValue}>
                {metrics.ram.toFixed(0)}%
              </AppText>
            </View>
          )}
        </View>

        {showUpdate && (
          <View style={styles.updateRow}>
            <Download size={14} color={updateAccent} />
            <AppText variant="mono" style={[styles.updateText, { color: updateAccent }]}>
              {updateLabel}
            </AppText>
          </View>
        )}

        {/* Actions Row */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionButton, styles.actionButtonTerminal]}
            onPress={(e) => {
              e.stopPropagation();
              onTerminal();
            }}
            disabled={!isOnline}
            hitSlop={4}
          >
            <Terminal size={16} color={isOnline ? colors.accent : colors.textMuted} />
            <AppText
              variant="caps"
              style={[
                styles.actionButtonText,
                { color: isOnline ? colors.accent : colors.textMuted },
              ]}
            >
              Terminal
            </AppText>
          </Pressable>

          {showUpdate && onUpdate && (
            <Pressable
              style={[
                styles.actionButton,
                styles.actionButtonUpdate,
                updateDisabled && styles.actionButtonDisabled,
              ]}
              onPress={(e) => {
                e.stopPropagation();
                onUpdate();
              }}
              disabled={updateDisabled}
              hitSlop={4}
            >
              <Download size={16} color={updateAccent} />
              <AppText
                variant="caps"
                style={[
                  styles.actionButtonText,
                  { color: updateAccent },
                ]}
              >
                {isUpdating ? 'Updating...' : 'Update'}
              </AppText>
            </Pressable>
          )}

          <Pressable
            style={[styles.actionButton, styles.actionButtonDocker]}
            onPress={(e) => {
              e.stopPropagation();
              onDocker();
            }}
            disabled={!isOnline}
            hitSlop={4}
          >
            <Box size={16} color={isOnline ? colors.blue : colors.textMuted} />
            <AppText
              variant="caps"
              style={[
                styles.actionButtonText,
                { color: isOnline ? colors.blue : colors.textMuted },
              ]}
            >
              Docker
            </AppText>
          </Pressable>
        </View>
      </Card>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  hostname: {
    fontSize: 11,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  stats: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.xs,
  },
  updateText: {
    fontSize: 11,
  },
  stat: {
    gap: 2,
  },
  statValue: {
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    minWidth: 100,
  },
  actionButtonTerminal: {
    backgroundColor: withAlpha(colors.green, 0.12),
  },
  actionButtonDocker: {
    backgroundColor: colors.cardPressed,
  },
  actionButtonUpdate: {
    backgroundColor: withAlpha(colors.blue, 0.12),
  },
  actionButtonDisabled: {
    backgroundColor: colors.cardPressed,
  },
  actionButtonText: {
    fontWeight: '600',
  },
});
