import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Play, Clock, Folder, Plus } from 'lucide-react-native';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { Card } from '@/components/Card';
import { SkeletonList } from '@/components/Skeleton';
import { useStore } from '@/lib/store';
import { useProjects } from '@/lib/projects-store';
import { useLaunchSheet } from '@/lib/launch-sheet';
import { theme } from '@/lib/theme';
import { hostColors, systemColors } from '@/lib/colors';
import { ThemeColors, useTheme } from '@/lib/useTheme';

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ProjectsTabScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hosts, ready } = useStore();
  const { projects, recentLaunches } = useProjects();
  const { open: openLaunchSheet } = useLaunchSheet();
  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const projectsByHost = useMemo(() => {
    const grouped = new Map<string, typeof projects>();
    projects.forEach((project) => {
      const existing = grouped.get(project.hostId) || [];
      grouped.set(project.hostId, [...existing, project]);
    });
    return grouped;
  }, [projects]);

  const recentLaunchesToShow = useMemo(() => {
    return recentLaunches.slice(0, 5);
  }, [recentLaunches]);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    setTimeout(() => setIsManualRefresh(false), 600);
  }, []);

  const handleRelaunch = useCallback(
    (_launch: (typeof recentLaunches)[0]) => {
      openLaunchSheet();
    },
    [openLaunchSheet]
  );

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!ready) {
    return (
      <Screen>
        <FadeIn delay={100}>
          <SkeletonList type="session" count={4} />
        </FadeIn>
      </Screen>
    );
  }

  const hasContent = recentLaunchesToShow.length > 0 || projects.length > 0;

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">Projects</AppText>
        <Pressable style={styles.launchButton} onPress={openLaunchSheet}>
          <Plus size={18} color={colors.accentText} />
          <AppText variant="label" style={styles.launchButtonText}>
            Launch
          </AppText>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefresh}
            onRefresh={handleRefresh}
            tintColor={systemColors.blue as string}
          />
        }
      >
        {!hasContent ? (
          <FadeIn delay={100}>
            <Card style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Folder size={32} color={colors.textSecondary} />
              </View>
              <AppText variant="subtitle">No projects yet</AppText>
              <AppText variant="body" tone="muted" style={styles.emptyBody}>
                Add a project to quickly launch commands and agents.
              </AppText>
              <Pressable style={styles.cta} onPress={() => router.push('/projects/new')}>
                <AppText variant="subtitle" style={styles.ctaText}>
                  Add Project
                </AppText>
              </Pressable>
            </Card>
          </FadeIn>
        ) : (
          <>
            {recentLaunchesToShow.length > 0 && (
              <FadeIn delay={100}>
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Clock size={14} color={colors.textMuted} />
                    <AppText variant="caps" style={styles.sectionTitle}>
                      Recent Launches
                    </AppText>
                  </View>
                  <Card style={styles.listCard}>
                    {recentLaunchesToShow.map((launch, index) => {
                      const isLast = index === recentLaunchesToShow.length - 1;
                      const host = hosts.find((h) => h.id === launch.hostId);
                      const hostColor = host?.color || hostColors[index % hostColors.length];

                      return (
                        <Pressable
                          key={launch.id}
                          style={[styles.listRow, !isLast && styles.listRowBorder]}
                          onPress={() => handleRelaunch(launch)}
                        >
                          <View style={[styles.hostDot, { backgroundColor: hostColor }]} />
                          <View style={styles.listRowInfo}>
                            <AppText variant="body" numberOfLines={1}>
                              {launch.projectName}
                            </AppText>
                            <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.commandPreview}>
                              {launch.command.command}
                            </AppText>
                          </View>
                          <AppText variant="caps" tone="muted" style={styles.timestamp}>
                            {formatTimeAgo(launch.timestamp)}
                          </AppText>
                          <Play size={14} color={colors.accent} />
                        </Pressable>
                      );
                    })}
                  </Card>
                </View>
              </FadeIn>
            )}

            {projects.length > 0 && (
              <FadeIn delay={150}>
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Folder size={14} color={colors.textMuted} />
                    <AppText variant="caps" style={styles.sectionTitle}>
                      All Projects
                    </AppText>
                    <Pressable style={styles.addProjectButton} onPress={() => router.push('/projects/new')}>
                      <Plus size={14} color={colors.accent} />
                    </Pressable>
                  </View>
                  {hosts.map((host, hostIdx) => {
                    const hostProjects = projectsByHost.get(host.id);
                    if (!hostProjects || hostProjects.length === 0) return null;

                    const hostColor = host.color || hostColors[hostIdx % hostColors.length];

                    return (
                      <View key={host.id} style={styles.hostGroup}>
                        <View style={styles.hostHeader}>
                          <View style={[styles.hostDot, { backgroundColor: hostColor }]} />
                          <AppText variant="caps" style={styles.hostName}>
                            {host.name}
                          </AppText>
                          <View style={styles.hostBadge}>
                            <AppText variant="caps" tone="muted" style={styles.hostCount}>
                              {hostProjects.length}
                            </AppText>
                          </View>
                        </View>
                        <Card style={styles.listCard}>
                          {hostProjects.map((project, index) => {
                            const isLast = index === hostProjects.length - 1;

                            return (
                              <Pressable
                                key={project.id}
                                style={[styles.projectRow, !isLast && styles.listRowBorder]}
                                onPress={() => openLaunchSheet()}
                              >
                                <View style={styles.projectInfo}>
                                  <AppText variant="body" numberOfLines={1}>
                                    {project.name}
                                  </AppText>
                                  <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.projectPath}>
                                    {project.path}
                                  </AppText>
                                </View>
                                <Pressable
                                  style={styles.quickLaunchButton}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    openLaunchSheet();
                                  }}
                                  hitSlop={8}
                                >
                                  <Play size={14} color={colors.accent} />
                                </Pressable>
                              </Pressable>
                            );
                          })}
                        </Card>
                      </View>
                    );
                  })}
                </View>
              </FadeIn>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.lg,
    },
    emptyCard: {
      padding: theme.spacing.xl,
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.cardPressed,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.sm,
    },
    emptyBody: {
      textAlign: 'center',
      maxWidth: 260,
    },
    cta: {
      backgroundColor: colors.accent,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      paddingHorizontal: 24,
      marginTop: theme.spacing.sm,
    },
    ctaText: {
      color: colors.accentText,
    },
    section: {
      gap: theme.spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 4,
    },
    sectionTitle: {
      flex: 1,
      color: colors.textMuted,
      fontWeight: '600',
    },
    countBadge: {
      backgroundColor: colors.cardPressed,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    countText: {
      fontSize: 10,
      color: colors.textMuted,
    },
    addProjectButton: {
      padding: 4,
    },
    listCard: {
      padding: 0,
      overflow: 'hidden',
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: theme.spacing.md,
    },
    listRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    listRowInfo: {
      flex: 1,
      gap: 2,
    },
    commandPreview: {
      fontSize: 11,
    },
    timestamp: {
      fontSize: 10,
      marginRight: 4,
    },
    hostDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    hostDotSmall: {
      width: 6,
      height: 6,
      borderRadius: 3,
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
    sessionMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    hostGroup: {
      gap: theme.spacing.xs,
    },
    hostHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 4,
      marginTop: theme.spacing.sm,
    },
    hostName: {
      color: colors.text,
      fontWeight: '600',
    },
    hostBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: colors.cardPressed,
    },
    hostCount: {
      fontSize: 10,
    },
    projectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: theme.spacing.md,
    },
    projectInfo: {
      flex: 1,
      gap: 4,
    },
    projectPath: {
      fontSize: 11,
    },
    quickLaunchButton: {
      padding: 8,
      backgroundColor: colors.cardPressed,
      borderRadius: theme.radii.sm,
    },
  });
