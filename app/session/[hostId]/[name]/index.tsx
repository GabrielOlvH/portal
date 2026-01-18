import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { Screen } from '@/components/Screen';
import { killSession, renameSession } from '@/lib/api';
import { buildAttachCommand, buildNewAttachCommand } from '@/lib/commands';
import { useHostLive } from '@/lib/live';
import { useStore } from '@/lib/store';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';

export default function SessionDetailScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ hostId: string; name: string }>();
  const sessionName = decodeURIComponent(params.name ?? '');
  const { hosts, updateHostLastSeen } = useStore();
  const host = hosts.find((item) => item.id === params.hostId);
  const [rename, setRename] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const { state, refresh } = useHostLive(host, { sessions: true });
  const session = state?.sessions?.find((item) => item.name === sessionName) ?? null;
  const status = state?.status ?? 'unknown';

  useEffect(() => {
    if (!host?.id || !state?.lastUpdate) return;
    if (host.lastSeen === state.lastUpdate) return;
    updateHostLastSeen(host.id, state.lastUpdate);
  }, [host?.id, host?.lastSeen, state?.lastUpdate, updateHostLastSeen]);

  const isOnline = status === 'online';

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const attachCommand = host ? buildAttachCommand(host, sessionName) : '';
  const newAttachCommand = host ? buildNewAttachCommand(host, sessionName) : '';

  const handleCopy = useCallback(async (command: string) => {
    await Clipboard.setStringAsync(command);
    setFeedback('Copied');
    setTimeout(() => setFeedback(null), 1400);
  }, []);

  const handleRename = useCallback(async () => {
    if (!host || !rename.trim()) return;
    const nextName = rename.trim();
    try {
      await renameSession(host, sessionName, nextName);
      setRename('');
      refresh();
      router.replace(`/session/${host.id}/${encodeURIComponent(nextName)}`);
    } catch (err) {
      Alert.alert('Rename failed', err instanceof Error ? err.message : 'Unable to rename session.');
    }
  }, [host, rename, sessionName, refresh, router]);

  const handleKill = useCallback(async () => {
    if (!host) return;
    Alert.alert('Kill session', `Stop ${sessionName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Kill',
        style: 'destructive',
        onPress: async () => {
          try {
            await killSession(host, sessionName);
            router.back();
          } catch (err) {
            Alert.alert('Kill failed', err instanceof Error ? err.message : 'Unable to kill session.');
          }
        },
      },
    ]);
  }, [host, sessionName, router]);

  if (!host) {
    return (
      <Screen>
        <AppText variant="title">Session not found</AppText>
        <Pressable onPress={() => router.replace('/')} style={{ marginTop: theme.spacing.md }}>
          <AppText variant="subtitle" tone="accent">Go home</AppText>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <AppText variant="subtitle">Back</AppText>
        </Pressable>
        <View style={styles.headerCenter}>
          <AppText variant="title" numberOfLines={1}>{sessionName}</AppText>
          <View style={styles.hostBadge}>
            <View style={[styles.hostDot, { backgroundColor: host.color || colors.accent }]} />
            <AppText variant="caps" tone="muted">{host.name}</AppText>
          </View>
        </View>
        <Pressable
          style={styles.terminalButton}
          onPress={() => router.push(`/session/${host.id}/${encodeURIComponent(sessionName)}/terminal`)}
        >
          <AppText variant="caps" style={styles.terminalButtonText}>Terminal</AppText>
        </Pressable>
      </View>

      {feedback && (
        <View style={styles.feedbackBar}>
          <AppText variant="caps" style={styles.feedbackText}>{feedback}</AppText>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <FadeIn>
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusItem}>
                <AppText variant="caps" tone="muted">Status</AppText>
                <View style={styles.statusValue}>
                <View style={[styles.statusDot, isOnline && styles.statusOnline]} />
                  <AppText variant="label">{isOnline ? 'Online' : 'Offline'}</AppText>
                </View>
              </View>
              <View style={styles.statusItem}>
                <AppText variant="caps" tone="muted">Windows</AppText>
                <AppText variant="label">{session?.windows ?? '-'}</AppText>
              </View>
              <View style={styles.statusItem}>
                <AppText variant="caps" tone="muted">State</AppText>
                <AppText variant="label" style={session?.attached ? styles.attachedText : undefined}>
                  {session?.attached ? 'Attached' : 'Idle'}
                </AppText>
              </View>
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={50}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText variant="subtitle">Rename</AppText>
            </View>
            <View style={styles.renameRow}>
              <TextInput
                value={rename}
                onChangeText={setRename}
                placeholder={sessionName}
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={[styles.actionButton, !rename.trim() && styles.actionButtonDisabled]}
                onPress={handleRename}
                disabled={!rename.trim()}
              >
                <AppText variant="caps" style={styles.actionButtonText}>Save</AppText>
              </Pressable>
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={100}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText variant="subtitle">Attach Commands</AppText>
            </View>
            <Pressable style={styles.commandRow} onPress={() => handleCopy(attachCommand)}>
              <AppText variant="mono" style={styles.commandText} numberOfLines={1}>{attachCommand}</AppText>
              <AppText variant="caps" tone="accent">Copy</AppText>
            </Pressable>
            <Pressable style={styles.commandRow} onPress={() => handleCopy(newAttachCommand)}>
              <AppText variant="mono" style={styles.commandText} numberOfLines={1}>{newAttachCommand}</AppText>
              <AppText variant="caps" tone="accent">Copy</AppText>
            </Pressable>
          </View>
        </FadeIn>

        <FadeIn delay={150}>
          <Pressable style={styles.killButton} onPress={handleKill}>
            <AppText variant="caps" style={styles.killText}>Kill Session</AppText>
          </Pressable>
        </FadeIn>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => {
  const actionTextColor = isDark ? colors.text : colors.accentText;

  return StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: theme.spacing.sm,
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 4,
  },
  headerCenter: {
    flex: 1,
  },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  hostDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  terminalButton: {
    backgroundColor: colors.blue,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  terminalButtonText: {
    color: actionTextColor,
    fontWeight: '600',
  },
  feedbackBar: {
    backgroundColor: colors.barBg,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: theme.spacing.sm,
  },
  feedbackText: {
    color: colors.accent,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    ...theme.shadow.card,
  },
  statusRow: {
    flexDirection: 'row',
  },
  statusItem: {
    flex: 1,
  },
  statusValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.orange,
  },
  statusOnline: {
    backgroundColor: colors.green,
  },
  attachedText: {
    color: colors.accent,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    ...theme.shadow.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  renameRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
  },
  actionButton: {
    backgroundColor: colors.blue,
    paddingHorizontal: 16,
    borderRadius: theme.radii.md,
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: colors.separator,
  },
  actionButtonText: {
    color: actionTextColor,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 10,
  },
  commandText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },
  killButton: {
    alignSelf: 'center',
    backgroundColor: colors.red,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.radii.md,
  },
  killText: {
    color: actionTextColor,
    fontWeight: '600',
  },
  });
};
