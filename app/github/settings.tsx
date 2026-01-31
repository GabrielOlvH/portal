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
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { useStore } from '@/lib/store';
import { useProjects } from '@/lib/projects-store';
import { useGitHubConfig, useRefreshGitHubStatus } from '@/lib/queries/github';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { Check, Github, Terminal, AlertCircle } from 'lucide-react-native';

export default function GitHubSettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences, updateGitHubSettings, hosts } = useStore();
  const { projects } = useProjects();
  const [testLoading, setTestLoading] = useState(false);

  const firstHost = hosts[0];
  const { data: config, isLoading: configLoading } = useGitHubConfig(firstHost);
  const refreshStatus = useRefreshGitHubStatus();

  const handleToggle = useCallback(
    (value: boolean) => {
      updateGitHubSettings({ enabled: value });
    },
    [updateGitHubSettings]
  );

  const handleTest = useCallback(async () => {
    if (!firstHost || projects.length === 0) {
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
  }, [firstHost, projects, hosts, config?.authenticated, refreshStatus]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Card style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Github size={24} color={colors.accent} />
            </View>
            <View style={styles.headerText}>
              <AppText variant="subtitle">GitHub CI Status</AppText>
              <AppText variant="label" tone="muted">
                Monitor CI status for your projects
              </AppText>
            </View>
          </View>

          <View style={styles.separator} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <AppText variant="body">Enable CI Status</AppText>
              <AppText variant="label" tone="muted">
                Show CI status on the home screen
              </AppText>
            </View>
            <Switch
              value={preferences.github.enabled}
              onValueChange={handleToggle}
              trackColor={{ false: colors.separator, true: colors.accent }}
              thumbColor={colors.card}
              ios_backgroundColor={colors.separator}
            />
          </View>
        </Card>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <AppText variant="subtitle">Authentication</AppText>
            <AppText variant="label" tone="muted">
              GitHub CLI must be authenticated on your host
            </AppText>
          </View>

          <View style={styles.separator} />

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
              <AppText variant="body">
                {configLoading
                  ? 'Checking...'
                  : config?.authenticated
                  ? 'Authenticated'
                  : 'Not authenticated'}
              </AppText>
              <AppText variant="label" tone="muted">
                {config?.authenticated
                  ? 'GitHub CLI is ready'
                  : 'Run "gh auth login" on your host'}
              </AppText>
            </View>
          </View>

          {!config?.authenticated && !configLoading && (
            <View style={styles.instructions}>
              <View style={styles.instructionStep}>
                <Terminal size={16} color={colors.textMuted} />
                <AppText variant="label" style={styles.instructionText}>
                  SSH into your host
                </AppText>
              </View>
              <View style={styles.instructionStep}>
                <Terminal size={16} color={colors.textMuted} />
                <AppText variant="label" style={styles.instructionText}>
                  Run: gh auth login
                </AppText>
              </View>
              <View style={styles.instructionStep}>
                <Terminal size={16} color={colors.textMuted} />
                <AppText variant="label" style={styles.instructionText}>
                  Follow the prompts to authenticate
                </AppText>
              </View>
            </View>
          )}
        </Card>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <AppText variant="subtitle">Test Connection</AppText>
            <AppText variant="label" tone="muted">
              Verify CI status is working
            </AppText>
          </View>

          <View style={styles.separator} />

          <Pressable
            onPress={handleTest}
            disabled={testLoading || !firstHost || projects.length === 0}
            style={({ pressed }) => [
              styles.testButton,
              pressed && styles.testButtonPressed,
              (!firstHost || projects.length === 0) && styles.testButtonDisabled,
            ]}
          >
            {testLoading ? (
              <ActivityIndicator size="small" color={colors.accentText} />
            ) : (
              <AppText variant="subtitle" style={styles.testButtonText}>
                Test CI Status
              </AppText>
            )}
          </Pressable>

          {projects.length === 0 && (
            <AppText variant="label" tone="muted" style={styles.hint}>
              Add projects first to test CI status
            </AppText>
          )}
        </Card>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <AppText variant="subtitle">Projects</AppText>
            <AppText variant="label" tone="muted">
              {projects.length === 0
                ? 'No projects configured'
                : `${projects.length} project(s) will be monitored`}
            </AppText>
          </View>

          {projects.length > 0 && (
            <>
              <View style={styles.separator} />
              <View style={styles.projectList}>
                {projects.map((project) => (
                  <View key={project.id} style={styles.projectItem}>
                    <AppText variant="body" numberOfLines={1}>
                      {project.name}
                    </AppText>
                    <AppText variant="mono" tone="muted" numberOfLines={1}>
                      {project.path}
                    </AppText>
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scrollContent: {
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    card: {
      padding: 0,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      padding: theme.spacing.md,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.barBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
      gap: 2,
    },
    separator: {
      height: 1,
      backgroundColor: colors.separator,
      marginHorizontal: theme.spacing.md,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.spacing.md,
    },
    toggleText: {
      flex: 1,
      gap: 2,
    },
    sectionHeader: {
      padding: theme.spacing.md,
      gap: 2,
    },
    authRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      padding: theme.spacing.md,
    },
    authIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.barBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    authText: {
      flex: 1,
      gap: 2,
    },
    instructions: {
      padding: theme.spacing.md,
      paddingTop: 0,
      gap: theme.spacing.sm,
    },
    instructionStep: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    instructionText: {
      color: colors.textSecondary,
    },
    testButton: {
      margin: theme.spacing.md,
      padding: theme.spacing.md,
      backgroundColor: colors.accent,
      borderRadius: theme.radii.md,
      alignItems: 'center',
    },
    testButtonPressed: {
      opacity: 0.8,
    },
    testButtonDisabled: {
      backgroundColor: colors.separator,
    },
    testButtonText: {
      color: colors.accentText,
      fontWeight: '600',
    },
    hint: {
      textAlign: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.md,
    },
    projectList: {
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    projectItem: {
      gap: 2,
    },
  });
