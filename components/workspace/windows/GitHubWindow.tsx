import React, { useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  View,
  ScrollView,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { useWindowActions } from '@/lib/useWindowActions';
import { useStore } from '@/lib/store';
import { useProjects } from '@/lib/projects-store';
import { useGitHubConfig, useRefreshGitHubStatus } from '@/lib/queries/github';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { withAlpha } from '@/lib/colors';
import { Check, Github, Terminal, AlertCircle, PlayCircle, FolderDot } from 'lucide-react-native';

export function GitHubWindow() {
  const { colors } = useTheme();
  const { params } = useWindowActions();
  const { preferences, updateGitHubSettings, hosts } = useStore();
  const { projects } = useProjects();
  const [testLoading, setTestLoading] = useState(false);

  const targetHost = params.hostId ? hosts.find(h => h.id === params.hostId) ?? null : hosts[0] ?? null;
  const { data: config, isLoading: configLoading } = useGitHubConfig(targetHost);
  const refreshStatus = useRefreshGitHubStatus();

  const handleToggle = useCallback(
    (value: boolean) => {
      updateGitHubSettings({ enabled: value });
    },
    [updateGitHubSettings]
  );

  const handleTest = useCallback(async () => {
    if (!targetHost || projects.length === 0) {
      Alert.alert('No projects', 'Add projects first to test GitHub CI status.');
      return;
    }

    setTestLoading(true);
    try {
      const result = await refreshStatus.mutateAsync({
        hosts,
        projects,
      });

      if (result.length === 0) {
        Alert.alert(
          'No Status Found',
          config?.authenticated
            ? 'No CI status found for your projects. Make sure you have active CI workflows.'
            : 'GitHub CLI is not authenticated. Run "gh auth login" on your host.'
        );
      } else {
        Alert.alert(
          'Success',
          `Found CI status for ${result.length} branch(es) across your projects.`
        );
      }
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Failed to fetch CI status'
      );
    } finally {
      setTestLoading(false);
    }
  }, [targetHost, projects, hosts, config?.authenticated, refreshStatus]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <AppText variant="title">GitHub CI</AppText>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <GlassCard style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Github size={28} color={colors.accent} />
            </View>
            <View style={styles.headerText}>
              <AppText variant="subtitle" style={{ fontWeight: '600' }}>CI Monitoring</AppText>
              <AppText variant="label" tone="muted">
                Track workflow statuses
              </AppText>
            </View>
            <Switch
              value={preferences.github.enabled}
              onValueChange={handleToggle}
              trackColor={{ false: withAlpha(colors.text, 0.1), true: colors.accent }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={withAlpha(colors.text, 0.1)}
              style={styles.switch}
            />
          </View>
        </GlassCard>

        <AppText variant="subtitle" style={styles.sectionTitle}>Authentication</AppText>
        <GlassCard style={styles.card}>
          <View style={styles.authRow}>
            <View style={styles.authIcon}>
              {configLoading ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : config?.authenticated ? (
                <Check size={20} color={colors.green} />
              ) : (
                <AlertCircle size={20} color={colors.orange} />
              )}
            </View>
            <View style={styles.authText}>
              <AppText variant="body" style={{ fontWeight: '600' }}>
                {configLoading
                  ? 'Checking...'
                  : config?.authenticated
                  ? 'Authenticated'
                  : 'Not Authenticated'}
              </AppText>
              <AppText variant="label" tone="muted">
                {config?.authenticated
                  ? 'GitHub CLI is ready'
                  : 'Requires setup on host'}
              </AppText>
            </View>
          </View>

          {!config?.authenticated && !configLoading && (
            <View style={styles.instructions}>
              <View style={styles.instructionStep}>
                <View style={styles.instructionDot} />
                <AppText variant="label" style={styles.instructionText}>
                  SSH into your host
                </AppText>
              </View>
              <View style={styles.instructionStep}>
                <View style={styles.instructionDot} />
                <View style={styles.codeSnippet}>
                  <Terminal size={14} color={colors.textMuted} />
                  <AppText variant="mono" style={{ fontSize: 13, color: colors.text }}>gh auth login</AppText>
                </View>
              </View>
              <View style={styles.instructionStep}>
                <View style={styles.instructionDot} />
                <AppText variant="label" style={styles.instructionText}>
                  Follow the prompts to complete setup
                </AppText>
              </View>
            </View>
          )}
        </GlassCard>

        <AppText variant="subtitle" style={styles.sectionTitle}>Diagnostics</AppText>
        <GlassCard style={styles.card}>
          <Pressable
            onPress={handleTest}
            disabled={testLoading || !targetHost || projects.length === 0}
            style={[
              styles.testButton,
              (!targetHost || projects.length === 0) && styles.testButtonDisabled,
            ]}
          >
            {testLoading ? (
              <ActivityIndicator size="small" color={colors.accentText} />
            ) : (
              <>
                <PlayCircle size={20} color={(!targetHost || projects.length === 0) ? colors.textMuted : colors.accentText} />
                <AppText variant="subtitle" style={[styles.testButtonText, (!targetHost || projects.length === 0) && { color: colors.textMuted }]}>
                  Test CI Connection
                </AppText>
              </>
            )}
          </Pressable>
          {projects.length === 0 && (
            <View style={styles.hintBox}>
              <AppText variant="label" tone="muted" style={styles.hint}>
                Add projects first to test CI status
              </AppText>
            </View>
          )}
        </GlassCard>

        <View style={styles.projectsHeader}>
          <AppText variant="subtitle" style={styles.sectionTitleNoMargin}>Monitored Projects</AppText>
          <View style={styles.badge}>
            <AppText variant="caps" tone="base">{projects.length}</AppText>
          </View>
        </View>
        <GlassCard style={styles.projectsCard}>
          {projects.length === 0 ? (
            <View style={styles.emptyProjects}>
              <FolderDot size={32} color={colors.textMuted} />
              <AppText variant="label" tone="muted" style={{ marginTop: 8 }}>No projects configured</AppText>
            </View>
          ) : (
            <View style={styles.projectList}>
              {projects.map((project, idx) => (
                <View key={project.id} style={[styles.projectItem, idx < projects.length - 1 && styles.projectItemBorder]}>
                  <FolderDot size={18} color={colors.accent} />
                  <View style={styles.projectItemText}>
                    <AppText variant="body" numberOfLines={1} style={{ fontWeight: '500' }}>
                      {project.name}
                    </AppText>
                    <AppText variant="mono" tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
                      {project.path}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          )}
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: theme.spacing.md,
    },
    pageHeader: {
      marginBottom: 20,
      marginTop: 8,
    },
    scrollContent: {
      paddingBottom: 60,
    },
    card: {
      padding: 16,
      marginBottom: 24,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    iconContainer: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: withAlpha(colors.accent, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
      gap: 4,
    },
    switch: {
      marginLeft: 8,
      transform: [{ scale: 0.9 }],
    },
    sectionTitle: {
      marginBottom: 12,
      fontSize: 18,
      fontWeight: '600',
    },
    sectionTitleNoMargin: {
      fontSize: 18,
      fontWeight: '600',
    },
    authRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    authIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: withAlpha(colors.text, 0.05),
      alignItems: 'center',
      justifyContent: 'center',
    },
    authText: {
      flex: 1,
      gap: 4,
    },
    instructions: {
      marginTop: 20,
      paddingTop: 20,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: withAlpha(colors.text, 0.1),
      gap: 12,
    },
    instructionStep: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    instructionDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    instructionText: {
      color: colors.textSecondary,
    },
    codeSnippet: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: withAlpha(colors.text, 0.05),
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },
    testButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      padding: 16,
      backgroundColor: colors.accent,
      borderRadius: 16,
    },
    testButtonDisabled: {
      backgroundColor: withAlpha(colors.text, 0.05),
    },
    testButtonText: {
      color: colors.accentText,
      fontWeight: '600',
    },
    hintBox: {
      marginTop: 16,
      alignItems: 'center',
    },
    hint: {
      textAlign: 'center',
    },
    projectsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    badge: {
      backgroundColor: withAlpha(colors.text, 0.05),
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    projectsCard: {
      padding: 0,
      overflow: 'hidden',
    },
    emptyProjects: {
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    projectList: {
      paddingVertical: 8,
    },
    projectItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
    projectItemBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: withAlpha(colors.text, 0.1),
    },
    projectItemText: {
      flex: 1,
      gap: 4,
    },
  });
