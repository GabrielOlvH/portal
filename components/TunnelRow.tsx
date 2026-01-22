import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { Tunnel } from '@/lib/types';

type TunnelRowProps = {
  tunnel: Tunnel;
  onClose?: () => void;
};

export function TunnelRow({ tunnel, onClose }: TunnelRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const statusColor = tunnel.status === 'active' ? colors.green :
                      tunnel.status === 'error' ? colors.red : colors.textSecondary;

  return (
    <Card style={styles.card}>
      <View style={styles.content}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />

        <View style={styles.portInfo}>
          <View style={styles.portRow}>
            <AppText variant="mono" style={styles.port}>:{tunnel.listenPort}</AppText>
            <AppText style={styles.arrow}>→</AppText>
            <AppText variant="mono" style={styles.port}>:{tunnel.targetPort}</AppText>
          </View>
          {tunnel.connections > 0 && (
            <AppText variant="label" tone="muted">{tunnel.connections} conn</AppText>
          )}
        </View>

        <View style={styles.info}>
          <AppText variant="subtitle" numberOfLines={1}>
            {tunnel.targetHost}
          </AppText>
          <AppText variant="mono" tone="muted" style={styles.meta}>
            Port Forward
          </AppText>
        </View>

        {onClose && tunnel.status === 'active' && (
          <Pressable style={styles.closeButton} onPress={onClose}>
            <AppText variant="label" style={styles.closeText}>Close</AppText>
          </Pressable>
        )}
      </View>

      {tunnel.error && (
        <View style={styles.errorBar}>
          <AppText variant="label" style={styles.errorText} numberOfLines={1}>
            {tunnel.error}
          </AppText>
        </View>
      )}
    </Card>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  portInfo: {
    alignItems: 'center',
    minWidth: 90,
  },
  portRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  port: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '600',
  },
  arrow: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  info: {
    flex: 1,
  },
  meta: {
    fontSize: 11,
    marginTop: 2,
  },
  closeButton: {
    backgroundColor: colors.red,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radii.sm,
  },
  closeText: {
    color: colors.accentText,
  },
  errorBar: {
    backgroundColor: colors.red + '20',
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
  },
  errorText: {
    color: colors.red,
    fontSize: 11,
  },
});
