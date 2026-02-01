import React, { memo, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { AppText } from '@/components/AppText';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { PortInfo } from '@/lib/types';

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.card}>
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
    </View>
  );
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    overflow: 'hidden',
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
    backgroundColor: colors.cardPressed,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.sm,
    minWidth: 70,
    alignItems: 'center',
  },
  portText: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '600',
  },
  protocolBadge: {
    backgroundColor: colors.cardPressed,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  protocolUdp: {
    backgroundColor: colors.orange + '30',
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
    backgroundColor: colors.red,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radii.sm,
  },
  killText: {
    color: colors.accentText,
  },
});
