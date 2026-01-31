import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
// import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { providerIcons } from '@/components/icons/ProviderIcons';
import { TerminalIcon } from '@/components/icons/HomeIcons';
import { hostColors } from '@/lib/colors';
import { useStore } from '@/lib/store';
import { useProjects } from '@/lib/projects-store';
import { useSnippets } from '@/lib/snippets-store';
import { createSession, fetchProjectScripts, sendText, getAiSessions } from '@/lib/api';
import { Command, PackageJsonScripts, Host, Project, Snippet, AiSession } from '@/lib/types';
import { theme } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STEP_WIDTH = SCREEN_WIDTH;

type LaunchSheetProps = {
  isOpen: boolean;
  onClose: () => void;
};

const snapPoints = ['60%', '85%'];

// Progress Dots Component
function ProgressDots({
  current,
  total,
  onDotPress,
  colors,
}: {
  current: number;
  total: number;
  onDotPress: (index: number) => void;
  colors: ThemeColors;
}) {
  return (
    <View style={progressStyles.container}>
      {Array.from({ length: total }).map((_, index) => (
        <Pressable
          key={index}
          onPress={() => onDotPress(index)}
          hitSlop={8}
          disabled={index > current}
        >
          <View
            style={[
              progressStyles.dot,
              {
                backgroundColor:
                  index === current
                    ? colors.accent
                    : index < current
                    ? colors.textMuted
                    : colors.separator,
              },
            ]}
          />
        </Pressable>
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

// Host Step Component
function HostStep({
  hosts,
  selectedHostId,
  onSelect,
  colors,
}: {
  hosts: Host[];
  selectedHostId: string | null;
  onSelect: (id: string) => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStepStyles(colors), [colors]);

  return (
    <View style={styles.stepContainer}>
      <AppText variant="body" tone="muted" style={styles.stepInstruction}>
        Choose a host
      </AppText>
      <View style={styles.hostsGrid}>
        {hosts.map((host, idx) => {
          const isSelected = selectedHostId === host.id;
          const hostColor = host.color || hostColors[idx % hostColors.length];
          return (
            <Pressable
              key={host.id}
              style={[
                styles.hostCard,
                isSelected && styles.hostCardSelected,
                { borderLeftColor: hostColor, borderLeftWidth: 4 },
              ]}
              onPress={() => onSelect(host.id)}
            >
              <View style={styles.hostCardContent}>
                <View style={[styles.hostIcon, { backgroundColor: String(hostColor) + '20' }]}>
                  <AppText variant="subtitle" style={{ color: hostColor, fontSize: 18 }}>
                    {host.name.charAt(0).toUpperCase()}
                  </AppText>
                </View>
                <View style={styles.hostInfo}>
                  <AppText
                    variant="label"
                    numberOfLines={1}
                    style={[
                      styles.hostName,
                      isSelected && styles.hostNameSelected,
                    ]}
                  >
                    {host.name}
                  </AppText>
                  <AppText variant="mono" tone="muted" style={styles.hostMeta} numberOfLines={1}>
                    {host.baseUrl}
                  </AppText>
                </View>
              </View>
              {isSelected && (
                <View style={[styles.selectedIndicator, { backgroundColor: colors.accent }]}>
                  <AppText variant="label" style={styles.selectedIndicatorText}>✓</AppText>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Project Step Component
function ProjectStep({
  projects,
  selectedProjectId,
  sessionCounts,
  onSelect,
  onBlankSession,
  colors,
}: {
  projects: Project[];
  selectedProjectId: string | null;
  sessionCounts: Map<string, number>;
  onSelect: (id: string) => void;
  onBlankSession: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStepStyles(colors), [colors]);

  return (
    <View style={styles.stepContainer}>
      <AppText variant="body" tone="muted" style={styles.stepInstruction}>
        Choose a project
      </AppText>
      <View style={styles.projectsGrid}>
        {projects.map((project) => {
          const hasSessions = (sessionCounts.get(project.id) || 0) > 0;
          const isSelected = selectedProjectId === project.id;
          return (
            <Pressable
              key={project.id}
              style={[
                styles.projectCard,
                isSelected && styles.projectCardSelected,
              ]}
              onPress={() => onSelect(project.id)}
            >
              <View style={styles.projectCardContent}>
                <View style={[styles.projectIcon, { backgroundColor: colors.accent + '20' }]}>
                  <AppText variant="subtitle" style={{ color: colors.accent, fontSize: 18 }}>
                    {project.name.charAt(0).toUpperCase()}
                  </AppText>
                </View>
                <View style={styles.projectInfo}>
                  <AppText
                    variant="label"
                    numberOfLines={1}
                    style={[
                      styles.projectName,
                      isSelected && styles.projectNameSelected,
                    ]}
                  >
                    {project.name}
                  </AppText>
                  <AppText variant="mono" tone="muted" style={styles.projectPath} numberOfLines={1}>
                    {project.path.split('/').pop()}
                  </AppText>
                </View>
              </View>
              {hasSessions && (
                <View style={[styles.sessionIndicator, isSelected && styles.sessionIndicatorSelected]} />
              )}
            </Pressable>
          );
        })}
      </View>
      <Pressable style={styles.blankSessionButton} onPress={onBlankSession}>
        <View style={[styles.projectIcon, { backgroundColor: colors.textMuted + '20' }]}>
          <TerminalIcon size={16} color={colors.textSecondary} />
        </View>
        <AppText variant="label" tone="muted">
          Start without a project
        </AppText>
      </Pressable>
    </View>
  );
}

// Command Step Component
function CommandStep({
  commands,
  snippets,
  sessionCount,
  loadingScripts,
  launching,
  onLaunch,
  onViewAiSessions,
  colors,
}: {
  commands: Command[];
  snippets: Snippet[];
  sessionCount: number;
  loadingScripts: boolean;
  launching: boolean;
  onLaunch: (command: Command) => void;
  onViewAiSessions: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStepStyles(colors), [colors]);

  if (loadingScripts) {
    return (
      <View style={styles.stepContainer}>
        <ActivityIndicator color={colors.accent} size="large" />
        <AppText variant="body" tone="muted" style={styles.stepInstruction}>
          Loading...
        </AppText>
      </View>
    );
  }

  const hasContent = commands.length > 0 || snippets.length > 0;

  return (
    <View style={styles.stepContainer}>
      <AppText variant="body" tone="muted" style={styles.stepInstruction}>
        Select a command to launch
      </AppText>
      <View style={styles.commandsList}>
        {/* Resume AI Session Button */}
        <Pressable onPress={onViewAiSessions}>
          <Card style={styles.aiSessionCard}>
            <View style={[styles.aiSessionIcon, sessionCount > 0 && styles.aiSessionIconActive]}>
              <AppText variant="subtitle" style={[styles.aiSessionIconText, sessionCount > 0 && styles.aiSessionIconTextActive]}>AI</AppText>
            </View>
            <View style={styles.commandContent}>
              <AppText variant="label">Resume AI Session</AppText>
              <AppText variant="mono" tone="muted" style={styles.commandText}>
                {sessionCount > 0 ? 'Continue where you left off' : 'Start a new AI session'}
              </AppText>
            </View>
            <View style={[styles.launchIcon, sessionCount > 0 ? { backgroundColor: colors.accent } : { backgroundColor: colors.textMuted }]}>
              <AppText variant="label" style={styles.launchIconText}>→</AppText>
            </View>
          </Card>
        </Pressable>

        {!hasContent ? (
          <AppText variant="body" tone="muted" style={{ textAlign: 'center', marginTop: 16 }}>
            No scripts or snippets available
          </AppText>
        ) : (
          <>
            {/* Scripts Section */}
            {commands.length > 0 && (
              <>
                <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
                  NPM Scripts
                </AppText>
                {commands.map((command) => (
                  <Pressable
                    key={command.id}
                    onPress={() => onLaunch(command)}
                    disabled={launching}
                  >
                    <Card style={styles.commandCard}>
                      <View style={styles.commandIcon}>
                        <TerminalIcon size={14} color={colors.textSecondary} />
                      </View>
                      <View style={styles.commandContent}>
                        <AppText variant="label" numberOfLines={1}>
                          {command.label}
                        </AppText>
                        <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.commandText}>
                          {command.command}
                        </AppText>
                      </View>
                      <View style={styles.launchIcon}>
                        <AppText variant="label" style={styles.launchIconText}>
                          {launching ? '...' : '>'}
                        </AppText>
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </>
            )}

            {/* Snippets Section */}
            {snippets.length > 0 && (
              <>
                <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
                  Snippets
                </AppText>
                {snippets.map((snippet) => {
                  const icon = snippet.providerIcon
                    ? providerIcons[snippet.providerIcon]
                    : null;

                  return (
                    <Pressable
                      key={snippet.id}
                      onPress={() => onLaunch(snippet)}
                      disabled={launching}
                    >
                      <Card style={styles.commandCard}>
                        <View style={styles.commandIcon}>
                          {icon || <TerminalIcon size={14} color={colors.textSecondary} />}
                        </View>
                        <View style={styles.commandContent}>
                          <AppText variant="label" numberOfLines={1}>
                            {snippet.label}
                          </AppText>
                          <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.commandText}>
                            {snippet.command}
                          </AppText>
                        </View>
                        <View style={styles.launchIcon}>
                          <AppText variant="label" style={styles.launchIconText}>
                            {launching ? '...' : '>'}
                          </AppText>
                        </View>
                      </Card>
                    </Pressable>
                  );
                })}
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// Blank Session Step Component
function BlankSessionStep({
  snippets,
  launching,
  onLaunch,
  onBlankLaunch,
  colors,
}: {
  snippets: Snippet[];
  launching: boolean;
  onLaunch: (snippet: Snippet) => void;
  onBlankLaunch: () => void;
  colors: ThemeColors;
}) {
  const styles = useMemo(() => createStepStyles(colors), [colors]);

  return (
    <View style={styles.stepContainer}>
      <AppText variant="body" tone="muted" style={styles.stepInstruction}>
        Launch with a snippet or start empty
      </AppText>
      <Pressable
        style={[styles.launchButton, launching && styles.launchButtonDisabled]}
        onPress={onBlankLaunch}
        disabled={launching}
      >
        <TerminalIcon size={20} color={colors.accentText} />
        <AppText variant="subtitle" style={styles.launchButtonText}>
          {launching ? 'Creating...' : 'Start Empty Session'}
        </AppText>
      </Pressable>

      {snippets.length > 0 && (
        <>
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.separator }]} />
            <AppText variant="caps" tone="muted">
              OR
            </AppText>
            <View style={[styles.dividerLine, { backgroundColor: colors.separator }]} />
          </View>
          <View style={styles.commandsList}>
            {snippets.map((snippet) => {
              const icon = snippet.providerIcon
                ? providerIcons[snippet.providerIcon]
                : null;

              return (
                <Pressable
                  key={snippet.id}
                  onPress={() => onLaunch(snippet)}
                  disabled={launching}
                >
                  <Card style={styles.commandCard}>
                    <View style={styles.commandIcon}>
                      {icon || <TerminalIcon size={14} color={colors.textSecondary} />}
                    </View>
                    <View style={styles.commandContent}>
                      <AppText variant="label" numberOfLines={1}>
                        {snippet.label}
                      </AppText>
                      <AppText variant="mono" tone="muted" numberOfLines={1} style={styles.commandText}>
                        {snippet.command}
                      </AppText>
                    </View>
                    <View style={styles.launchIcon}>
                      <AppText variant="label" style={styles.launchIconText}>
                        {launching ? '...' : '>'}
                      </AppText>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const createStepStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    stepContainer: {
      width: STEP_WIDTH,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
    },
    stepInstruction: {
      textAlign: 'center',
      marginBottom: theme.spacing.lg,
      fontSize: 15,
      opacity: 0.7,
    },
    chipsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: theme.spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: theme.radii.md,
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.separator,
    },
    chipSelected: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    chipDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    chipDotSelected: {
      borderColor: colors.accentText,
    },
    chipTextSelected: {
      color: colors.accentText,
      fontWeight: '600',
    },
    // Host Card Styles
    hostsGrid: {
      gap: theme.spacing.sm,
    },
    hostCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.spacing.md,
      borderRadius: theme.radii.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.separator,
    },
    hostCardSelected: {
      backgroundColor: colors.accent + '15',
      borderColor: colors.accent,
    },
    hostCardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      flex: 1,
    },
    hostIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hostInfo: {
      flex: 1,
      gap: 2,
    },
    hostName: {
      fontSize: 16,
      fontWeight: '600',
    },
    hostNameSelected: {
      color: colors.accent,
    },
    hostMeta: {
      fontSize: 12,
    },
    selectedIndicator: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: theme.spacing.sm,
    },
    selectedIndicatorText: {
      color: colors.accentText,
      fontSize: 12,
      fontWeight: '700',
    },
    // Project Card Styles
    projectsGrid: {
      gap: theme.spacing.sm,
    },
    projectCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.spacing.md,
      borderRadius: theme.radii.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.separator,
    },
    projectCardSelected: {
      backgroundColor: colors.accent + '15',
      borderColor: colors.accent,
    },
    projectCardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      flex: 1,
    },
    projectIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    projectInfo: {
      flex: 1,
      gap: 2,
    },
    projectName: {
      fontSize: 16,
      fontWeight: '600',
    },
    projectNameSelected: {
      color: colors.accent,
    },
    projectPath: {
      fontSize: 12,
    },
    sessionIndicator: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent,
      marginLeft: theme.spacing.sm,
    },
    sessionIndicatorSelected: {
      backgroundColor: colors.accentText,
    },
    blankSessionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginTop: theme.spacing.xl,
      padding: theme.spacing.md,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: colors.separator,
      borderStyle: 'dashed',
    },
    sessionBadge: {
      backgroundColor: colors.textMuted,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 10,
      minWidth: 20,
      alignItems: 'center',
    },
    sessionBadgeSelected: {
      backgroundColor: colors.accentText,
    },
    sessionBadgeText: {
      color: colors.card,
      fontSize: 10,
      fontWeight: '600',
    },
    sessionBadgeTextSelected: {
      color: colors.accent,
    },
    commandsList: {
      gap: theme.spacing.xs,
    },
    commandCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 12,
    },
    commandIcon: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    commandContent: {
      flex: 1,
      gap: 2,
    },
    commandText: {
      fontSize: 12,
    },
    launchIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    launchIconText: {
      color: colors.accentText,
      fontSize: 14,
    },
    sectionLabel: {
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.xs,
    },
    aiSessionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: 12,
      backgroundColor: colors.cardPressed,
    },
    aiSessionIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.textMuted + '30',
      alignItems: 'center',
      justifyContent: 'center',
    },
    aiSessionIconActive: {
      backgroundColor: colors.accent,
    },
    aiSessionIconText: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
    },
    aiSessionIconTextActive: {
      color: colors.accentText,
    },
    launchButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.accent,
      paddingVertical: 16,
      borderRadius: theme.radii.lg,
    },
    launchButtonDisabled: {
      opacity: 0.6,
    },
    launchButtonText: {
      color: colors.accentText,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      marginVertical: theme.spacing.lg,
    },
    dividerLine: {
      flex: 1,
      height: 1,
    },
  });

// Main Component
export function LaunchSheet({ isOpen, onClose }: LaunchSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const { hosts } = useStore();
  const { projects, addRecentLaunch, getProjectsByHost } = useProjects();
  const { snippets } = useSnippets();
  const { colors } = useTheme();

  // Step state
  const [step, setStep] = useState(0);
  const [isBlankSession, setIsBlankSession] = useState(false);
  const translateX = useSharedValue(0);

  // Selection state
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [packageScripts, setPackageScripts] = useState<PackageJsonScripts>({});
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [allHostSessions, setAllHostSessions] = useState<AiSession[]>([]);

  // Calculate which step to start on
  const totalSteps = useMemo(() => {
    if (isBlankSession) return 2; // Host -> BlankSession
    return 3; // Host -> Project -> Command
  }, [isBlankSession]);

  const initialStep = useMemo(() => {
    if (hosts.length === 1) return 1; // Skip host step
    return 0;
  }, [hosts.length]);

  // Reset state when sheet opens
  useEffect(() => {
    if (isOpen) {
      const startStep = hosts.length === 1 ? 1 : 0;
      setStep(startStep);
      setIsBlankSession(false);
      setSelectedHostId(hosts.length === 1 ? hosts[0].id : null);
      setSelectedProjectId(null);
      setPackageScripts({});
      setAllHostSessions([]);
      translateX.value = -startStep * STEP_WIDTH;
      // Use setTimeout to ensure ref is ready
      setTimeout(() => {
        sheetRef.current?.snapToIndex(0);
      }, 0);
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen, hosts]);

  // Derived state
  const selectedHost = useMemo(
    () => hosts.find((h) => h.id === selectedHostId) || null,
    [hosts, selectedHostId]
  );

  const hostProjects = useMemo(
    () => (selectedHostId ? getProjectsByHost(selectedHostId) : []),
    [selectedHostId, getProjectsByHost]
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  // Load all AI sessions when host is selected (cached for counts + filtering)
  const [loadingHostSessions, setLoadingHostSessions] = useState(false);

  useEffect(() => {
    if (!selectedHost) {
      setAllHostSessions([]);
      setLoadingHostSessions(false);
      return;
    }
    let cancelled = false;
    setLoadingHostSessions(true);
    async function loadHostSessions() {
      try {
        const result = await getAiSessions(selectedHost!, { limit: 100, maxAgeDays: 30 });
        if (!cancelled) {
          setAllHostSessions(result.sessions);
        }
      } catch {
        if (!cancelled) {
          setAllHostSessions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingHostSessions(false);
        }
      }
    }
    loadHostSessions();
    return () => {
      cancelled = true;
    };
  }, [selectedHost]);

  // Calculate session counts per project from cached data
  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of hostProjects) {
      const count = allHostSessions.filter((session) =>
        session.directory.startsWith(project.path) ||
        project.path.startsWith(session.directory)
      ).length;
      if (count > 0) {
        counts.set(project.id, count);
      }
    }
    return counts;
  }, [hostProjects, allHostSessions]);

  // Load scripts when project is selected
  useEffect(() => {
    if (!selectedHost || !selectedProject) {
      setPackageScripts({});
      return;
    }
    let cancelled = false;
    async function loadScripts() {
      setLoadingScripts(true);
      try {
        const result = await fetchProjectScripts(selectedHost!, selectedProject!.path);
        if (!cancelled) {
          setPackageScripts(result.scripts);
        }
      } catch {
        if (!cancelled) {
          setPackageScripts({});
        }
      } finally {
        if (!cancelled) {
          setLoadingScripts(false);
        }
      }
    }
    loadScripts();
    return () => {
      cancelled = true;
    };
  }, [selectedHost, selectedProject]);

  const projectCommands = useMemo(() => {
    const commands: Command[] = [];
    Object.entries(packageScripts).forEach(([name]) => {
      commands.push({
        id: `npm-${name}`,
        label: name,
        command: `npm run ${name}`,
        icon: 'package',
      });
    });
    return commands;
  }, [packageScripts]);

  // Navigation helpers
  const snapToStep = useCallback(
    (targetStep: number) => {
      setStep(targetStep);
      translateX.value = withSpring(-targetStep * STEP_WIDTH, {
        damping: 30,
        stiffness: 350,
      });
    },
    [translateX]
  );

  const goBack = useCallback(() => {
    if (step > initialStep) {
      if (step === 2 && isBlankSession) {
        setIsBlankSession(false);
      }
      snapToStep(step - 1);
    }
  }, [step, initialStep, isBlankSession, snapToStep]);

  // Selection handlers
  const handleHostSelect = useCallback(
    (hostId: string) => {
      setSelectedHostId(hostId);
      setSelectedProjectId(null);
      setIsBlankSession(false);
      snapToStep(1);
    },
    [snapToStep]
  );

  const handleProjectSelect = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);
      setIsBlankSession(false);
      snapToStep(2);
    },
    [snapToStep]
  );

  const handleBlankSession = useCallback(() => {
    setSelectedProjectId(null);
    setIsBlankSession(true);
    snapToStep(2);
  }, [snapToStep]);

  // Launch handlers
  const handleLaunch = useCallback(
    async (command: Command) => {
      if (!selectedHost || !selectedProject || launching) return;

      setLaunching(true);
      try {
        const timestamp = Date.now().toString(36);
        const sessionName = `${selectedProject.name}-${timestamp}`;

        await createSession(selectedHost, sessionName);
        await sendText(selectedHost, sessionName, `cd ${selectedProject.path}\n`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await sendText(selectedHost, sessionName, `${command.command}\n`);

        await addRecentLaunch({
          hostId: selectedHost.id,
          projectId: selectedProject.id,
          projectName: selectedProject.name,
          hostName: selectedHost.name,
          command,
        });

        onClose();
        router.push(`/session/${selectedHost.id}/${encodeURIComponent(sessionName)}/terminal`);
      } catch (err) {
        console.error('Failed to launch:', err);
      } finally {
        setLaunching(false);
      }
    },
    [selectedHost, selectedProject, launching, addRecentLaunch, onClose, router]
  );

  const handleBlankLaunch = useCallback(async () => {
    if (!selectedHost || launching) return;

    const sessionName = `session-${Date.now().toString(36)}`;

    setLaunching(true);
    try {
      await createSession(selectedHost, sessionName);
      onClose();
      router.push(`/session/${selectedHost.id}/${encodeURIComponent(sessionName)}/terminal`);
    } catch (err) {
      console.error('Failed to create blank session:', err);
    } finally {
      setLaunching(false);
    }
  }, [selectedHost, launching, onClose, router]);

  const handleBlankSnippetLaunch = useCallback(
    async (snippet: Command) => {
      if (!selectedHost || launching) return;

      const sessionName = `session-${Date.now().toString(36)}`;

      setLaunching(true);
      try {
        await createSession(selectedHost, sessionName);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await sendText(selectedHost, sessionName, `${snippet.command}\n`);
        onClose();
        router.push(`/session/${selectedHost.id}/${encodeURIComponent(sessionName)}/terminal`);
      } catch (err) {
        console.error('Failed to create blank snippet session:', err);
      } finally {
        setLaunching(false);
      }
    },
    [selectedHost, launching, onClose, router]
  );

  const handleViewAiSessions = useCallback(() => {
    if (!selectedProject) return;
    onClose();
    router.push(`/ai-sessions?directory=${encodeURIComponent(selectedProject.path)}`);
  }, [selectedProject, onClose, router]);

  // Animated style for pager
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose]
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.3}
      />
    ),
    []
  );

  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderBackground = useCallback(
    (props: any) => (
      <View style={[props.style, styles.sheetBackground, { backgroundColor: colors.card }]} />
    ),
    [colors.card, styles.sheetBackground]
  );

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={snapPoints}
      index={-1}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundComponent={renderBackground}
      handleIndicatorStyle={styles.handleIndicator}
      style={styles.sheet}
      enablePanDownToClose
      bottomInset={0}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        {/* Header */}
        <View style={styles.header}>
          {step > initialStep ? (
            <Pressable onPress={goBack} style={styles.backButton} hitSlop={8}>
              <AppText variant="label" style={{ color: colors.accent }}>
                ← Back
              </AppText>
            </Pressable>
          ) : (
            <View style={styles.backButton} />
          )}
          <ProgressDots
            current={step}
            total={hosts.length === 1 ? totalSteps - 1 : totalSteps}
            onDotPress={(index) => {
              const targetStep = hosts.length === 1 ? index + 1 : index;
              if (targetStep <= step) {
                snapToStep(targetStep);
              }
            }}
            colors={colors}
          />
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
            <AppText variant="label" tone="muted">
              ✕
            </AppText>
          </Pressable>
        </View>

        {/* Step Pager */}
        <View style={styles.pagerContainer}>
          <Animated.View style={[styles.pager, animatedStyle]}>
            {/* Step 0: Host Selection */}
            <HostStep
              hosts={hosts}
              selectedHostId={selectedHostId}
              onSelect={handleHostSelect}
              colors={colors}
            />

            {/* Step 1: Project Selection */}
            <ProjectStep
              projects={hostProjects}
              selectedProjectId={selectedProjectId}
              sessionCounts={sessionCounts}
              onSelect={handleProjectSelect}
              onBlankSession={handleBlankSession}
              colors={colors}
            />

            {/* Step 2: Command or Blank Session */}
            {isBlankSession ? (
              <BlankSessionStep
                snippets={snippets}
                launching={launching}
                onLaunch={handleBlankSnippetLaunch}
                onBlankLaunch={handleBlankLaunch}
                colors={colors}
              />
            ) : (
              <CommandStep
                commands={projectCommands}
                snippets={snippets}
                sessionCount={selectedProject ? (sessionCounts.get(selectedProject.id) || 0) : 0}
                loadingScripts={loadingScripts}
                launching={launching}
                onLaunch={handleLaunch}
                onViewAiSessions={handleViewAiSessions}
                colors={colors}
              />
            )}
          </Animated.View>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    sheet: {
      marginHorizontal: 0,
    },
    sheetBackground: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 8,
    },
    handleIndicator: {
      backgroundColor: colors.separator,
      width: 40,
    },
    content: {
      flexGrow: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
    },
    backButton: {
      width: 60,
    },
    closeButton: {
      width: 60,
      alignItems: 'flex-end',
    },
    pagerContainer: {
      flex: 1,
      overflow: 'hidden',
    },
    pager: {
      flexDirection: 'row',
    },
  });
