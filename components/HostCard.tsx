import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Terminal, Box } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { PulsingDot } from '@/components/PulsingDot';
import { palette, theme } from '@/lib/theme';
import { Host } from '@/lib/types';

type HostStatus = 'online' | 'offline' | 'checking';

type HostCardProps = {
  host: Host;
  status: HostStatus;
  sessionCount: number;
  containerCount?: number;
  metrics?: { cpu?: number; ram?: number };
  onPress: () => void;
  onTerminal: () => void;
  onDocker: () => void;
};

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const statusColorMap = {
  online: { color: palette.accent, bg: palette.mint },
  offline: { color: palette.clay, bg: palette.blush },
  checking: { color: palette.gold, bg: palette.surfaceAlt },
} as const;

function getStatusColors(status: HostStatus) {
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
  onPress,
  onTerminal,
  onDocker,
}: HostCardProps) {
  const isOnline = status === 'online';
  const { color: statusColor, bg: statusBg } = getStatusColors(status);
  const hostColor = host.color || palette.accent;

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
            <Terminal size={16} color={isOnline ? palette.accent : palette.muted} />
            <AppText
              variant="caps"
              style={[
                styles.actionButtonText,
                { color: isOnline ? palette.accent : palette.muted },
              ]}
            >
              Terminal
            </AppText>
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.actionButtonDocker]}
            onPress={(e) => {
              e.stopPropagation();
              onDocker();
            }}
            disabled={!isOnline}
            hitSlop={4}
          >
            <Box size={16} color={isOnline ? palette.blue : palette.muted} />
            <AppText
              variant="caps"
              style={[
                styles.actionButtonText,
                { color: isOnline ? palette.blue : palette.muted },
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

const styles = StyleSheet.create({
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
    borderTopColor: palette.line,
  },
  stat: {
    gap: 2,
  },
  statValue: {
    fontSize: 13,
  },
  actions: {
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
    minWidth: 100,
  },
  actionButtonTerminal: {
    backgroundColor: palette.mint,
  },
  actionButtonDocker: {
    backgroundColor: palette.surfaceAlt,
  },
  actionButtonText: {
    fontWeight: '600',
  },
});
