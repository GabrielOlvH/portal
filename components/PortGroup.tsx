import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { PortInfo } from '@/lib/types';

type PortGroupProps = {
  processName: string;
  ports: PortInfo[];
  children: React.ReactNode;
  defaultExpanded?: boolean;
};

export function PortGroup({ processName, ports, children, defaultExpanded = true }: PortGroupProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const portRange = useMemo(() => {
    const sorted = ports.map(p => p.port).sort((a, b) => a - b);
    if (sorted.length === 1) return `:${sorted[0]}`;
    if (sorted.length === 2) return `:${sorted[0]}, :${sorted[1]}`;
    return `:${sorted[0]} - :${sorted[sorted.length - 1]}`;
  }, [ports]);

  return (
    <Card style={styles.card}>
      <Pressable style={styles.header} onPress={() => setExpanded(!expanded)}>
        <AppText style={styles.chevron}>{expanded ? '▼' : '▶'}</AppText>
        <View style={styles.headerInfo}>
          <AppText variant="subtitle" numberOfLines={1}>
            {processName}
          </AppText>
          <AppText variant="mono" tone="muted" style={styles.portRange}>
            {ports.length} port{ports.length !== 1 ? 's' : ''} {portRange}
          </AppText>
        </View>
        <View style={styles.badge}>
          <AppText variant="label" style={styles.badgeText}>{ports.length}</AppText>
        </View>
      </Pressable>
      {expanded && (
        <View style={styles.content}>
          {children}
        </View>
      )}
    </Card>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: 12,
  },
  chevron: {
    color: colors.textSecondary,
    fontSize: 10,
    width: 12,
  },
  headerInfo: {
    flex: 1,
  },
  portRange: {
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  badgeText: {
    color: colors.accentText,
    fontSize: 12,
  },
  content: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
});
