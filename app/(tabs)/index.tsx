import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { Card } from '@/components/Card';
import { PlusIcon, ServerIcon, TerminalIcon } from '@/components/icons/HomeIcons';
import { ProviderIcon, providerColors } from '@/components/icons/ProviderIcons';
import { useLaunchSheet } from '@/lib/launch-sheet';
import { Screen } from '@/components/Screen';
import { SkeletonList } from '@/components/Skeleton';
import { getUsage, killSession } from '@/lib/api';
import { hostColors, systemColors } from '@/lib/colors';
import { useHostsLive } from '@/lib/live';
import { useTaskLiveUpdates } from '@/lib/task-live-updates';
import { useStore } from '@/lib/store';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { Host, HostInfo, HostStatus, ProviderUsage, Session, SessionInsights } from '@/lib/types';
import { useRouter } from 'expo-router';
import { Cpu, GitBranch, MemoryStick, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View, type ColorValue } from 'react-native';

type CompactUsageCardProps = {
  provider: 'claude' | 'codex' | 'copilot';
  usage: ProviderUsage;
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

function CompactUsageCard({ provider, usage }: CompactUsageCardProps) {
  const { colors } = useTheme();
  const sessionLeft = usage.session?.percentLeft;
  const weeklyLeft = usage.weekly?.percentLeft;
  const color = providerColors[provider];
  const hasWeekly = provider !== 'copilot' && weeklyLeft != null;
  const isWeeklyExhausted = hasWeekly && weeklyLeft <= 0;

  if (sessionLeft == null) return null;

  return (
    <Card style={compactUsageStyles.card}>
      <View style={compactUsageStyles.iconContainer}>
        <ProviderIcon provider={provider} size={32} percentRemaining={isWeeklyExhausted ? 0 : sessionLeft} />
      </View>
      <AppText
        variant="mono"
        style={[
          compactUsageStyles.percent,
          { color: isWeeklyExhausted ? withAlpha(color, 0.3) : color },
          isWeeklyExhausted && compactUsageStyles.strikethrough,
        ]}
      >
        {Math.round(sessionLeft)}%
      </AppText>
      {usage.session?.reset && (
        <AppText variant="label" tone="muted" style={compactUsageStyles.reset}>
          {formatReset(usage.session.reset)}
        </AppText>
      )}
      {hasWeekly && (
        <View style={compactUsageStyles.weeklySection}>
          <View style={[compactUsageStyles.weeklyBar, { backgroundColor: colors.barBg }]}>
            <View
              style={[
                compactUsageStyles.weeklyFill,
                { width: `${Math.min(100, weeklyLeft)}%`, backgroundColor: color },
              ]}
            />
          </View>
          <View style={compactUsageStyles.weeklyInfo}>
            <AppText variant="label" tone="muted" style={compactUsageStyles.weeklyLabel}>
              {Math.round(weeklyLeft)}%
            </AppText>
            {usage.weekly?.reset && (
              <AppText variant="label" tone="muted" style={compactUsageStyles.weeklyReset}>
                {formatReset(usage.weekly.reset)}
              </AppText>
            )}
          </View>
        </View>
      )}
    </Card>
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

const compactUsageStyles = StyleSheet.create({
  card: {
    minWidth: 95,
    padding: 10,
    alignItems: 'center',
    gap: 3,
  },
  iconContainer: {},
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  percent: {
    fontSize: 15,
    fontWeight: '600',
  },
  reset: {
    fontSize: 9,
  },
  weeklySection: {
    width: '100%',
    marginTop: 4,
    gap: 2,
  },
  weeklyBar: {
    width: '100%',
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  weeklyFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  weeklyInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weeklyLabel: {
    fontSize: 8,
  },
  weeklyReset: {
    fontSize: 7,
  },
});

type SessionWithHost = Session & { host: Host; hostStatus: HostStatus };

export default function SessionsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hosts, ready, preferences } = useStore();
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const { open: openLaunchSheet } = useLaunchSheet();

  const { stateMap, refreshAll, refreshHost } = useHostsLive(hosts, {
    sessions: true,
    insights: true,
    host: true,
  });
  const [hostUsageMap, setHostUsageMap] = useState<Record<string, SessionInsights>>({});

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

  useTaskLiveUpdates(sessions, preferences.notifications.liveEnabled);

  const isPending =
    ready &&
    hosts.length > 0 &&
    !Object.values(stateMap).some(
      (state) => state.status === 'online' || state.status === 'offline'
    );
  const isBooting = !ready;

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Aggregate usage from all sessions (take most recent per provider)
  const aggregatedUsage = useMemo(() => {
    let claude: ProviderUsage | null = null;
    let codex: ProviderUsage | null = null;
    let copilot: ProviderUsage | null = null;
    let claudePolled = 0;
    let codexPolled = 0;
    let copilotPolled = 0;

    const allInsights: SessionInsights[] = [];
    sessions.forEach((session) => {
      if (session.insights) allInsights.push(session.insights);
    });
    const hostIds = new Set(hosts.map((host) => host.id));
    Object.entries(hostUsageMap).forEach(([hostId, usage]) => {
      if (hostIds.has(hostId)) allInsights.push(usage);
    });

    allInsights.forEach((insights) => {
      const polled = insights.meta?.lastPolled ?? 0;

      if (insights.claude && polled > claudePolled) {
        claude = insights.claude;
        claudePolled = polled;
      }
      if (insights.codex && polled > codexPolled) {
        codex = insights.codex;
        codexPolled = polled;
      }
      if (insights.copilot && polled > copilotPolled) {
        copilot = insights.copilot;
        copilotPolled = polled;
      }
    });

    return { claude, codex, copilot };
  }, [hosts, sessions, hostUsageMap]);

  const usageVisibility = preferences.usageCards;
  const hasUsageCards =
    (usageVisibility.claude && aggregatedUsage.claude) ||
    (usageVisibility.codex && aggregatedUsage.codex) ||
    (usageVisibility.copilot && aggregatedUsage.copilot);

  const refreshUsage = useCallback(async () => {
    if (hosts.length === 0) {
      setHostUsageMap({});
      return;
    }

    const results = await Promise.all(
      hosts.map(async (host) => {
        try {
          const usage = await getUsage(host);
          return { id: host.id, usage };
        } catch {
          return { id: host.id, usage: null };
        }
      })
    );

    setHostUsageMap((prev) => {
      const hostIds = new Set(hosts.map((host) => host.id));
      const next: Record<string, SessionInsights> = {};
      Object.keys(prev).forEach((id) => {
        if (hostIds.has(id)) next[id] = prev[id];
      });
      results.forEach(({ id, usage }) => {
        if (usage) next[id] = usage;
      });
      return next;
    });
  }, [hosts]);

  const needsUsageFallback = useMemo(() => {
    if (hosts.length === 0) return false;
    return (
      (usageVisibility.claude && !aggregatedUsage.claude) ||
      (usageVisibility.codex && !aggregatedUsage.codex) ||
      (usageVisibility.copilot && !aggregatedUsage.copilot)
    );
  }, [hosts.length, usageVisibility, aggregatedUsage]);

  useEffect(() => {
    if (!needsUsageFallback) return;
    void refreshUsage();
  }, [needsUsageFallback, refreshUsage]);

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
      { host: Host; hostStatus: HostStatus; hostInfo?: HostInfo; sessions: SessionWithHost[] }
    >();

    sessions.forEach((session) => {
      const existing = groups.get(session.host.id);
      const hostState = stateMap[session.host.id];
      if (existing) {
        existing.sessions.push(session);
      } else {
        groups.set(session.host.id, {
          host: session.host,
          hostStatus: session.hostStatus,
          hostInfo: hostState?.hostInfo,
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
  }, [sessions, stateMap]);

  return (
    <>
      <Screen>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <AppText variant="title">Bridge</AppText>
          </View>
          {hosts.length > 0 && (
            <Pressable
              style={styles.launchButton}
              onPress={openLaunchSheet}
            >
              <Plus size={18} color={colors.accentText} />
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
                void refreshUsage();
                setTimeout(() => setIsManualRefresh(false), 600);
              }}
              tintColor={systemColors.blue as string}
            />
          }
        >
          {/* Usage Cards */}
          {hasUsageCards && (
            <FadeIn>
              <View style={styles.usageCardsRow}>
                {usageVisibility.claude && aggregatedUsage.claude && (
                  <CompactUsageCard provider="claude" usage={aggregatedUsage.claude} />
                )}
                {usageVisibility.codex && aggregatedUsage.codex && (
                  <CompactUsageCard provider="codex" usage={aggregatedUsage.codex} />
                )}
                {usageVisibility.copilot && aggregatedUsage.copilot && (
                  <CompactUsageCard provider="copilot" usage={aggregatedUsage.copilot} />
                )}
              </View>
            </FadeIn>
          )}

          {isBooting ? (
            <FadeIn delay={100}>
              <SkeletonList type="session" count={3} />
            </FadeIn>
          ) : hosts.length === 0 ? (
            <FadeIn delay={100}>
              <Card style={styles.emptyCard}>
                <View style={styles.emptyIconContainer}>
                  <View style={styles.emptyIconRing}>
                    <ServerIcon size={28} color={colors.accent} />
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
              </Card>
            </FadeIn>
          ) : isPending ? (
            <FadeIn delay={100}>
              <SkeletonList type="session" count={3} />
            </FadeIn>
          ) : sessions.length === 0 && !isManualRefresh ? (
            <FadeIn delay={100}>
              <Card style={styles.emptySmall}>
                <TerminalIcon size={24} color={colors.textSecondary} />
                <AppText variant="label" tone="muted" style={styles.emptySmallText}>
                  No active sessions
                </AppText>
              </Card>
            </FadeIn>
          ) : (
            <View style={styles.sessionsList}>
              {groupedSessions.map((group, groupIndex) => {
                const hostColor = group.host.color || hostColors[groupIndex % hostColors.length];
                return (
                  <FadeIn key={group.host.id} delay={100 + groupIndex * 50}>
                    <Card style={styles.hostGroupCard}>
                      <View style={styles.hostGroupHeader}>
                        <View style={[styles.hostGroupAccent, { backgroundColor: hostColor }]} />
                        <AppText variant="label" style={styles.hostGroupName}>
                          {group.host.name}
                        </AppText>
                        {group.hostStatus === 'offline' && (
                          <View style={styles.offlineBadge}>
                            <AppText variant="mono" style={styles.offlineText}>offline</AppText>
                          </View>
                        )}
                        {group.hostInfo && (
                          <View style={styles.hostStatsBadge}>
                            <Cpu size={10} color={colors.textMuted} />
                            <AppText variant="mono" style={styles.hostStatsText}>
                              {group.hostInfo.cpu.usage ?? '-'}%
                            </AppText>
                            <MemoryStick size={10} color={colors.textMuted} />
                            <AppText variant="mono" style={styles.hostStatsText}>
                              {group.hostInfo.memory.usedPercent ?? '-'}%
                            </AppText>
                          </View>
                        )}
                      </View>
                      <View style={styles.hostGroupSessions}>
                        {group.sessions.map((session, sessionIndex) => {
                          const agentState = session.insights?.meta?.agentState ?? 'stopped';
                          const gitBranch = session.insights?.git?.branch;
                          const command = session.insights?.meta?.agentCommand;
                          const isRunning = agentState === 'running';
                          const isIdle = agentState === 'idle';
                          const isLast = sessionIndex === group.sessions.length - 1;

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
                                styles.sessionRow,
                                !isLast && styles.sessionRowBorder,
                                pressed && styles.sessionRowPressed,
                              ]}
                            >
                              <View style={styles.sessionRowContent}>
                                <View style={[
                                  styles.stateDot,
                                  isRunning && styles.stateDotRunning,
                                  isIdle && styles.stateDotIdle,
                                ]} />
                                <View style={styles.sessionTextContent}>
                                  <AppText variant="body" numberOfLines={1} style={styles.sessionName}>
                                    {session.name}
                                  </AppText>
                                  {command && (
                                    <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.sessionMeta}>
                                      {command}
                                    </AppText>
                                  )}
                                </View>
                                {gitBranch && (
                                  <View style={styles.gitPill}>
                                    <GitBranch size={10} color={colors.textMuted} />
                                    <AppText variant="mono" tone="muted" style={styles.gitPillText}>
                                      {gitBranch}
                                    </AppText>
                                  </View>
                                )}
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Card>
                  </FadeIn>
                );
              })}
            </View>
          )}
        </ScrollView>
      </Screen>
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  launchButtonText: {
    color: colors.accentText,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 16,
  },
  usageCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    backgroundColor: colors.barBg,
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
    backgroundColor: colors.barBg,
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
    backgroundColor: colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    color: colors.accentText,
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
    gap: 12,
  },
  hostGroupCard: {
    padding: 0,
    overflow: 'hidden',
  },
  hostGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  hostGroupAccent: {
    width: 3,
    height: 14,
    borderRadius: 1.5,
  },
  hostGroupName: {
    flex: 1,
    fontWeight: '600',
  },
  offlineBadge: {
    backgroundColor: withAlpha(colors.orange, 0.18),
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  offlineText: {
    color: colors.orange,
    fontSize: 10,
    fontWeight: '500',
  },
  hostStatsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  hostStatsText: {
    fontSize: 10,
    color: colors.textMuted,
    marginRight: 6,
  },
  hostGroupSessions: {},
  sessionRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  sessionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  sessionRowPressed: {
    backgroundColor: colors.cardPressed,
  },
  sessionRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
  },
  stateDotRunning: {
    backgroundColor: colors.green,
    shadowColor: colors.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  stateDotIdle: {
    backgroundColor: colors.orange,
  },
  sessionTextContent: {
    flex: 1,
    gap: 2,
  },
  sessionName: {},
  sessionMeta: {
    fontSize: 11,
  },
  gitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cardPressed,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gitPillText: {
    fontSize: 10,
  },
});
