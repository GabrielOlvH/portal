import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { Card } from '@/components/Card';
import { useStore } from '@/lib/store';
import { useProjects } from '@/lib/projects-store';
import { theme } from '@/lib/theme';
import { hostColors } from '@/lib/colors';
import { ThemeColors, useTheme } from '@/lib/useTheme';

export default function ProjectsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hosts } = useStore();
  const { projects } = useProjects();

  const projectsByHost = useMemo(() => {
    const grouped = new Map<string, typeof projects>();
    projects.forEach((project) => {
      const existing = grouped.get(project.hostId) || [];
      grouped.set(project.hostId, [...existing, project]);
    });
    return grouped;
  }, [projects]);

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
                    {hostProjects.map((project) => (
                      <Card key={project.id} style={styles.projectCard}>
                        <View style={styles.projectInfo}>
                          <AppText variant="subtitle">{project.name}</AppText>
                          <AppText variant="mono" tone="muted" numberOfLines={1}>
                            {project.path}
                          </AppText>
                        </View>
                      </Card>
                    ))}
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
  projectInfo: {
    gap: 4,
  },
});
