import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { SwipeableRow } from '@/components/SwipeableRow';
import { FAB } from '@/components/FAB';
import { PlusIcon, ServerIcon, TerminalIcon } from '@/components/icons/HomeIcons';
import { StatusBar } from '@/components/StatusBar';
import { ExternalLink } from 'lucide-react-native';
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
import { TIMING } from '@/lib/constants';
import { Host, HostInfo, HostStatus, ProviderUsage, Session, SessionInsights, GitHubCommitStatus } from '@/lib/types';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { GitBranch, Pencil, Trash2, Github, Check, X, Clock, ChevronDown, ChevronUp, GripVertical } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  Linking,
} from 'react-native';

type SessionWithHost = Session & { host: Host; hostStatus: HostStatus };

// Draggable Session Row Component
type SessionRowProps = {
  session: SessionWithHost;
  index: number;
  totalSessions: number;
  isLast: boolean;
  isReordering: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPress: () => void;
  onKill: () => void;
  onRename: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
};

function SessionRow({
  session,
  index,
  totalSessions,
  isLast,
  isReordering,
  onMoveUp,
  onMoveDown,
  onPress,
  onKill,
  onRename,
  colors,
  styles,
}: SessionRowProps) {
  const agentState = session.insights?.meta?.agentState ?? 'stopped';
  const gitBranch = session.insights?.git?.branch;
  const command = session.insights?.meta?.agentCommand;
  const cwd = session.insights?.meta?.cwd;
  const projectName = cwd?.split('/').filter(Boolean).pop();
  const isRunning = agentState === 'running';
  const isIdle = agentState === 'idle';

  if (isReordering) {
    return (
      <View style={[styles.sessionRow, !isLast && styles.sessionRowBorder]}>
        <View style={styles.sessionRowContent}>
          <View
            style={[
              styles.stateDot,
              isRunning && styles.stateDotRunning,
              isIdle && styles.stateDotIdle,
            ]}
          />
          <View style={styles.sessionTextContent}>
            <AppText variant="body" style={styles.sessionName}>
              {session.title || session.name}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={onMoveUp}
              disabled={index === 0}
              style={({ pressed }) => [
                styles.reorderButton,
                index === 0 && styles.reorderButtonDisabled,
                pressed && index !== 0 && styles.reorderButtonPressed,
              ]}
            >
              <ChevronUp size={20} color={index === 0 ? colors.textMuted : colors.text} />
            </Pressable>
            <Pressable
              onPress={onMoveDown}
              disabled={index === totalSessions - 1}
              style={({ pressed }) => [
                styles.reorderButton,
                index === totalSessions - 1 && styles.reorderButtonDisabled,
                pressed && index !== totalSessions - 1 && styles.reorderButtonPressed,
              ]}
            >
              <ChevronDown size={20} color={index === totalSessions - 1 ? colors.textMuted : colors.text} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <SwipeableRow
      onRightAction={onKill}
      rightActionIcon={<Trash2 size={20} color="#FFFFFF" />}
      rightActionColor={systemColors.red}
      onLeftAction={onRename}
      leftActionIcon={<Pencil size={20} color="#FFFFFF" />}
      leftActionColor={systemColors.blue}
    >
      <Pressable
        onPress={onPress}
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
            <AppText variant="body" style={styles.sessionName}>
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
}

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

  const getStatusColor = (state: GitHubCommitStatus['state']) => {
    switch (state) {
      case 'success':
        return colors.green;
      case 'failure':
      case 'error':
        return colors.red;
      case 'pending':
        return colors.orange;
      default:
        return colors.textMuted;
    }
  };

  const openGitHubRepo = (repo: string) => {
    const url = `https://github.com/${repo}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open GitHub');
    });
  };

  const openGitHubActions = (repo: string, branch: string) => {
    const url = `https://github.com/${repo}/actions?query=branch:${encodeURIComponent(branch)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open GitHub Actions');
    });
  };

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open URL');
    });
  };

  const getShortSha = (sha: string) => sha.slice(0, 7);

  // Get latest status per project for the summary view
  const getLatestStatus = (projectId: string): GitHubCommitStatus | null => {
    const projectStatuses = grouped.get(projectId) || [];
    if (projectStatuses.length === 0) return null;
    return projectStatuses.sort((a: GitHubCommitStatus, b: GitHubCommitStatus) => b.updatedAt - a.updatedAt)[0];
  };

  return (
    <FadeIn>
      <View style={styles.ciSection}>
        <Pressable
          onPress={() => setIsExpanded(!isExpanded)}
          style={styles.ciHeader}
        >
          <View style={styles.ciHeaderLeft}>
            <Github size={14} color={hasFailures ? colors.red : hasPending ? colors.orange : colors.green} />
            <AppText variant="caps" tone="muted" style={styles.ciTitle}>
              {summary.total > 0
                ? `${summary.success} ok · ${summary.failure + summary.error} fail · ${summary.pending} run`
                : 'CI'}
            </AppText>
          </View>
          <View style={styles.ciHeaderRight}>
            {isLoading && <ActivityIndicator size="small" color={colors.textSecondary} />}
            {!isExpanded && summary.total > 0 && (
              <View style={styles.ciSummaryDots}>
                {projects.slice(0, 4).map((project) => {
                  const latest = getLatestStatus(project.id);
                  if (!latest) return null;
                  return (
                    <View key={project.id} style={[styles.ciStatusDot, { backgroundColor: getStatusColor(latest.state) }]} />
                  );
              })}
            </View>
          )}
            {isExpanded ? (
              <ChevronUp size={14} color={colors.textMuted} />
            ) : (
              <ChevronDown size={14} color={colors.textMuted} />
            )}
          </View>
        </Pressable>

        {isExpanded && (
          <View style={styles.ciContent}>
            {statuses && statuses.length > 0 ? (
              <View style={styles.ciBranches}>
                {statuses.map((status: GitHubCommitStatus) => {
                  const primaryContext = status.contexts.find(c => c.targetUrl) || status.contexts[0];
                  const ciUrl = primaryContext?.targetUrl;
                  const repoName = status.repo.split('/')[1];
                  
                  // Build diff info string
                  const diffParts: string[] = [];
                  if (status.ahead && status.ahead > 0) diffParts.push(`+${status.ahead}`);
                  if (status.behind && status.behind > 0) diffParts.push(`-${status.behind}`);
                  if (status.staged && status.staged > 0) diffParts.push(`${status.staged}s`);
                  if (status.unstaged && status.unstaged > 0) diffParts.push(`${status.unstaged}u`);
                  const diffInfo = diffParts.length > 0 ? diffParts.join(' ') : null;
                  
                  return (
                    <Pressable
                      key={`${status.projectId}-${status.branch}`}
                      style={styles.ciBranch}
                      onPress={() => ciUrl ? openUrl(ciUrl) : openGitHubActions(status.repo, status.branch)}
                    >
                      {getStatusIcon(status.state)}
                      <AppText variant="mono" style={styles.ciBranchName} numberOfLines={1}>
                        {repoName}/{status.branch}
                      </AppText>
                      <AppText variant="mono" tone="muted" style={styles.ciCommitSha}>
                        {getShortSha(status.sha)}
                      </AppText>
                      {diffInfo && (
                        <AppText variant="mono" tone="warning" style={styles.ciDiffInfo}>
                          {diffInfo}
                        </AppText>
                      )}
                      <ExternalLink size={10} color={colors.textMuted} />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <AppText variant="label" tone="muted" style={styles.ciEmpty}>
                {isLoading ? 'Loading...' : 'No CI data · run "gh auth login"'}
              </AppText>
            )}
          </View>
        )}
      </View>
    </FadeIn>
  );
}

export default function SessionsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { hosts, ready, preferences, updateSessionOrder } = useStore();
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const [reorderingHostId, setReorderingHostId] = useState<string | null>(null);
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
    let cursor: ProviderUsage | null = null;
    let kimi: ProviderUsage | null = null;
    let claudePolled = 0;
    let codexPolled = 0;
    let copilotPolled = 0;
    let cursorPolled = 0;
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
      if (insights.cursor?.session?.percentLeft != null && polled > cursorPolled) {
        cursor = insights.cursor;
        cursorPolled = polled;
      }
      if (insights.kimi?.session?.percentLeft != null && polled > kimiPolled) {
        kimi = insights.kimi;
        kimiPolled = polled;
      }
    });

    return { claude, codex, copilot, cursor, kimi };
  }, [hosts, sessions, hostUsageMap]);

  const usageVisibility = preferences.usageCards;

  // Compute host summary for StatusBar
  const hostSummary = useMemo(() => {
    const onlineHosts = hosts.filter((h) => stateMap[h.id]?.status === 'online');
    return {
      online: onlineHosts.length,
      total: hosts.length,
      names: onlineHosts.slice(0, 3).map((h) => h.name),
    };
  }, [hosts, stateMap]);

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
      (usageVisibility.cursor && !aggregatedUsage.cursor) ||
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

    // Apply manual ordering per host
    groups.forEach((group) => {
      const order = preferences.sessionOrders.find((o) => o.hostId === group.host.id);
      if (order && order.sessionNames.length > 0) {
        const orderMap = new Map(order.sessionNames.map((name, index) => [name, index]));
        group.sessions.sort((a, b) => {
          const aIndex = orderMap.get(a.name) ?? Infinity;
          const bIndex = orderMap.get(b.name) ?? Infinity;
          return aIndex - bIndex;
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
  }, [sessions, stateMap, preferences.sessionOrders]);

  // Reorder handlers
  const handleMoveSession = useCallback((hostId: string, fromIndex: number, toIndex: number) => {
    const group = groupedSessions.find((g) => g.host.id === hostId);
    if (!group) return;

    const newOrder = [...group.sessions];
    const [movedSession] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedSession);

    const sessionNames = newOrder.map((s) => s.name);
    updateSessionOrder(hostId, sessionNames);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [groupedSessions, updateSessionOrder]);

  return (
    <>
      <Screen>
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
                setTimeout(() => setIsManualRefresh(false), TIMING.REFRESH_INDICATOR_MS);
              }}
              tintColor={systemColors.blue as string}
            />
          }
        >
          {/* Status Bar - Usage + CI + Hosts summary */}
          <FadeIn>
            <StatusBar
              usage={aggregatedUsage}
              usageVisibility={usageVisibility}
              ciSummary={null}
              ciEnabled={preferences.github.enabled}
              hostSummary={hostSummary}
            />
          </FadeIn>

          {/* GitHub CI Status - Expandable Details */}
          <GitHubStatusSection colors={colors} styles={styles} />

          {isBooting ? (
            <FadeIn delay={100}>
              <SkeletonList type="session" count={3} />
            </FadeIn>
          ) : hosts.length === 0 ? (
            <FadeIn delay={100}>
              <View style={styles.emptyCard}>
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
              </View>
            </FadeIn>
          ) : isPending ? (
            <FadeIn delay={100}>
              <SkeletonList type="session" count={3} />
            </FadeIn>
          ) : sessions.length === 0 && !isManualRefresh ? (
            <FadeIn delay={100}>
              <View style={styles.emptySmall}>
                <TerminalIcon size={20} color={colors.textMuted} />
                <AppText variant="label" tone="muted">
                  No active sessions
                </AppText>
              </View>
            </FadeIn>
          ) : (
            <View style={styles.sessionsList}>
              {groupedSessions.map((group, groupIndex) => {
                const hostColor = group.host.color || hostColors[groupIndex % hostColors.length];
                const isFirstGroup = groupIndex === 0;
                return (
                  <FadeIn key={group.host.id} delay={50 + groupIndex * 30}>
                    <View>
                      {/* Host Divider */}
                      <View style={[
                        styles.hostDivider,
                        !isFirstGroup && styles.hostDividerBorder,
                        { borderTopColor: colors.separator }
                      ]}>
                        <View style={[styles.hostAccent, { backgroundColor: hostColor }]} />
                        <AppText variant="caps" tone="muted" style={styles.hostName}>
                          {group.host.name}
                        </AppText>
                        {group.hostStatus === 'offline' && (
                          <AppText variant="mono" style={[styles.offlineTag, { color: colors.orange }]}>
                            offline
                          </AppText>
                        )}
                        {group.hostInfo && (
                          <AppText variant="mono" tone="muted" style={styles.hostStats}>
                            {group.hostInfo.cpu.usage ?? '-'}% · {group.hostInfo.memory.usedPercent ?? '-'}%
                          </AppText>
                        )}
                        <Pressable
                          onPress={() => setReorderingHostId(reorderingHostId === group.host.id ? null : group.host.id)}
                          style={({ pressed }) => [
                            styles.reorderToggle,
                            pressed && styles.reorderTogglePressed,
                            reorderingHostId === group.host.id && styles.reorderToggleActive,
                          ]}
                          hitSlop={8}
                        >
                          <GripVertical size={12} color={reorderingHostId === group.host.id ? colors.accentText : colors.textMuted} />
                        </Pressable>
                      </View>
                      {/* Sessions */}
                      {group.sessions.map((session, sessionIndex) => (
                        <SessionRow
                          key={session.name}
                          session={session}
                          index={sessionIndex}
                          totalSessions={group.sessions.length}
                          isLast={sessionIndex === group.sessions.length - 1}
                          isReordering={reorderingHostId === group.host.id}
                          onMoveUp={() => handleMoveSession(group.host.id, sessionIndex, sessionIndex - 1)}
                          onMoveDown={() => handleMoveSession(group.host.id, sessionIndex, sessionIndex + 1)}
                          onPress={() =>
                            router.push(
                              `/session/${group.host.id}/${encodeURIComponent(session.name)}/terminal`
                            )
                          }
                          onKill={() => handleKillSession(group.host, session.name)}
                          onRename={() => handleRenameStart(group.host, session.name)}
                          colors={colors}
                          styles={styles}
                        />
                      ))}
                    </View>
                  </FadeIn>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* FAB for launching sessions */}
        {hosts.length > 0 && (
          <View style={styles.fabContainer}>
            <FAB onPress={openLaunchSheet} icon="rocket" size="medium" />
          </View>
        )}
      </Screen>
    </>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => {
  return StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    right: 16,
    bottom: 90,
  },
  scrollContent: {
    paddingBottom: 32,
    gap: 12,
  },
  // Empty states
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyIconContainer: {
    marginBottom: 16,
  },
  emptyIconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.barBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginBottom: 6,
  },
  emptyBody: {
    textAlign: 'center',
    marginBottom: 16,
    maxWidth: 260,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: theme.radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: colors.accentText,
  },
  emptySmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  // Session list - flat design
  sessionsList: {
    overflow: 'hidden',
  },
  hostDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
  },
  hostDividerBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hostAccent: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
  },
  hostName: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
  },
  offlineTag: {
    fontSize: 9,
    fontWeight: '500',
  },
  hostStats: {
    fontSize: 10,
  },
  sessionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
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
    gap: 10,
  },
  stateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
  },
  stateDotRunning: {
    backgroundColor: colors.green,
    shadowColor: colors.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
  },
  stateDotIdle: {
    backgroundColor: colors.orange,
  },
  sessionTextContent: {
    flex: 1,
    gap: 1,
  },
  sessionName: {
    fontSize: 14,
  },
  sessionMeta: {
    fontSize: 10,
  },
  gitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.cardPressed,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gitPillText: {
    fontSize: 9,
  },
  reorderButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: colors.cardPressed,
  },
  reorderButtonDisabled: {
    opacity: 0.3,
  },
  reorderButtonPressed: {
    backgroundColor: colors.separator,
  },
  reorderToggle: {
    padding: 4,
    borderRadius: 4,
  },
  reorderTogglePressed: {
    backgroundColor: colors.cardPressed,
  },
  reorderToggleActive: {
    backgroundColor: colors.accent,
  },
  // CI Status styles
  ciSection: {
    paddingVertical: 4,
  },
  ciHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  ciHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ciHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ciTitle: {
    fontWeight: '600',
    fontSize: 11,
  },
  ciSummaryDots: {
    flexDirection: 'row',
    gap: 3,
  },
  ciStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  ciContent: {
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  ciBranches: {
    gap: 3,
  },
  ciBranch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 1,
  },
  ciBranchName: {
    fontSize: 10,
    flex: 1,
  },
  ciCommitSha: {
    fontSize: 9,
  },
  ciDiffInfo: {
    fontSize: 9,
  },
  ciEmpty: {
    fontSize: 10,
    textAlign: 'center',
    paddingVertical: 6,
  },
  });
};
