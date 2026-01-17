import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { Card } from '@/components/Card';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { stripAnsi } from '@/lib/ansi';
import { createSession, killSession } from '@/lib/api';
import { systemColors } from '@/lib/colors';
import { useHostLive } from '@/lib/live';
import { useStore } from '@/lib/store';
import { palette, theme } from '@/lib/theme';
import { HostInfo } from '@/lib/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return '-';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

function formatUptime(seconds?: number) {
  if (!seconds || seconds <= 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}


export default function HostDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { hosts, updateHostLastSeen, removeHost } = useStore();
  const host = hosts.find((item) => item.id === params.id);
  const [newSession, setNewSession] = useState('');
  const [syncing, setSyncing] = useState(false);

  const { state, refresh } = useHostLive(host, {
    sessions: true,
    preview: true,
    previewLines: 12,
    host: true,
  });

  const sessions = state?.sessions ?? [];
  const status = state?.status ?? 'unknown';
  const error = state?.error ?? null;
  const hostInfo: HostInfo | undefined = state?.hostInfo;

  useEffect(() => {
    if (!host?.id || !state?.lastUpdate) return;
    if (host.lastSeen === state.lastUpdate) return;
    updateHostLastSeen(host.id, state.lastUpdate);
  }, [host?.id, host?.lastSeen, state?.lastUpdate, updateHostLastSeen]);

  const handleCreate = useCallback(async () => {
    if (!host || !newSession.trim()) return;
    const name = newSession.trim();
    setNewSession('');
    try {
      await createSession(host, name);
      refresh();
    } catch (err) {
      Alert.alert('Session failed', err instanceof Error ? err.message : 'Unable to create session.');
    }
  }, [host, newSession, refresh]);

  const handleKill = useCallback(
    async (sessionName: string) => {
      if (!host) return;
      Alert.alert('Kill session', `Stop ${sessionName}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Kill',
          style: 'destructive',
          onPress: async () => {
            try {
              await killSession(host, sessionName);
              refresh();
            } catch (err) {
              Alert.alert('Kill failed', err instanceof Error ? err.message : 'Unable to kill session.');
            }
          },
        },
      ]);
    },
    [host, refresh]
  );

  const sessionCards = useMemo(
    () =>
      sessions.map((session, index) => (
        <FadeIn key={session.name} delay={index * 50} style={styles.sessionWrap}>
          <Pressable
            onPress={() => router.push(`/session/${host?.id}/${encodeURIComponent(session.name)}/terminal`)}
            style={({ pressed }) => [
              styles.sessionPressable,
              pressed && styles.sessionCardPressed,
            ]}
          >
            <Card style={styles.sessionCard}>
            <View style={styles.sessionRow}>
              <View style={styles.sessionInfo}>
                <AppText variant="subtitle">{session.name}</AppText>
                <AppText variant="label" tone="muted">
                  {session.windows} windows - {formatTimestamp(session.lastAttached)}
                </AppText>
              </View>
              <View style={styles.sessionActions}>
                <Pressable
                  style={styles.editButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push(`/session/${host?.id}/${encodeURIComponent(session.name)}`);
                  }}
                  hitSlop={8}
                >
                  <AppText variant="caps" tone="muted">Edit</AppText>
                </Pressable>
                <Pill label={session.attached ? 'Attached' : 'Idle'} tone={session.attached ? 'success' : 'neutral'} />
              </View>
            </View>
            {session.preview && session.preview.length > 0 ? (
              <View style={styles.previewBox}>
                {session.preview.slice(-6).map((line, idx) => (
                  <AppText key={`${session.name}-line-${idx}`} variant="mono" style={styles.previewLine} numberOfLines={1}>
                    {stripAnsi(line) || ' '}
                  </AppText>
                ))}
              </View>
            ) : null}
            <View style={styles.sessionFooter}>
              <AppText variant="label" tone="muted">
                created {formatTimestamp(session.createdAt)}
              </AppText>
              <Pressable onPress={() => handleKill(session.name)} hitSlop={8}>
                <AppText variant="caps" tone="clay">
                  Kill
                </AppText>
              </Pressable>
            </View>
            </Card>
          </Pressable>
        </FadeIn>
      )),
    [sessions, router, host, handleKill]
  );

  if (!host) {
    return (
      <Screen>
        <AppText variant="title">Host not found</AppText>
        <Pressable onPress={() => router.replace('/')}
          style={{ marginTop: theme.spacing.md }}
        >
          <AppText variant="subtitle" tone="accent">
            Back to hosts
          </AppText>
        </Pressable>
      </Screen>
    );
  }

  const hostDisplay = (() => {
    try {
      return host.sshHost || new URL(host.baseUrl).hostname;
    } catch {
      return host.sshHost || host.baseUrl;
    }
  })();

  return (
    <Screen>
      {/* Clean Header */}
      <View style={styles.header}>
        <AppText variant="title">{host.name}</AppText>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push(`/(tabs)/docker?hostId=${host.id}`)}>
            <AppText variant="caps" tone="accent">
              Docker
            </AppText>
          </Pressable>
          <Pressable onPress={() => router.push(`/hosts/${host.id}/edit`)}>
            <AppText variant="caps" tone="accent">
              Edit
            </AppText>
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={syncing}
            onRefresh={() => {
              setSyncing(true);
              refresh();
              setTimeout(() => setSyncing(false), 600);
            }}
            tintColor={systemColors.blue as string}
          />
        }
      >
        <View style={styles.statusRow}>
          <Pill
            label={status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Unknown'}
            tone={status === 'online' ? 'success' : status === 'offline' ? 'warning' : 'neutral'}
          />
          <AppText variant="label" tone="muted">
            {host.connection.toUpperCase()} - {host.username ? `${host.username}@` : ''}
            {hostDisplay}
          </AppText>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <AppText variant="body" tone="clay">
              {error}
            </AppText>
          </View>
        ) : null}

        <SectionHeader title="Host info" />
        <Card style={styles.infoCard}>
          {hostInfo ? (
            <>
              <View style={styles.infoHeader}>
                <View style={styles.infoColumn}>
                  <AppText variant="caps" tone="muted">CPU</AppText>
                  <AppText variant="label">
                    {hostInfo.cpu.usage !== undefined ? `${hostInfo.cpu.usage}%` : '-'}
                  </AppText>
                </View>
                <View style={styles.infoColumn}>
                  <AppText variant="caps" tone="muted">RAM</AppText>
                  <AppText variant="label">
                    {hostInfo.memory.usedPercent !== undefined ? `${hostInfo.memory.usedPercent}%` : '-'}
                  </AppText>
                </View>
                <View style={styles.infoColumn}>
                  <AppText variant="caps" tone="muted">Uptime</AppText>
                  <AppText variant="label">{formatUptime(hostInfo.uptime)}</AppText>
                </View>
              </View>
              <View style={styles.metricRow}>
                <AppText variant="caps" tone="muted" style={styles.metricLabel}>CPU</AppText>
                <View style={styles.metricBar}>
                  <View
                    style={[
                      styles.metricFill,
                      { width: `${Math.min(100, hostInfo.cpu.usage ?? 0)}%`, backgroundColor: palette.accent },
                    ]}
                  />
                </View>
                <AppText variant="label" style={styles.metricValue}>
                  {hostInfo.cpu.usage !== undefined ? `${hostInfo.cpu.usage}%` : '-'}
                </AppText>
              </View>
              <View style={styles.metricRow}>
                <AppText variant="caps" tone="muted" style={styles.metricLabel}>RAM</AppText>
                <View style={styles.metricBar}>
                  <View
                    style={[
                      styles.metricFill,
                      { width: `${Math.min(100, hostInfo.memory.usedPercent)}%`, backgroundColor: palette.mint },
                    ]}
                  />
                </View>
                <AppText variant="label" style={styles.metricValue}>
                  {formatBytes(hostInfo.memory.used)} / {formatBytes(hostInfo.memory.total)}
                </AppText>
              </View>
              <View style={styles.infoFooter}>
                <AppText variant="label" tone="muted">
                  {hostInfo.platform} {hostInfo.release} ({hostInfo.arch})
                </AppText>
                <AppText variant="label" tone="muted">
                  Load {hostInfo.load.map((value) => value.toFixed(2)).join(' / ')}
                </AppText>
              </View>
            </>
          ) : (
            <AppText variant="body" tone="muted">
              Waiting for telemetry...
            </AppText>
          )}
        </Card>

        <SectionHeader title="Create session" />
        <Card style={styles.createCard}>
          <TextInput
            value={newSession}
            onChangeText={setNewSession}
            placeholder="session name"
            placeholderTextColor={palette.muted}
            style={styles.input}
          />
          <Pressable onPress={handleCreate} style={styles.createButton}>
            <AppText variant="subtitle" style={styles.createText}>
              Launch
            </AppText>
          </Pressable>
        </Card>

        <SectionHeader
          title={`Sessions (${sessions.length})`}
          action={
            <Pressable onPress={() => router.push('/keybinds')}>
              <AppText variant="caps" tone="accent">
                Keybinds
              </AppText>
            </Pressable>
          }
        />

        {sessions.length === 0 ? (
          <Card style={styles.emptyCard}>
            <AppText variant="subtitle">No sessions yet</AppText>
            <AppText variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
              Create a session or pull to refresh to get the latest state from tmux.
            </AppText>
          </Card>
        ) : (
          sessionCards
        )}

        <Pressable
          onPress={() =>
            Alert.alert('Remove host', `Remove ${host.name}?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                  await removeHost(host.id);
                  router.replace('/');
                },
              },
            ])
          }
          style={styles.remove}
        >
          <AppText variant="caps" tone="clay">
            Remove host
          </AppText>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  errorBox: {
    backgroundColor: palette.blush,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  infoCard: {
    padding: 14,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  infoColumn: {
    alignItems: 'center',
    flex: 1,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: theme.spacing.xs,
  },
  metricLabel: {
    width: 44,
  },
  metricBar: {
    flex: 1,
    height: 6,
    backgroundColor: palette.surfaceAlt,
    borderRadius: 4,
    overflow: 'hidden',
  },
  metricFill: {
    height: '100%',
    borderRadius: 4,
  },
  metricValue: {
    width: 110,
    textAlign: 'right',
  },
  infoFooter: {
    marginTop: theme.spacing.sm,
    gap: 4,
  },
  createCard: {
    padding: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: theme.radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: palette.ink,
  },
  createButton: {
    marginTop: theme.spacing.xs,
    backgroundColor: palette.accent,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    alignItems: 'center',
  },
  createText: {
    color: '#FFFFFF',
  },
  sessionWrap: {
    marginBottom: 8,
  },
  sessionPressable: {
    borderRadius: theme.radii.lg,
  },
  sessionCard: {
    padding: 14,
  },
  sessionCardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.92,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sessionInfo: {
    flex: 1,
  },
  sessionActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  editButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: palette.surfaceAlt,
  },
  sessionFooter: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewBox: {
    marginTop: theme.spacing.xs,
    padding: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    backgroundColor: '#1a1d21',
  },
  previewLine: {
    fontSize: 10,
    lineHeight: 14,
    color: '#a0a8b0',
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
  },
  remove: {
    marginTop: theme.spacing.lg,
    alignSelf: 'center',
  },
});
