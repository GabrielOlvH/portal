import React, { useMemo } from 'react';
import { Pressable, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import { Download, Terminal } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { PulsingDot } from '@/components/PulsingDot';
import { theme } from '@/lib/theme';
import { useTheme } from '@/lib/useTheme';
import type { UpdateStatus } from '@/lib/api';
import type { Host } from '@/lib/types';
import type { ThemeColors } from '@/lib/useTheme';

type HostStatus = 'online' | 'offline' | 'checking';
type StatusColors = { color: string; bg: string };
type HostCardStyles = {
  card: ViewStyle;
  header: ViewStyle;
  colorDot: ViewStyle;
  titleWrap: ViewStyle;
  hostname: TextStyle;
  statusBadge: ViewStyle;
  statusDot: ViewStyle;
  statusText: TextStyle;
  errorRow: ViewStyle;
  errorText: TextStyle;
  stats: ViewStyle;
  updateRow: ViewStyle;
  updateText: TextStyle;
  stat: ViewStyle;
  statValue: TextStyle;
  actions: ViewStyle;
  actionButton: ViewStyle;
  actionButtonTerminal: ViewStyle;
  actionButtonUpdate: ViewStyle;
  actionButtonDisabled: ViewStyle;
  actionButtonText: TextStyle;
};

type HostCardProps = {
  host: Host;
  status: HostStatus;
  metrics?: { cpu?: number; ram?: number };
  uptime?: number;
  load?: number[];
  updateStatus?: UpdateStatus;
  isUpdating?: boolean;
  errorMessage?: string;
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

function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStatusColors(status: HostStatus, colors: ThemeColors): StatusColors {
  switch (status) {
    case 'online':
      return { color: colors.green, bg: withAlpha(colors.green, 0.16) };
    case 'offline':
      return { color: colors.red, bg: withAlpha(colors.red, 0.16) };
    case 'checking':
    default:
      return { color: colors.orange, bg: withAlpha(colors.orange, 0.16) };
  }
}

function getStatusLabel(status: HostStatus): string {
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

function getUpdateLabel(isUpdating: boolean, updateStatus?: UpdateStatus): string {
  if (isUpdating) return 'Updating...';
  if (updateStatus?.latestVersion) {
    return `Update available (${updateStatus.latestVersion})`;
  }
  return 'Update available';
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function HostCard({
  host,
  status,
  metrics,
  uptime,
  load,
  updateStatus,
  isUpdating,
  errorMessage,
  onPress,
  onTerminal,
  onUpdate,
}: HostCardProps): React.ReactElement {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isOnline = status === 'online';
  const { color: statusColor, bg: statusBg } = getStatusColors(status, colors);
  const hostColor = host.color || colors.accent;
  const updateAvailable = Boolean(updateStatus?.updateAvailable);
  const showUpdate = updateAvailable || Boolean(isUpdating);
  const updateLabel = getUpdateLabel(Boolean(isUpdating), updateStatus);
  const updateDisabled = !isOnline || Boolean(isUpdating);
  const updateAccent = updateDisabled ? colors.textMuted : colors.blue;
  const terminalColor = isOnline ? colors.accent : colors.textMuted;

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.colorDot, { backgroundColor: hostColor }]} />
          <View style={styles.titleWrap}>
            <AppText variant="subtitle" numberOfLines={1}>
              {host.name}
            </AppText>
            <AppText variant="mono" tone="muted" style={styles.hostname} numberOfLines={1}>
              {getHostname(host.baseUrl)}
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

        {errorMessage ? (
          <View style={styles.errorRow}>
            <AppText variant="mono" tone="warning" style={styles.errorText} numberOfLines={2}>
              {errorMessage}
            </AppText>
          </View>
        ) : null}

        <View style={styles.stats}>
          <View style={styles.stat}>
            <AppText variant="caps" tone="muted">
              CPU
            </AppText>
            <AppText variant="mono" style={styles.statValue}>
              {metrics?.cpu !== undefined ? `${metrics.cpu.toFixed(0)}%` : '-'}
            </AppText>
          </View>

          <View style={styles.stat}>
            <AppText variant="caps" tone="muted">
              RAM
            </AppText>
            <AppText variant="mono" style={styles.statValue}>
              {metrics?.ram !== undefined ? `${metrics.ram.toFixed(0)}%` : '-'}
            </AppText>
          </View>

          <View style={styles.stat}>
            <AppText variant="caps" tone="muted">
              UP
            </AppText>
            <AppText variant="mono" style={styles.statValue}>
              {formatUptime(uptime)}
            </AppText>
          </View>

          <View style={styles.stat}>
            <AppText variant="caps" tone="muted">
              LOAD
            </AppText>
            <AppText variant="mono" style={styles.statValue}>
              {load?.[0] !== undefined ? load[0].toFixed(2) : '-'}
            </AppText>
          </View>
        </View>

        {showUpdate && (
          <View style={styles.updateRow}>
            <Download size={14} color={updateAccent} />
            <AppText variant="mono" style={[styles.updateText, { color: updateAccent }]}>
              {updateLabel}
            </AppText>
          </View>
        )}

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
            <Terminal size={16} color={terminalColor} />
            <AppText
              variant="caps"
              style={[
                styles.actionButtonText,
                { color: terminalColor },
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
        </View>
      </Card>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors): HostCardStyles {
  return StyleSheet.create<HostCardStyles>({
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
    errorRow: {
      marginTop: -2,
      marginBottom: 2,
    },
    errorText: {
      fontSize: 11,
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
}
