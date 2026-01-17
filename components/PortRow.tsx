import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { palette, theme } from '@/lib/theme';
import { PortInfo } from '@/lib/types';

type PortRowProps = {
  port: PortInfo;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: () => void;
  onKill?: () => void;
};

export function PortRow({
  port,
  selected = false,
  selectionMode = false,
  onToggleSelect,
  onKill,
}: PortRowProps) {
  return (
    <Card style={styles.card}>
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
        <View style={styles.info}>
          <AppText variant="subtitle" numberOfLines={1}>
            {port.command || port.process}
          </AppText>
          <AppText variant="mono" tone="muted" style={styles.pid}>
            PID {port.pid}
          </AppText>
        </View>
        {!selectionMode && onKill && (
          <Pressable style={styles.killButton} onPress={onKill}>
            <AppText variant="label" style={styles.killText}>
              Kill
            </AppText>
          </Pressable>
        )}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
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
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  portBadge: {
    backgroundColor: palette.surfaceAlt,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.sm,
    minWidth: 70,
    alignItems: 'center',
  },
  portText: {
    fontSize: 14,
    color: palette.accent,
    fontWeight: '600',
  },
  info: {
    flex: 1,
  },
  pid: {
    fontSize: 11,
    marginTop: 2,
  },
  killButton: {
    backgroundColor: palette.clay,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radii.sm,
  },
  killText: {
    color: '#FFFFFF',
  },
});
