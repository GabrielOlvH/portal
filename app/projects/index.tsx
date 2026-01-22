import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { Card } from '@/components/Card';
import { useStore } from '@/lib/store';
import { useProjects } from '@/lib/projects-store';
import { getAiSessions } from '@/lib/api';
import { theme } from '@/lib/theme';
import { hostColors } from '@/lib/colors';
import { ThemeColors, useTheme } from '@/lib/useTheme';

export default function ProjectsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hosts, ready } = useStore();
  const { projects } = useProjects();

  const projectsByHost = useMemo(() => {
    const grouped = new Map<string, typeof projects>();
    projects.forEach((project) => {
      const existing = grouped.get(project.hostId) || [];
      grouped.set(project.hostId, [...existing, project]);
    });
    return grouped;
  }, [projects]);

  // Fetch AI sessions for all hosts to show counts on project cards
  const aiSessionQueries = useQuery({
    queryKey: ['ai-sessions-all-hosts', hosts.map(h => h.id).join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        hosts.map(async (host) => {
          try {
            const data = await getAiSessions(host, { limit: 100, maxAgeDays: 30 });
            return { hostId: host.id, sessions: data.sessions };
          } catch {
            return { hostId: host.id, sessions: [] };
          }
        })
      );
      return results;
    },
    enabled: ready && hosts.length > 0,
    staleTime: 30_000,
  });

  // Calculate session counts per project
  const sessionCountsByProject = useMemo(() => {
    const counts = new Map<string, number>();
    if (!aiSessionQueries.data) return counts;

    for (const { hostId, sessions } of aiSessionQueries.data) {
      const hostProjects = projectsByHost.get(hostId) || [];
      for (const project of hostProjects) {
        const count = sessions.filter((session) =>
          session.directory.startsWith(project.path) ||
          project.path.startsWith(session.directory)
        ).length;
        if (count > 0) {
          counts.set(project.id, count);
        }
      }
    }
    return counts;
  }, [aiSessionQueries.data, projectsByHost]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">Projects</AppText>
        <Pressable style={styles.addButton} onPress={() => router.push('/projects/new')}>
          <AppText variant="subtitle" style={styles.addButtonText}>
            +
          </AppText>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {projects.length === 0 ? (
          <FadeIn style={styles.empty}>
            <View style={styles.emptyIcon}>
              <AppText variant="title" style={styles.emptyIconText}>
                { }
              </AppText>
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
          </FadeIn>
        ) : (
          hosts.map((host, hostIdx) => {
            const hostProjects = projectsByHost.get(host.id);
            if (!hostProjects || hostProjects.length === 0) return null;

            return (
              <FadeIn key={host.id} delay={hostIdx * 50}>
                <View style={styles.hostGroup}>
                  <View style={styles.hostHeader}>
                    <View
                      style={[
                        styles.hostDot,
                        { backgroundColor: host.color || hostColors[hostIdx % hostColors.length] },
                      ]}
                    />
                    <AppText variant="caps" style={styles.hostName}>
                      {host.name}
                    </AppText>
                    <View style={styles.hostBadge}>
                      <AppText variant="caps" tone="muted" style={styles.hostCount}>
                        {hostProjects.length}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.projectsList}>
                    {hostProjects.map((project) => {
                      const sessionCount = sessionCountsByProject.get(project.id) || 0;
                      return (
                        <Card key={project.id} style={styles.projectCard}>
                          <View style={styles.projectRow}>
                            <View style={styles.projectInfo}>
                              <AppText variant="subtitle">{project.name}</AppText>
                              <AppText variant="mono" tone="muted" numberOfLines={1}>
                                {project.path}
                              </AppText>
                            </View>
                            {sessionCount > 0 && (
                              <Pressable
                                style={styles.sessionBadge}
                                onPress={() => router.push(`/ai-sessions?directory=${encodeURIComponent(project.path)}`)}
                              >
                                <AppText variant="caps" style={styles.sessionBadgeText}>
                                  {sessionCount} AI
                                </AppText>
                              </Pressable>
                            )}
                          </View>
                        </Card>
                      );
                    })}
                  </View>
                </View>
              </FadeIn>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: colors.accentText,
    fontSize: 20,
    marginTop: -2,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.lg,
  },
  empty: {
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadow.card,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.cardPressed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  emptyIconText: {
    color: colors.textSecondary,
  },
  emptyBody: {
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  ctaText: {
    color: colors.accentText,
  },
  hostGroup: {
    gap: theme.spacing.sm,
  },
  hostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  hostDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
  projectsList: {
    gap: theme.spacing.sm,
  },
  projectCard: {
    padding: theme.spacing.md,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  projectInfo: {
    flex: 1,
    gap: 4,
  },
  sessionBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
  },
  sessionBadgeText: {
    color: colors.accentText,
    fontSize: 10,
  },
});
