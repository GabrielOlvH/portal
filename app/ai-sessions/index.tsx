import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  LayoutAnimation,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { Card } from '@/components/Card';
import { SearchBar } from '@/components/SearchBar';
import { useStore } from '@/lib/store';
import { getAiSessions, resumeAiSession } from '@/lib/api';
import { AiProvider, AiSession } from '@/lib/types';
import { theme } from '@/lib/theme';
import { hostColors } from '@/lib/colors';
import { ThemeColors, useTheme } from '@/lib/useTheme';

const PROVIDER_COLORS: Record<AiProvider, string> = {
  claude: '#D97706',
  codex: '#059669',
  opencode: '#7C3AED',
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function getProjectName(directory: string): string {
  const parts = directory.split('/');
  return parts[parts.length - 1] || directory;
}

function getFileColor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return '#3178C6';
    case 'js':
    case 'jsx':
      return '#F7DF1E';
    case 'json':
      return '#CB8622';
    case 'css':
    case 'scss':
      return '#264DE4';
    case 'md':
      return '#083FA1';
    case 'py':
      return '#3776AB';
    case 'go':
      return '#00ADD8';
    case 'rs':
      return '#DEA584';
    default:
      return '#6B7280';
  }
}

type SessionCardProps = {
  session: AiSession;
  expanded: boolean;
  onToggle: () => void;
  onResume: () => void;
  isResuming: boolean;
  colors: ThemeColors;
};

