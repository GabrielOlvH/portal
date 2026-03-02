import React, { memo, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { AppText } from '@/components/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { PortInfo } from '@/lib/types';
import { LinearGradient } from 'expo-linear-gradient';
import { withAlpha } from '@/lib/colors';

type PortRowProps = {
  port: PortInfo;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: () => void;
  onKill?: () => void;
};

export const PortRow = memo(function PortRow({
  port,
  selected = false,
  selectionMode = false,
  onToggleSelect,
  onKill,
}: PortRowProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <GlassCard style={[styles.card, selected && styles.cardSelected]}>
      {selected && (
        <LinearGradient
          colors={[withAlpha(colors.accent, 0.15), 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Pressable
        style={styles.content}
        onPress={selectionMode ? onToggleSelect : undefined}
      >
        {selectionMode && (
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
            {selected && <AppText style={styles.checkmark}>✓</AppText>}
          </View>
        )}
        <View style={styles.portBadge}>
          <AppText variant="mono" style={styles.portText}>
            :{port.port}
          </AppText>
        </View>
        {port.protocol && (
          <View style={[styles.protocolBadge, port.protocol === 'udp' && styles.protocolUdp]}>
            <AppText variant="label" style={styles.protocolText}>
              {port.protocol.toUpperCase()}
            </AppText>
          </View>
        )}
        <View style={styles.info}>
          <AppText variant="subtitle" numberOfLines={1}>
            {port.command || port.process}
          </AppText>
          <View style={styles.metaRow}>
            <AppText variant="mono" tone="muted" style={styles.pid}>
              PID {port.pid}
            </AppText>
            {port.address && port.address !== '0.0.0.0' && (
              <AppText variant="mono" tone="muted" style={styles.address}>
                {port.address}
              </AppText>
            )}
            {typeof port.connections === 'number' && port.connections > 0 && (
              <AppText variant="mono" tone="muted" style={styles.connections}>
                {port.connections} conn
              </AppText>
            )}
          </View>
        </View>
        {!selectionMode && onKill && (
          <Pressable style={styles.killButton} onPress={onKill}>
            <AppText variant="label" style={styles.killText}>
              Kill
            </AppText>
          </Pressable>
        )}
      </Pressable>
    </GlassCard>
  );
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    marginBottom: theme.spacing.sm,
  },
  cardSelected: {
    borderColor: colors.accent,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.separator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkmark: {
    color: colors.accentText,
    fontSize: 14,
    fontWeight: '600',
  },
  portBadge: {
    backgroundColor: withAlpha(colors.accent, 0.1),
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.md,
    minWidth: 70,
    alignItems: 'center',
  },
  portText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '700',
  },
  protocolBadge: {
    backgroundColor: colors.cardPressed,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  protocolUdp: {
    backgroundColor: withAlpha(colors.orange, 0.2),
  },
  protocolText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  info: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  pid: {
    fontSize: 11,
  },
  address: {
    fontSize: 11,
  },
  connections: {
    fontSize: 11,
  },
  killButton: {
    backgroundColor: withAlpha(colors.red, 0.15),
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radii.md,
  },
  killText: {
    color: colors.red,
    fontWeight: '600',
  },
});
