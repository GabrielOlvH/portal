import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppText } from '@/components/AppText';
import { Screen } from '@/components/Screen';
import { ProjectFilesPane } from '@/components/workspace/windows/ProjectFilesWindow';
import { useProjects } from '@/lib/projects-store';
import { useStore } from '@/lib/store';
import { theme } from '@/lib/theme';
import { useTheme, type ThemeColors } from '@/lib/useTheme';

export default function ProjectFilesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const { projects } = useProjects();
  const { hosts } = useStore();

  const project = useMemo(() => (
    projectId ? projects.find((item) => item.id === projectId) ?? null : null
  ), [projectId, projects]);

  const host = useMemo(() => (
    project ? hosts.find((item) => item.id === project.hostId) ?? null : null
  ), [hosts, project]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!project || !host) {
    return (
      <Screen>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ChevronLeft size={20} color={colors.text} />
            <AppText variant="label" style={styles.backText}>Back</AppText>
          </View>
          </Pressable>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.empty}>
          <AppText variant="subtitle">Project not found</AppText>
          <AppText variant="body" tone="muted" style={styles.emptyBody}>
            Open this screen from the Projects list.
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen variant="default">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ChevronLeft size={20} color={colors.text} />
            <AppText variant="label" style={styles.backText}>Back</AppText>
          </View>
        </Pressable>
        <AppText variant="subtitle" numberOfLines={1} style={styles.headerTitle}>
          {project.name}
        </AppText>
        <View style={styles.headerSpacer} />
      </View>
      <ProjectFilesPane
        host={host}
        projectName={project.name}
        projectPath={project.path}
        isActive
      />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: theme.spacing.md,
  },
  backText: {
    color: colors.text,
    marginLeft: 2,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 60,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  emptyBody: {
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
});
