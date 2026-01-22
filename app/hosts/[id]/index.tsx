import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { Card } from '@/components/Card';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import {
  createSession,
  killSession,
  getServiceStatus,
  restartService,
  ServiceStatus,
} from '@/lib/api';
import { systemColors } from '@/lib/colors';
import { useHostLive } from '@/lib/live';
import { useStore } from '@/lib/store';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { HostInfo } from '@/lib/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
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
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const { hosts, updateHostLastSeen, removeHost } = useStore();
  const host = hosts.find((item) => item.id === params.id);
  const [newSession, setNewSession] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const isFocused = useIsFocused();

  const { state, refresh } = useHostLive(host, {
    sessions: true,
    host: true,
    enabled: isFocused,
  });

  const sessions = state?.sessions ?? [];
  const status = state?.status ?? 'unknown';
  const error = state?.error ?? null;
  const hostInfo: HostInfo | undefined = state?.hostInfo;
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (!host?.id || !state?.lastUpdate) return;
    if (host.lastSeen === state.lastUpdate) return;
    updateHostLastSeen(host.id, state.lastUpdate);
  }, [host?.id, host?.lastSeen, state?.lastUpdate, updateHostLastSeen]);

  useEffect(() => {
    if (!host || !isFocused) return;
    let cancelled = false;
    const fetchServiceStatus = async () => {
      try {
        const svcStatus = await getServiceStatus(host);
        if (!cancelled) {
          setServiceStatus(svcStatus);
          setServiceError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setServiceStatus(null);
          if (err instanceof Error && err.message.includes('404')) {
            setServiceError('Service info unavailable');
          } else {
            setServiceError(err instanceof Error ? err.message : 'Failed to fetch service status');
          }
        }
      }
    };
    fetchServiceStatus();
    return () => { cancelled = true; };
  }, [host, isFocused, state?.lastUpdate]);

  const handleRestartService = useCallback(async () => {
    if (!host || restarting) return;
    Alert.alert('Restart service', 'Restart the ter agent service?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restart',
        style: 'destructive',
        onPress: async () => {
          setRestarting(true);
          try {
            const result = await restartService(host);
            if (result.success) {
              Alert.alert('Service restarting', result.message);
            } else {
              Alert.alert('Restart failed', result.message);
            }
          } catch (err) {
            Alert.alert('Restart failed', err instanceof Error ? err.message : 'Unable to restart service.');
          } finally {
            setRestarting(false);
          }
        },
      },
    ]);
  }, [host, restarting]);

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
    [sessions, router, host, handleKill, styles]
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
      return new URL(host.baseUrl).hostname;
    } catch {
      return host.baseUrl;
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
                      { width: `${Math.min(100, hostInfo.cpu.usage ?? 0)}%`, backgroundColor: colors.blue },
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
                      { width: `${Math.min(100, hostInfo.memory.usedPercent)}%`, backgroundColor: colors.green },
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

        <SectionHeader title="Service" />
        <Card style={styles.serviceCard}>
          {serviceError ? (
            <AppText variant="body" tone="muted">{serviceError}</AppText>
          ) : serviceStatus ? (
            <>
              <View style={styles.serviceHeader}>
                <View style={styles.serviceStatusRow}>
                  <Pill
                    label={serviceStatus.status === 'running' ? 'Running' : serviceStatus.status === 'stopped' ? 'Stopped' : 'Unknown'}
                    tone={serviceStatus.status === 'running' ? 'success' : serviceStatus.status === 'stopped' ? 'warning' : 'neutral'}
                  />
                  <AppText variant="label" tone="muted">
                    {formatUptime(serviceStatus.uptimeSeconds)}
                  </AppText>
                </View>
                <AppText variant="label" tone="muted">
                  v{serviceStatus.version}
                </AppText>
              </View>
              <View style={styles.serviceInfo}>
                <View style={styles.serviceInfoRow}>
                  <AppText variant="caps" tone="muted">Platform</AppText>
                  <AppText variant="label">
                    {serviceStatus.platform} ({serviceStatus.initSystem})
                  </AppText>
                </View>
                <View style={styles.serviceInfoRow}>
                  <AppText variant="caps" tone="muted">PID</AppText>
                  <AppText variant="label">{serviceStatus.pid}</AppText>
                </View>
                <View style={styles.serviceInfoRow}>
                  <AppText variant="caps" tone="muted">Auto-restart</AppText>
                  <AppText variant="label">{serviceStatus.autoRestart ? 'Yes' : 'No'}</AppText>
                </View>
              </View>
              <View style={styles.serviceActions}>
                <Pressable
                  onPress={handleRestartService}
                  disabled={restarting}
                  style={[styles.serviceButton, restarting && styles.serviceButtonDisabled]}
                >
                  <AppText variant="caps" tone={restarting ? 'muted' : 'accent'}>
                    {restarting ? 'Restarting...' : 'Restart'}
                  </AppText>
                </Pressable>
              </View>
            </>
          ) : (
            <AppText variant="body" tone="muted">Loading service status...</AppText>
          )}
        </Card>

        <SectionHeader title="Create session" />
        <Card style={styles.createCard}>
          <TextInput
            value={newSession}
            onChangeText={setNewSession}
            placeholder="session name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Pressable onPress={handleCreate} style={styles.createButton}>
            <AppText variant="subtitle" style={styles.createText}>
              Launch
            </AppText>
          </Pressable>
        </Card>

        <SectionHeader title={`Sessions (${sessions.length})`} />

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

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
    backgroundColor: withAlpha(colors.red, 0.12),
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
    backgroundColor: colors.barBg,
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
  serviceCard: {
    padding: 14,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  serviceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serviceInfo: {
    gap: 6,
  },
  serviceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.sm,
    gap: 12,
  },
  serviceButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
    backgroundColor: colors.cardPressed,
  },
  serviceButtonDisabled: {
    opacity: 0.5,
  },
  createCard: {
    padding: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  createButton: {
    marginTop: theme.spacing.xs,
    backgroundColor: colors.accent,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    alignItems: 'center',
  },
  createText: {
    color: colors.accentText,
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
    backgroundColor: colors.cardPressed,
  },
  sessionFooter: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
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
