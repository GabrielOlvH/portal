import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { GlassCard } from '@/components/GlassCard';
import { PlusIcon, ServerIcon, TerminalIcon } from '@/components/icons/HomeIcons';
import { useLaunchSheet } from '@/lib/launch-sheet';
import { PulsingDot } from '@/components/PulsingDot';
import { Screen } from '@/components/Screen';
import { SkeletonList } from '@/components/Skeleton';
import { killSession, checkForUpdate, applyUpdate, UpdateStatus } from '@/lib/api';
import { systemColors } from '@/lib/colors';
import { useHostsLive } from '@/lib/live';
import { useStore } from '@/lib/store';
import { hostAccents, palette, theme } from '@/lib/theme';
import { Host, HostStatus, ProviderUsage, Session, SessionInsights } from '@/lib/types';
import { useRouter } from 'expo-router';
import { Download, GitBranch, Pause, Play, Plus, StopCircle } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

type UsageCardProps = {
  provider: string;
  usage: ProviderUsage;
  color: string;
};

function formatReset(reset?: string): string {
  if (!reset) return 'soon';

  // If it's already a relative time like "5h 23m", clean and return
  if (/^\d+[hmd]\s*/i.test(reset) || /^in\s+/i.test(reset)) {
    return reset.replace(/^in\s+/i, '').trim() || 'soon';
  }

  // Try to parse as ISO date
  const date = new Date(reset);
  if (isNaN(date.getTime())) return reset;

  const now = Date.now();
  const diff = date.getTime() - now;
  if (diff <= 0) return 'soon';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function UsageCard({ provider, usage, color }: UsageCardProps) {
  const dailyLeft = usage.session?.percentLeft;
  const weeklyLeft = usage.weekly?.percentLeft;

  if (dailyLeft == null && weeklyLeft == null) return null;

  return (
    <GlassCard style={styles.usageCard}>
      <AppText variant="caps" style={[styles.usageProvider, { color }]}>
        {provider}
      </AppText>
      {dailyLeft != null && (
        <View style={styles.usageRow}>
          <View style={styles.usageRowHeader}>
            <AppText variant="label" tone="muted" style={styles.usageLabel}>
              Daily
            </AppText>
            <AppText variant="mono" tone="muted" style={styles.usageReset}>
              Resets in {formatReset(usage.session?.reset)}
            </AppText>
          </View>
          <View style={styles.usageBarContainer}>
            <View style={styles.usageBarBg}>
              <View
                style={[
                  styles.usageBarFill,
                  { width: `${Math.min(100, dailyLeft)}%`, backgroundColor: color },
                ]}
              />
            </View>
            <AppText variant="mono" style={styles.usagePercent}>
              {Math.round(dailyLeft)}%
            </AppText>
          </View>
        </View>
      )}
      {weeklyLeft != null && (
        <View style={styles.usageRow}>
          <View style={styles.usageRowHeader}>
            <AppText variant="label" tone="muted" style={styles.usageLabel}>
              Weekly
            </AppText>
            <AppText variant="mono" tone="muted" style={styles.usageReset}>
              Resets in {formatReset(usage.weekly?.reset)}
            </AppText>
          </View>
          <View style={styles.usageBarContainer}>
            <View style={styles.usageBarBg}>
              <View
                style={[
                  styles.usageBarFill,
                  { width: `${Math.min(100, weeklyLeft)}%`, backgroundColor: color },
                ]}
              />
            </View>
            <AppText variant="mono" style={styles.usagePercent}>
              {Math.round(weeklyLeft)}%
            </AppText>
          </View>
        </View>
      )}
    </GlassCard>
  );
}
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

type SessionWithHost = Session & { host: Host; hostStatus: HostStatus };

export default function SessionsScreen() {
  const router = useRouter();
  const { hosts, ready } = useStore();
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ host: Host; status: UpdateStatus } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const { open: openLaunchSheet } = useLaunchSheet();

  const { stateMap, refreshAll, refreshHost } = useHostsLive(hosts, {
    sessions: true,
    insights: true,
  });

  const sessions = useMemo(() => {
    const all: SessionWithHost[] = [];
    hosts.forEach((host) => {
      const hostState = stateMap[host.id];
      const hostStatus = hostState?.status ?? 'checking';
      (hostState?.sessions ?? []).forEach((session) => {
        all.push({ ...session, host, hostStatus });
      });
    });
    all.sort((a, b) => {
      const aTime = a.lastAttached || a.createdAt || 0;
      const bTime = b.lastAttached || b.createdAt || 0;
      return bTime - aTime;
    });
    return all;
  }, [hosts, stateMap]);

  const isPending =
    ready &&
    hosts.length > 0 &&
    !Object.values(stateMap).some(
      (state) => state.status === 'online' || state.status === 'offline'
    );

  // Check for agent updates on any online host
  useEffect(() => {
    const onlineHosts = hosts.filter((h) => stateMap[h.id]?.status === 'online');
    if (onlineHosts.length === 0) return;

    const checkUpdates = async () => {
      for (const host of onlineHosts) {
        try {
          const status = await checkForUpdate(host);
          if (status.updateAvailable) {
            setUpdateInfo({ host, status });
            return;
          }
        } catch {
          // Ignore errors, host might not support updates
        }
      }
      setUpdateInfo(null);
    };

    checkUpdates();
    const interval = setInterval(checkUpdates, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [hosts, stateMap]);

  const handleUpdate = useCallback(async () => {
    if (!updateInfo || isUpdating) return;
    setIsUpdating(true);
    try {
      await applyUpdate(updateInfo.host);
      Alert.alert('Update Started', 'The agent is updating and will restart.');
      setUpdateInfo(null);
    } catch (err) {
      Alert.alert('Update Failed', err instanceof Error ? err.message : 'Could not apply update');
    } finally {
      setIsUpdating(false);
    }
  }, [updateInfo, isUpdating]);

  // Aggregate usage from all sessions (take most recent per provider)
  const aggregatedUsage = useMemo(() => {
    let claude: ProviderUsage | null = null;
    let codex: ProviderUsage | null = null;
    let claudePolled = 0;
    let codexPolled = 0;

    sessions.forEach((session) => {
      const insights = session.insights;
      if (!insights) return;
      const polled = insights.meta?.lastPolled ?? 0;

      if (insights.claude && polled > claudePolled) {
        claude = insights.claude;
        claudePolled = polled;
      }
      if (insights.codex && polled > codexPolled) {
        codex = insights.codex;
        codexPolled = polled;
      }
    });

    return { claude, codex };
  }, [sessions]);

  const handleKillSession = useCallback(
    (host: Host, sessionName: string) => {
      Alert.alert('Kill Session', `Are you sure you want to kill "${sessionName}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Kill',
          style: 'destructive',
          onPress: async () => {
            try {
              await killSession(host, sessionName);
              refreshHost(host.id);
            } catch (err) {
              Alert.alert(
                'Failed',
                err instanceof Error ? err.message : 'Could not kill session'
              );
            }
          },
        },
      ]);
    },
    [refreshHost]
  );

  const groupedSessions = useMemo(() => {
    const groups = new Map<
      string,
      { host: Host; hostStatus: HostStatus; sessions: SessionWithHost[] }
    >();

    sessions.forEach((session) => {
      const existing = groups.get(session.host.id);
      if (existing) {
        existing.sessions.push(session);
      } else {
        groups.set(session.host.id, {
          host: session.host,
          hostStatus: session.hostStatus,
          sessions: [session],
        });
      }
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aTimes = a.sessions.map((s) => s.lastAttached || s.createdAt || 0);
      const bTimes = b.sessions.map((s) => s.lastAttached || s.createdAt || 0);
      const aLatest = aTimes.length > 0 ? Math.max(...aTimes) : 0;
      const bLatest = bTimes.length > 0 ? Math.max(...bTimes) : 0;
      return bLatest - aLatest;
    });
  }, [sessions]);

  return (
    <>
      <Screen>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <AppText variant="title">Bridge</AppText>
            {updateInfo && (
              <Pressable
                onPress={handleUpdate}
                disabled={isUpdating}
                style={styles.updateBanner}
              >
                <Download size={12} color={systemColors.blue as string} />
                <AppText variant="mono" style={styles.updateText}>
                  {isUpdating ? 'Updating...' : `Update available (${updateInfo.status.latestVersion})`}
                </AppText>
              </Pressable>
            )}
          </View>
          {hosts.length > 0 && (
            <Pressable
              style={styles.launchButton}
              onPress={openLaunchSheet}
            >
              <Plus size={18} color="#FFFFFF" />
              <AppText variant="label" style={styles.launchButtonText}>
                Launch
              </AppText>
            </Pressable>
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isManualRefresh}
              onRefresh={async () => {
                setIsManualRefresh(true);
                refreshAll();
                setTimeout(() => setIsManualRefresh(false), 600);
              }}
              tintColor={systemColors.blue as string}
            />
          }
        >
          {/* Usage Cards */}
          {(aggregatedUsage.claude || aggregatedUsage.codex) && (
            <FadeIn>
              <View style={styles.usageCardsRow}>
                {aggregatedUsage.claude && (
                  <UsageCard provider="Claude" usage={aggregatedUsage.claude} color="#D97706" />
                )}
                {aggregatedUsage.codex && (
                  <UsageCard provider="Codex" usage={aggregatedUsage.codex} color="#10B981" />
                )}
              </View>
            </FadeIn>
          )}

          {hosts.length === 0 ? (
            <FadeIn delay={100}>
              <GlassCard style={styles.emptyCard}>
                <View style={styles.emptyIconContainer}>
                  <View style={styles.emptyIconRing}>
                    <ServerIcon size={28} color={palette.accent} />
                  </View>
                </View>
                <AppText variant="subtitle" style={styles.emptyTitle}>
                  No hosts yet
                </AppText>
                <AppText variant="body" tone="muted" style={styles.emptyBody}>
                  Connect to a server running the tmux agent to manage your terminal
                  sessions remotely.
                </AppText>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => router.push('/hosts/new')}
                >
                  <PlusIcon size={16} />
                  <AppText variant="subtitle" style={styles.primaryButtonText}>
                    Add your first host
                  </AppText>
                </Pressable>
              </GlassCard>
            </FadeIn>
          ) : isPending ? (
            <FadeIn delay={100}>
              <SkeletonList type="session" count={3} />
            </FadeIn>
          ) : sessions.length === 0 && !isManualRefresh ? (
            <FadeIn delay={100}>
              <GlassCard style={styles.emptySmall}>
                <TerminalIcon size={24} color={palette.muted} />
                <AppText variant="label" tone="muted" style={styles.emptySmallText}>
                  No active sessions
                </AppText>
              </GlassCard>
            </FadeIn>
          ) : (
            <View style={styles.sessionsList}>
              {groupedSessions.map((group, groupIndex) => (
                <FadeIn key={group.host.id} delay={100 + groupIndex * 50}>
                  <View style={styles.hostGroup}>
                    <View style={styles.hostGroupHeader}>
                      <View
                        style={[
                          styles.hostGroupDot,
                          {
                            backgroundColor:
                              group.host.color ||
                              hostAccents[groupIndex % hostAccents.length],
                          },
                        ]}
                      />
                      <AppText variant="caps" style={styles.hostGroupName}>
                        {group.host.name}
                      </AppText>
                      <View style={styles.hostGroupBadge}>
                        <AppText variant="caps" tone="muted" style={styles.hostGroupCount}>
                          {group.sessions.length}
                        </AppText>
                      </View>
                      {group.hostStatus === 'offline' && (
                        <AppText variant="caps" style={styles.hostGroupOffline}>
                          offline
                        </AppText>
                      )}
                    </View>
                    <View style={styles.hostGroupSessions}>
                      {group.sessions.map((session) => {
                        const agentState = session.insights?.meta?.agentState ?? 'stopped';
                        const gitBranch = session.insights?.git?.branch;

                        const stateColor =
                          agentState === 'running'
                            ? palette.accent
                            : agentState === 'idle'
                              ? palette.clay
                              : palette.muted;

                        const StateIcon =
                          agentState === 'running'
                            ? Play
                            : agentState === 'idle'
                              ? Pause
                              : StopCircle;

                        return (
                          <Pressable
                            key={session.name}
                            onPress={() =>
                              router.push(
                                `/session/${group.host.id}/${encodeURIComponent(session.name)}/terminal`
                              )
                            }
                            onLongPress={() => handleKillSession(group.host, session.name)}
                            style={({ pressed }) => [
                              styles.sessionPressable,
                              pressed && styles.sessionCardPressed,
                            ]}
                          >
                            <GlassCard style={styles.sessionCard}>
                              <View style={styles.sessionHeader}>
                                <View
                                  style={[
                                    styles.sessionIndicator,
                                    { backgroundColor: session.host.color || palette.accent },
                                    session.attached && styles.sessionIndicatorActive,
                                  ]}
                                />
                                <View style={styles.sessionInfo}>
                                  <View style={styles.sessionTitleRow}>
                                    <AppText
                                      variant="subtitle"
                                      numberOfLines={1}
                                      style={styles.sessionName}
                                    >
                                      {session.name}
                                    </AppText>
                                    <View
                                      style={[
                                        styles.sessionStateBadge,
                                        { backgroundColor: stateColor + '18' },
                                      ]}
                                    >
                                      <StateIcon size={10} color={stateColor} />
                                    </View>
                                  </View>
                                  {(session.insights?.meta?.agentCommand || gitBranch) && (
                                    <View style={styles.sessionSubtitleRow}>
                                      {session.insights?.meta?.agentCommand && (
                                        <AppText
                                          variant="mono"
                                          tone="muted"
                                          numberOfLines={1}
                                          style={styles.sessionCommand}
                                        >
                                          {session.insights.meta.agentCommand}
                                        </AppText>
                                      )}
                                      {gitBranch && (
                                        <View style={styles.sessionGitBadge}>
                                          <GitBranch size={10} color={palette.muted} />
                                          <AppText
                                            variant="mono"
                                            tone="muted"
                                            style={styles.sessionGitText}
                                          >
                                            {gitBranch}
                                          </AppText>
                                        </View>
                                      )}
                                    </View>
                                  )}
                                </View>
                              </View>
                            </GlassCard>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </FadeIn>
              ))}
            </View>
          )}
        </ScrollView>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  launchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  launchButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  updateText: {
    fontSize: 11,
    color: systemColors.blue as string,
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 16,
  },
  usageCardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  usageCard: {
    flex: 1,
    padding: 12,
    gap: 10,
  },
  usageProvider: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  usageRow: {
    gap: 4,
  },
  usageRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  usageLabel: {
    fontSize: 11,
  },
  usageReset: {
    fontSize: 9,
  },
  usageBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  usageBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: palette.surfaceAlt,
    borderRadius: 3,
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  usagePercent: {
    fontSize: 11,
    width: 32,
    textAlign: 'right',
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
  },
  emptyIconContainer: {
    marginBottom: 20,
  },
  emptyIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginBottom: 8,
  },
  emptyBody: {
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 260,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.accent,
    borderRadius: theme.radii.md,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  emptySmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 32,
  },
  emptySmallText: {
    marginTop: 2,
  },
  sessionsList: {
    gap: 20,
  },
  hostGroup: {
    gap: 10,
  },
  hostGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  hostGroupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  hostGroupName: {
    color: palette.ink,
    fontWeight: '600',
  },
  hostGroupBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: palette.surfaceAlt,
  },
  hostGroupCount: {
    fontSize: 10,
  },
  hostGroupOffline: {
    color: '#F59E0B',
    fontSize: 10,
    marginLeft: 4,
  },
  hostGroupSessions: {
    gap: 8,
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
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sessionIndicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  sessionIndicatorActive: {
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  sessionInfo: {
    flex: 1,
    gap: 4,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionName: {
    flex: 1,
  },
  sessionStateBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionCommand: {
    flex: 1,
    fontSize: 11,
  },
  sessionGitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: palette.surfaceAlt,
  },
  sessionGitText: {
    fontSize: 10,
  },
});
