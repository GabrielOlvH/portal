import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { Card } from '@/components/Card';
import { SwipeableRow } from '@/components/SwipeableRow';
import { PlusIcon, ServerIcon, TerminalIcon } from '@/components/icons/HomeIcons';
import { ProviderIcon, providerColors } from '@/components/icons/ProviderIcons';
import { useLaunchSheet } from '@/lib/launch-sheet';
import { Screen } from '@/components/Screen';
import { SkeletonList } from '@/components/Skeleton';
import { getUsage, killSession, renameSession } from '@/lib/api';
import { hostColors, systemColors } from '@/lib/colors';
import { useHostsLive } from '@/lib/live';
import { useTaskLiveUpdates } from '@/lib/task-live-updates';
import { useStore } from '@/lib/store';
import { useProjects } from '@/lib/projects-store';
import { useGitHubStatus, groupStatusesByProject, getStatusSummary } from '@/lib/queries/github';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { Host, HostInfo, HostStatus, ProviderUsage, Session, SessionInsights, GitHubCommitStatus } from '@/lib/types';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Cpu, GitBranch, MemoryStick, Pencil, Plus, Trash2, Github, Check, X, Clock, ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

type CompactUsageCardProps = {
  provider: 'claude' | 'codex' | 'copilot' | 'kimi';
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
      <View style={compactUsageStyles.topRow}>
        <View style={compactUsageStyles.iconContainer}>
          <ProviderIcon provider={provider} size={32} percentRemaining={isWeeklyExhausted ? 0 : sessionLeft} />
        </View>
        <View style={compactUsageStyles.sessionInfo}>
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
        </View>
      </View>
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
    flex: 1,
    padding: 10,
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    flexShrink: 0,
  },
  sessionInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
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

// GitHub CI Status Section Component
type GitHubStatusSectionProps = {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
};

