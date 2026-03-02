import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Download, Terminal, ChevronRight } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { theme } from '@/lib/theme';
import { useTheme } from '@/lib/useTheme';
import type { UpdateStatus } from '@/lib/api';
import type { Host } from '@/lib/types';
import type { ThemeColors } from '@/lib/useTheme';
import { withAlpha } from '@/lib/colors';
import { LinearGradient } from 'expo-linear-gradient';

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
    if (metrics?.cpu !== undefined) parts.push(`C: ${metrics.cpu.toFixed(0)}%`);
    if (metrics?.ram !== undefined) parts.push(`R: ${metrics.ram.toFixed(0)}%`);
    if (uptime) parts.push(`Up: ${formatUptime(uptime)}`);
    return parts.join(' • ');
  }, [metrics, uptime]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
      ]}
    >
      <GlassCard style={styles.card} intensity={20}>
        <View style={styles.header}>
          <View style={styles.titleArea}>
            <View style={[styles.statusDot, { backgroundColor: statusColor, shadowColor: statusColor }]} />
            <AppText variant="subtitle" style={styles.name} numberOfLines={1}>{host.name}</AppText>
          </View>
          <View style={styles.actions}>
            {showUpdate && onUpdate && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onUpdate?.();
                }}
                disabled={!isOnline || isUpdating}
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.updateButton,
                  pressed && styles.actionButtonPressed,
                ]}
                hitSlop={8}
              >
                <Download size={14} color={colors.blue} />
              </Pressable>
            )}
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onTerminal();
              }}
              disabled={!isOnline}
              style={({ pressed }) => [
                styles.actionButton,
                styles.terminalButton,
                pressed && styles.actionButtonPressed,
                !isOnline && styles.actionButtonDisabled,
              ]}
              hitSlop={8}
            >
              <Terminal size={14} color={isOnline ? colors.green : colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.infoCol}>
            <AppText variant="mono" tone="muted" style={styles.hostname} numberOfLines={1}>
              {getHostname(host.baseUrl)}
            </AppText>
            {errorMessage ? (
              <AppText variant="label" style={styles.error} numberOfLines={1}>
                {errorMessage}
              </AppText>
            ) : (
              <AppText variant="label" tone="muted" style={styles.metrics} numberOfLines={1}>
                {metricsText || 'Waiting for telemetry...'}
              </AppText>
            )}
          </View>
          
          <ChevronRight size={20} color={withAlpha(colors.text, 0.2)} />
        </View>
        
        {/* Decorative background accent using the host color */}
        <LinearGradient
          colors={[withAlpha(hostColor, 0.08), 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </GlassCard>
    </Pressable>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginBottom: 12,
    },
    containerPressed: {
      transform: [{ scale: 0.98 }],
    },
    card: {
      padding: 16,
      gap: 12,
      position: 'relative',
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    titleArea: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 4,
    },
    name: {
      fontSize: 18,
      fontWeight: '600',
    },
    body: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    infoCol: {
      flex: 1,
      gap: 4,
    },
    hostname: {
      fontSize: 12,
    },
    metrics: {
      fontSize: 11,
      fontWeight: '500',
    },
    error: {
      fontSize: 11,
      color: colors.red,
      fontWeight: '500',
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
    },
    actionButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    updateButton: {
      backgroundColor: withAlpha(colors.blue, 0.1),
      borderWidth: 1,
      borderColor: withAlpha(colors.blue, 0.2),
    },
    terminalButton: {
      backgroundColor: withAlpha(colors.green, 0.1),
      borderWidth: 1,
      borderColor: withAlpha(colors.green, 0.2),
    },
    actionButtonPressed: {
      opacity: 0.7,
    },
    actionButtonDisabled: {
      opacity: 0.4,
      backgroundColor: withAlpha(colors.text, 0.05),
      borderColor: 'transparent',
    },
  });
}
