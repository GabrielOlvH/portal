import React, { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, View, Platform } from 'react-native';
import { GitBranch, Pause, Play, StopCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Card } from '@/components/Card';
import { AppText } from '@/components/AppText';
import { theme, palette } from '@/lib/theme';
import type { Host, Session } from '@/lib/types';

const stateColorMap = {
  running: { color: palette.accent, bg: palette.accent + '20' },
  idle: { color: palette.clay, bg: palette.clay + '20' },
  stopped: { color: palette.muted, bg: palette.muted + '20' },
} as const;

type SessionCardProps = {
  session: Session;
  host: Host;
  hostColor: string;
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
  const agentState = session.insights?.meta?.agentState ?? 'stopped';
  const gitBranch = session.insights?.git?.branch;
  const command = session.insights?.meta?.agentCommand;

  const { color: stateColor, bg: stateBgColor } = stateColorMap[agentState];

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
              {session.name}
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
                  <GitBranch size={10} color={palette.muted} />
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

const styles = StyleSheet.create({
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
    backgroundColor: palette.surfaceAlt,
  },
  gitText: {
    fontSize: 10,
  },
});