function GitHubStatusSection({ colors, styles }: GitHubStatusSectionProps) {
  const { preferences, hosts } = useStore();
  const { projects } = useProjects();
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: statuses, isLoading } = useGitHubStatus(
    hosts,
    projects,
    preferences.github.enabled && projects.length > 0
  );

  if (!preferences.github.enabled || projects.length === 0) {
    return null;
  }

  const grouped = statuses ? groupStatusesByProject(statuses) : new Map();
  const summary = statuses ? getStatusSummary(statuses) : { total: 0, success: 0, failure: 0, pending: 0, error: 0 };
  const hasFailures = summary.failure > 0 || summary.error > 0;
  const hasPending = summary.pending > 0;

  const getStatusIcon = (state: GitHubCommitStatus['state']) => {
    switch (state) {
      case 'success':
        return <Check size={14} color={colors.green} />;
      case 'failure':
      case 'error':
        return <X size={14} color={colors.red} />;
      case 'pending':
        return <Clock size={14} color={colors.orange} />;
      default:
        return <Clock size={14} color={colors.textMuted} />;
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <FadeIn>
      <Card style={[styles.ciCard, hasFailures && styles.ciCardError]}>
        <Pressable
          onPress={() => setIsExpanded(!isExpanded)}
          style={styles.ciHeader}
        >
          <View style={styles.ciHeaderLeft}>
            <Github size={18} color={hasFailures ? colors.red : hasPending ? colors.orange : colors.green} />
            <AppText variant="subtitle" style={styles.ciTitle}>
              CI Status
            </AppText>
            {isLoading && <ActivityIndicator size="small" color={colors.textSecondary} style={styles.ciLoader} />}
          </View>
          <View style={styles.ciHeaderRight}>
            <AppText variant="label" tone="muted">
              {summary.total > 0
                ? `${projects.length} proj, ${summary.total} branch${summary.total !== 1 ? 'es' : ''}`
                : 'No CI data'}
            </AppText>
            {isExpanded ? (
              <ChevronUp size={16} color={colors.textSecondary} />
            ) : (
              <ChevronDown size={16} color={colors.textSecondary} />
            )}
          </View>
        </Pressable>

        {isExpanded && (
          <View style={styles.ciContent}>
            {statuses && statuses.length > 0 ? (
              <View style={styles.ciProjects}>
                {projects.map((project) => {
                  const projectStatuses = grouped.get(project.id) || [];
                  if (projectStatuses.length === 0) return null;

                  return (
                    <View key={project.id} style={styles.ciProject}>
                      <AppText variant="label" style={styles.ciProjectName}>
                        {project.name}
                      </AppText>
                      <View style={styles.ciBranches}>
                        {projectStatuses.map((status: GitHubCommitStatus) => (
                          <View key={`${status.projectId}-${status.branch}`} style={styles.ciBranch}>
                            <View style={styles.ciBranchLeft}>
                              {getStatusIcon(status.state)}
                              <AppText variant="mono" style={styles.ciBranchName}>
                                {status.branch}
                              </AppText>
                            </View>
                            <AppText variant="label" tone="muted" style={styles.ciTime}>
                              {formatTimeAgo(status.updatedAt)}
                            </AppText>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.ciEmpty}>
                <AppText variant="label" tone="muted">
                  {isLoading ? 'Loading...' : 'No CI status available'}
                </AppText>
                <AppText variant="label" tone="muted" style={styles.ciEmptyHint}>
                  Run "gh auth login" on your host
                </AppText>
              </View>
            )}
          </View>
        )}
      </Card>
    </FadeIn>
  );
}

export default function SessionsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { hosts, ready, preferences } = useStore();
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const { open: openLaunchSheet } = useLaunchSheet();
  const isFocused = useIsFocused();

  const { stateMap, refreshAll, refreshHost } = useHostsLive(hosts, {
    sessions: true,
    insights: isFocused,
    host: isFocused,
    enabled: isFocused,
    intervalMs: 2000,
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

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Aggregate usage from all sessions (take most recent per provider)
  const aggregatedUsage = useMemo(() => {
    let claude: ProviderUsage | null = null;
    let codex: ProviderUsage | null = null;
    let copilot: ProviderUsage | null = null;
    let kimi: ProviderUsage | null = null;
    let claudePolled = 0;
    let codexPolled = 0;
    let copilotPolled = 0;
    let kimiPolled = 0;

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

      // Only accept usage data that has complete session info (percentLeft)
      // This prevents incomplete/loading data from overwriting valid data
      if (insights.claude?.session?.percentLeft != null && polled > claudePolled) {
        claude = insights.claude;
        claudePolled = polled;
      }
      if (insights.codex?.session?.percentLeft != null && polled > codexPolled) {
        codex = insights.codex;
        codexPolled = polled;
      }
      if (insights.copilot?.session?.percentLeft != null && polled > copilotPolled) {
        copilot = insights.copilot;
        copilotPolled = polled;
      }
      if (insights.kimi?.session?.percentLeft != null && polled > kimiPolled) {
        kimi = insights.kimi;
        kimiPolled = polled;
      }
    });

    return { claude, codex, copilot, kimi };
  }, [hosts, sessions, hostUsageMap]);

  const usageVisibility = preferences.usageCards;
  const hasUsageCards =
    (usageVisibility.claude && aggregatedUsage.claude) ||
    (usageVisibility.codex && aggregatedUsage.codex) ||
    (usageVisibility.copilot && aggregatedUsage.copilot) ||
    (usageVisibility.kimi && aggregatedUsage.kimi);

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
      (usageVisibility.copilot && !aggregatedUsage.copilot) ||
      (usageVisibility.kimi && !aggregatedUsage.kimi)
    );
  }, [hosts.length, usageVisibility, aggregatedUsage]);

  useEffect(() => {
    if (!needsUsageFallback || !isFocused) return;
    void refreshUsage();
  }, [needsUsageFallback, refreshUsage, isFocused]);

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

  const handleRenameStart = useCallback(
    (host: Host, sessionName: string) => {
      Alert.prompt(
        'Rename Session',
        `Enter a new name for "${sessionName}"`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Rename',
            onPress: async (newName: string | undefined) => {
              const trimmed = newName?.trim();
              if (!trimmed || trimmed === sessionName) return;
              try {
                await renameSession(host, sessionName, trimmed);
                refreshHost(host.id);
              } catch (err) {
                Alert.alert('Rename failed', err instanceof Error ? err.message : 'Unable to rename session.');
              }
            },
          },
        ],
        'plain-text',
        sessionName
      );
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
            <AppText variant="title">Portal</AppText>
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
                {usageVisibility.kimi && aggregatedUsage.kimi && (
                  <CompactUsageCard provider="kimi" usage={aggregatedUsage.kimi} />
                )}
              </View>
            </FadeIn>
          )}

          {/* GitHub CI Status */}
          <GitHubStatusSection colors={colors} styles={styles} />

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
                          const cwd = session.insights?.meta?.cwd;
                          const projectName = cwd?.split('/').filter(Boolean).pop();
                          const isRunning = agentState === 'running';
                          const isIdle = agentState === 'idle';
                          const isLast = sessionIndex === group.sessions.length - 1;

                          return (
                            <SwipeableRow
                              key={session.name}
                              onRightAction={() => handleKillSession(group.host, session.name)}
                              rightActionIcon={<Trash2 size={20} color="#FFFFFF" />}
                              rightActionColor={systemColors.red}
                              onLeftAction={() => handleRenameStart(group.host, session.name)}
                              leftActionIcon={<Pencil size={20} color="#FFFFFF" />}
                              leftActionColor={systemColors.blue}
                            >
                              <Pressable
                                onPress={() =>
                                  router.push(
                                    `/session/${group.host.id}/${encodeURIComponent(session.name)}/terminal`
                                  )
                                }
                                style={({ pressed }) => [
                                  styles.sessionRow,
                                  !isLast && styles.sessionRowBorder,
                                  pressed && styles.sessionRowPressed,
                                ]}
                              >
                                <View style={styles.sessionRowContent}>
                                  <View
                                    style={[
                                      styles.stateDot,
                                      isRunning && styles.stateDotRunning,
                                      isIdle && styles.stateDotIdle,
                                    ]}
                                  />
                                  <View style={styles.sessionTextContent}>
                                    <AppText variant="body" numberOfLines={1} style={styles.sessionName}>
                                      {session.title || session.name}
                                    </AppText>
                                    {(projectName || command) && (
                                      <AppText
                                        variant="mono"
                                        tone="muted"
                                        numberOfLines={1}
                                        style={styles.sessionMeta}
                                      >
                                        {projectName && command
                                          ? `${projectName} · ${command}`
                                          : projectName || command}
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
                            </SwipeableRow>
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

const createStyles = (colors: ThemeColors, _isDark: boolean) => {
  return StyleSheet.create({
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
    gap: 10,
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
  // CI Status styles
  ciCard: {
    padding: 0,
    overflow: 'hidden',
  },
  ciCardError: {
    borderLeftWidth: 3,
    borderLeftColor: colors.red,
  },
  ciHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  ciHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ciHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ciTitle: {
    fontWeight: '600',
  },
  ciLoader: {
    marginLeft: 8,
  },
  ciContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  ciProjects: {
    gap: 12,
  },
  ciProject: {
    gap: 6,
  },
  ciProjectName: {
    fontWeight: '600',
    fontSize: 13,
  },
  ciBranches: {
    gap: 4,
  },
  ciBranch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
  },
  ciBranchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ciBranchName: {
    fontSize: 12,
  },
  ciTime: {
    fontSize: 11,
  },
  ciEmpty: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 4,
  },
  ciEmptyHint: {
    fontSize: 11,
  },
  });
};
