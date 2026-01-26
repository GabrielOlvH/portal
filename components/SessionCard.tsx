import React, { useCallback, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { GitBranch, Pause, Play, StopCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Card } from '@/components/Card';
import { AppText } from '@/components/AppText';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import type { Host, Session } from '@/lib/types';

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStateColors(state: 'running' | 'idle' | 'stopped', colors: ThemeColors) {
  const stateColorMap = {
    running: { color: colors.green, bg: withAlpha(colors.green, 0.16) },
    idle: { color: colors.orange, bg: withAlpha(colors.orange, 0.16) },
    stopped: { color: colors.textMuted, bg: withAlpha(colors.textMuted, 0.16) },
  } as const;

  return stateColorMap[state] || stateColorMap.stopped;
}

type SessionCardProps = {
  session: Session;
  host: Host;
  hostColor: ColorValue;
  onPress: () => void;
  onKill: () => void;
};

export function SessionCard({
  session,
  host,
  hostColor,
  onPress,
  onKill,
}: SessionCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const agentState = session.insights?.meta?.agentState ?? 'stopped';
  const gitBranch = session.insights?.git?.branch;
  const command = session.insights?.meta?.agentCommand;

  const { color: stateColor, bg: stateBgColor } = getStateColors(agentState, colors);

  const stateLabel =
    agentState === 'running'
      ? 'Running'
      : agentState === 'idle'
        ? 'Idle'
        : 'Stopped';

  const StateIcon =
    agentState === 'running' ? Play : agentState === 'idle' ? Pause : StopCircle;

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(session.name, `on ${host.name}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Kill Session',
        style: 'destructive',
        onPress: onKill,
      },
    ]);
  }, [session.name, host.name, onKill]);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [
        styles.pressable,
        pressed && styles.pressed,
      ]}
    >
      <Card style={styles.card}>
        <View style={[styles.colorBar, { backgroundColor: hostColor }]} />
        <View style={styles.content}>
          <View style={styles.header}>
            <AppText variant="subtitle" numberOfLines={1} style={styles.name}>
              {session.title || session.name}
            </AppText>
            <View style={[styles.stateBadge, { backgroundColor: stateBgColor }]}>
              <StateIcon size={10} color={stateColor} />
              <AppText variant="caps" style={[styles.stateText, { color: stateColor }]}>
                {stateLabel}
              </AppText>
            </View>
          </View>

          {(command || gitBranch) && (
            <View style={styles.details}>
              {command && (
                <AppText
                  variant="mono"
                  tone="muted"
                  numberOfLines={1}
                  style={styles.command}
                >
                  {command}
                </AppText>
              )}
              {gitBranch && (
                <View style={styles.gitBadge}>
                  <GitBranch size={10} color={colors.textMuted} />
                  <AppText variant="mono" tone="muted" style={styles.gitText}>
                    {gitBranch}
                  </AppText>
                </View>
              )}
            </View>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  pressable: {
    borderRadius: theme.radii.lg,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  card: {
    flexDirection: 'row',
    overflow: 'hidden',
  },
  colorBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    padding: 12,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    flex: 1,
  },
  stateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stateText: {
    fontSize: 9,
    fontWeight: '600',
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  command: {
    flex: 1,
    fontSize: 11,
  },
  gitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.cardPressed,
  },
  gitText: {
    fontSize: 10,
  },
});