function SessionCard({ session, expanded, onToggle, onResume, isResuming, colors }: SessionCardProps) {
  const styles = useMemo(() => createCardStyles(colors), [colors]);
  const providerColor = PROVIDER_COLORS[session.provider];

  const handleToggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  }, [onToggle]);

  const title = session.summary || getProjectName(session.directory);
  const shortDir = session.directory.split('/').slice(-2).join('/');

  return (
    <Card style={styles.card}>
      <Pressable onPress={handleToggle}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.providerBadge, { backgroundColor: providerColor }]}>
            <AppText variant="caps" style={styles.providerText}>
              {session.provider.charAt(0).toUpperCase()}
            </AppText>
          </View>
          <View style={styles.headerContent}>
            <AppText variant="subtitle" numberOfLines={1}>{title}</AppText>
            <View style={styles.meta}>
              <AppText variant="mono" tone="muted" style={styles.metaText}>
                {shortDir}
              </AppText>
              {session.gitBranch && (
                <>
                  <AppText variant="mono" tone="muted" style={styles.metaDot}>•</AppText>
                  <AppText variant="mono" tone="muted" style={styles.metaText}>
                    {session.gitBranch}
                  </AppText>
                </>
              )}
              <AppText variant="mono" tone="muted" style={styles.metaDot}>•</AppText>
              <AppText variant="mono" tone="muted" style={styles.metaText}>
                {formatRelativeTime(session.updatedAt)}
              </AppText>
            </View>
          </View>
          <AppText variant="label" tone="muted" style={styles.chevron}>
            {expanded ? '▼' : '▶'}
          </AppText>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <AppText variant="mono" tone="muted" style={styles.statLabel}>msgs</AppText>
            <AppText variant="label">{session.messageCount}</AppText>
          </View>
          <View style={styles.stat}>
            <AppText variant="mono" tone="muted" style={styles.statLabel}>files</AppText>
            <AppText variant="label">{session.modifiedFiles.length}</AppText>
          </View>
          {session.tokenUsage && (
            <View style={styles.stat}>
              <AppText variant="mono" tone="muted" style={styles.statLabel}>tokens</AppText>
              <AppText variant="label">
                {Math.round((session.tokenUsage.input + session.tokenUsage.output) / 1000)}k
              </AppText>
            </View>
          )}
        </View>
      </Pressable>

      {/* Expanded Content */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* Modified Files */}
          {session.modifiedFiles.length > 0 && (
            <View style={styles.section}>
              <AppText variant="caps" tone="muted" style={styles.sectionTitle}>
                Modified Files
              </AppText>
              <View style={styles.filesList}>
                {session.modifiedFiles.map((file, idx) => {
                  const filename = file.split('/').pop() || file;
                  const fileColor = getFileColor(filename);
                  return (
                    <View key={idx} style={styles.fileRow}>
                      <View style={[styles.fileDot, { backgroundColor: fileColor }]} />
                      <AppText variant="mono" numberOfLines={1} style={styles.filePath}>
                        {file}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Tools Used */}
          {session.toolsUsed && session.toolsUsed.length > 0 && (
            <View style={styles.section}>
              <AppText variant="caps" tone="muted" style={styles.sectionTitle}>
                Tools Used
              </AppText>
              <View style={styles.toolsRow}>
                {session.toolsUsed.slice(0, 10).map((tool, idx) => (
                  <View key={idx} style={styles.toolBadge}>
                    <AppText variant="mono" style={styles.toolText}>{tool}</AppText>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Resume Button */}
          <Pressable
            style={[styles.resumeButton, isResuming && styles.resumeButtonDisabled]}
            onPress={onResume}
            disabled={isResuming}
          >
            <AppText variant="subtitle" style={styles.resumeButtonText}>
              {isResuming ? 'Resuming...' : 'Resume Session'}
            </AppText>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

const createCardStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  providerBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  headerContent: {
    flex: 1,
    gap: 2,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 11,
  },
  metaDot: {
    marginHorizontal: 4,
    fontSize: 11,
  },
  chevron: {
    fontSize: 10,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.lg,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
  },
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  section: {
    gap: theme.spacing.xs,
  },
  sectionTitle: {
    fontSize: 10,
    marginBottom: 4,
  },
  filesList: {
    gap: 6,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fileDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filePath: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
  },
  toolsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  toolBadge: {
    backgroundColor: colors.cardPressed,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  toolText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  resumeButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  resumeButtonDisabled: {
    opacity: 0.6,
  },
  resumeButtonText: {
    color: colors.accentText,
  },
});

export default function AiSessionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ directory?: string }>();
  const { colors } = useTheme();
  const { hosts, ready } = useStore();

  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState<string | null>(null);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);

  useEffect(() => {
    setDirectoryFilter(params.directory || null);
  }, [params.directory]);

  const currentHost = useMemo(() => {
    if (selectedHostId) {
      return hosts.find((h) => h.id === selectedHostId) || null;
    }
    return hosts.length > 0 ? hosts[0] : null;
  }, [hosts, selectedHostId]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['ai-sessions', currentHost?.id, directoryFilter],
    queryFn: async () => {
      if (!currentHost) return { sessions: [], total: 0, hasMore: false };
      return getAiSessions(currentHost, {
        directory: directoryFilter || undefined,
        maxAgeDays: 30,
      });
    },
    enabled: ready && !!currentHost,
    staleTime: 10_000,
  });

  const sessions = data?.sessions || [];

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) =>
      s.summary.toLowerCase().includes(q) ||
      s.directory.toLowerCase().includes(q) ||
      s.modifiedFiles.some(f => f.toLowerCase().includes(q)) ||
      s.provider.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  const toggleSession = useCallback((id: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleResume = useCallback(async (session: AiSession) => {
    if (!currentHost || resumingSessionId) return;

    setResumingSessionId(session.id);
    try {
      await resumeAiSession(currentHost, session.provider, session.id);
      const sessionName = `${session.provider}-${session.id.slice(0, 8)}`;
      router.push(`/session/${currentHost.id}/${encodeURIComponent(sessionName)}/terminal`);
    } catch (err) {
      Alert.alert('Error', 'Failed to resume session');
    } finally {
      setResumingSessionId(null);
    }
  }, [currentHost, resumingSessionId, router]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">AI Sessions</AppText>
        {filteredSessions.length > 0 && (
          <View style={styles.countBadge}>
            <AppText variant="caps" style={styles.countText}>{filteredSessions.length}</AppText>
          </View>
        )}
      </View>

      {/* Host Selector */}
      {hosts.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hostRow}
        >
          {hosts.map((host, idx) => (
            <Pressable
              key={host.id}
              style={[
                styles.hostChip,
                (currentHost?.id === host.id) && styles.hostChipActive,
              ]}
              onPress={() => setSelectedHostId(host.id)}
            >
              <View style={[styles.hostDot, { backgroundColor: host.color || hostColors[idx % hostColors.length] }]} />
              <AppText variant="label" style={(currentHost?.id === host.id) ? styles.hostChipTextActive : undefined}>
                {host.name}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search sessions, files..."
      />

      {/* Directory Filter Indicator */}
      {directoryFilter && (
        <View style={styles.filterBar}>
          <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.filterPath}>
            Filtered: .../{directoryFilter.split('/').slice(-2).join('/')}
          </AppText>
          <Pressable onPress={() => setDirectoryFilter(null)}>
            <AppText variant="label" style={styles.clearFilter}>✕</AppText>
          </Pressable>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
        }
      >
        {filteredSessions.length === 0 ? (
          <FadeIn style={styles.empty}>
            <AppText variant="subtitle">No sessions found</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyBody}>
              {directoryFilter ? 'No AI sessions in this directory' : 'Start a coding session to see it here'}
            </AppText>
          </FadeIn>
        ) : (
          filteredSessions.map((session, idx) => (
            <FadeIn key={session.id} delay={idx * 30}>
              <SessionCard
                session={session}
                expanded={expandedSessions.has(session.id)}
                onToggle={() => toggleSession(session.id)}
                onResume={() => handleResume(session)}
                isResuming={resumingSessionId === session.id}
                colors={colors}
              />
            </FadeIn>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  countBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    color: colors.accentText,
    fontSize: 11,
  },
  hostRow: {
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  hostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    backgroundColor: colors.card,
  },
  hostChipActive: {
    backgroundColor: colors.accent,
  },
  hostChipTextActive: {
    color: colors.accentText,
  },
  hostDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardPressed,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    marginBottom: theme.spacing.sm,
  },
  filterPath: {
    flex: 1,
    fontSize: 12,
  },
  clearFilter: {
    color: colors.textSecondary,
    paddingLeft: theme.spacing.sm,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  empty: {
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyBody: {
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
});
