import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { providerIcons } from '@/components/icons/ProviderIcons';
import { TerminalIcon } from '@/components/icons/HomeIcons';
import { hostColors } from '@/lib/colors';
import { useStore } from '@/lib/store';
import { useProjects } from '@/lib/projects-store';
import { createSession, fetchProjectScripts, sendText } from '@/lib/api';
import { Command, PackageJsonScripts } from '@/lib/types';
import { theme } from '@/lib/theme';

type LaunchMode = 'projects' | 'blank';

type LaunchSheetProps = {
  isOpen: boolean;
  onClose: () => void;
};

const snapPoints = ['50%', '85%'];

export function LaunchSheet({ isOpen, onClose }: LaunchSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const { hosts } = useStore();
  const { projects, recentLaunches, addRecentLaunch, getProjectsByHost } = useProjects();

  const [mode, setMode] = useState<LaunchMode>('projects');
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [packageScripts, setPackageScripts] = useState<PackageJsonScripts>({});
  const [loadingScripts, setLoadingScripts] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [blankSessionName, setBlankSessionName] = useState('');

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

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen]);

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

  const hardcodedCommands: (Command & { providerIcon?: keyof typeof providerIcons })[] = [
    { id: 'hardcoded-claude', label: 'Claude', command: 'claude --permission-mode bypassPermissions', providerIcon: 'claude' },
    { id: 'hardcoded-codex', label: 'Codex', command: 'codex --yolo', providerIcon: 'codex' },
    { id: 'hardcoded-opencode', label: 'OpenCode', command: 'opencode' },
  ];

  const allCommands = useMemo(() => {
    const commands: Command[] = [...hardcodedCommands];
    Object.entries(packageScripts).forEach(([name]) => {
      commands.push({
        id: `npm-${name}`,
        label: name,
        command: `npm run ${name}`,
        icon: 'package',
      });
    });
    if (selectedProject?.customCommands) {
      commands.push(...selectedProject.customCommands);
    }
    return commands;
  }, [packageScripts, selectedProject]);

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

  const handleRecentLaunch = useCallback(
    async (launch: (typeof recentLaunches)[0]) => {
      const host = hosts.find((h) => h.id === launch.hostId);
      const project = projects.find((p) => p.id === launch.projectId);
      if (!host || !project) return;

      setLaunching(true);
      try {
        const timestamp = Date.now().toString(36);
        const sessionName = `${project.name}-${timestamp}`;

        await createSession(host, sessionName);
        await sendText(host, sessionName, `cd ${project.path}\n`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await sendText(host, sessionName, `${launch.command.command}\n`);

        await addRecentLaunch({
          hostId: host.id,
          projectId: project.id,
          projectName: project.name,
          hostName: host.name,
          command: launch.command,
        });

        onClose();
        router.push(`/session/${host.id}/${encodeURIComponent(sessionName)}/terminal`);
      } catch (err) {
        console.error('Failed to re-launch:', err);
      } finally {
        setLaunching(false);
      }
    },
    [hosts, projects, addRecentLaunch, onClose, router]
  );

  const handleBlankLaunch = useCallback(async () => {
    if (!selectedHost || launching) return;
    
    const sessionName = blankSessionName.trim() || `session-${Date.now().toString(36)}`;
    
    setLaunching(true);
    try {
      await createSession(selectedHost, sessionName);
      onClose();
      router.push(`/session/${selectedHost.id}/${encodeURIComponent(sessionName)}/terminal`);
    } catch (err) {
      console.error('Failed to create blank session:', err);
    } finally {
      setLaunching(false);
      setBlankSessionName('');
    }
  }, [selectedHost, blankSessionName, launching, onClose, router]);

  const handleSheetChange = useCallback((index: number) => {
    if (index === -1) {
      onClose();
    }
  }, [onClose]);

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

  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const renderBackground = useCallback(
    (props: any) => (
      <View style={[props.style, styles.sheetBackground, { backgroundColor: colors.card }]} />
    ),
    [colors.card]
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
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="title" style={styles.title}>
          Launch
        </AppText>

        {/* Mode Toggle */}
        <View style={styles.modeToggleContainer}>
          <SegmentedControl
            values={['Projects', 'Blank Session']}
            selectedIndex={mode === 'projects' ? 0 : 1}
            onChange={(event) => {
              setMode(event.nativeEvent.selectedSegmentIndex === 0 ? 'projects' : 'blank');
            }}
            style={styles.segmentedControl}
            tintColor={colors.accent}
            backgroundColor={colors.cardPressed}
            fontStyle={{ color: colors.textSecondary }}
            activeFontStyle={{ color: colors.accentText }}
          />
        </View>

        {/* Projects Mode */}
        {mode === 'projects' && (
          <>
            {recentLaunches.length > 0 && (
              <View style={styles.section}>
                <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
                  Recent
                </AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.recentRow}
                >
                  {recentLaunches.slice(0, 5).map((launch) => (
                    <Pressable
                      key={launch.id}
                      onPress={() => handleRecentLaunch(launch)}
                      disabled={launching}
                    >
                      <Card style={styles.recentCard}>
                        <AppText variant="label" numberOfLines={1}>
                          {launch.command.label}
                        </AppText>
                        <AppText variant="caps" tone="muted" numberOfLines={1}>
                          {launch.projectName}
                        </AppText>
                      </Card>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.section}>
              <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
                Host
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {hosts.map((host, idx) => (
                  <Pressable
                    key={host.id}
                    style={[
                      styles.chip,
                      selectedHostId === host.id && styles.chipSelected,
                    ]}
                    onPress={() => {
                      setSelectedHostId(selectedHostId === host.id ? null : host.id);
                      setSelectedProjectId(null);
                    }}
                  >
                    <View
                      style={[
                        styles.chipDot,
                        { backgroundColor: host.color || hostColors[idx % hostColors.length] },
                      ]}
                    />
                    <AppText
                      variant="label"
                      style={selectedHostId === host.id ? styles.chipTextSelected : undefined}
                    >
                      {host.name}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {selectedHostId && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
                    Project
                  </AppText>
                  <Pressable onPress={() => router.push('/projects/new')}>
                    <AppText variant="caps" style={styles.addLink}>
                      + Add
                    </AppText>
                  </Pressable>
                </View>
                {hostProjects.length === 0 ? (
                  <View style={styles.emptyState}>
                    <AppText variant="body" tone="muted">
                      No projects for this host
                    </AppText>
                    <Pressable
                      style={styles.addButton}
                      onPress={() => router.push('/projects/new')}
                    >
                      <AppText variant="label" style={styles.addButtonText}>
                        Add Project
                      </AppText>
                    </Pressable>
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {hostProjects.map((project) => (
                      <Pressable
                        key={project.id}
                        style={[
                          styles.chip,
                          selectedProjectId === project.id && styles.chipSelected,
                        ]}
                        onPress={() =>
                          setSelectedProjectId(
                            selectedProjectId === project.id ? null : project.id
                          )
                        }
                      >
                        <AppText
                          variant="label"
                          style={
                            selectedProjectId === project.id
                              ? styles.chipTextSelected
                              : undefined
                          }
                        >
                          {project.name}
                        </AppText>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {selectedProject && (
              <View style={styles.section}>
                <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
                  Commands
                </AppText>
                {loadingScripts ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.accent} />
                  </View>
                ) : allCommands.length === 0 ? (
                  <View style={styles.emptyState}>
                    <AppText variant="body" tone="muted">
                      No commands available
                    </AppText>
                  </View>
                ) : (
                  <View style={styles.commandsList}>
                    {allCommands.map((command) => {
                      const hc = hardcodedCommands.find((h) => h.id === command.id);
                      const icon = hc?.providerIcon ? providerIcons[hc.providerIcon] : null;
                      return (
                        <Pressable
                          key={command.id}
                          onPress={() => handleLaunch(command)}
                          disabled={launching}
                        >
                          <Card style={styles.commandCard}>
                            <View style={styles.commandIcon}>
                              {icon || <TerminalIcon size={14} color={colors.textSecondary} />}
                            </View>
                            <AppText variant="mono" style={styles.commandText} numberOfLines={1}>
                              {command.command}
                            </AppText>
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
                )}
              </View>
            )}
          </>
        )}

        {/* Blank Session Mode */}
        {mode === 'blank' && (
          <>
            <View style={styles.section}>
              <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
                Host
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {hosts.map((host, idx) => (
                  <Pressable
                    key={host.id}
                    style={[
                      styles.chip,
                      selectedHostId === host.id && styles.chipSelected,
                    ]}
                    onPress={() => {
                      setSelectedHostId(selectedHostId === host.id ? null : host.id);
                    }}
                  >
                    <View
                      style={[
                        styles.chipDot,
                        { backgroundColor: host.color || hostColors[idx % hostColors.length] },
                      ]}
                    />
                    <AppText
                      variant="label"
                      style={selectedHostId === host.id ? styles.chipTextSelected : undefined}
                    >
                      {host.name}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {selectedHostId && (
              <View style={styles.section}>
                <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
                  Session Name (optional)
                </AppText>
                <Card style={styles.inputCard}>
                  <TerminalIcon size={18} color={colors.textSecondary} />
                  <BottomSheetTextInput
                    style={styles.textInput}
                    value={blankSessionName}
                    onChangeText={setBlankSessionName}
                    placeholder="Auto-generated if empty..."
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Card>
              </View>
            )}

            <View style={styles.launchButtonContainer}>
              <Pressable
                style={[
                  styles.launchButton,
                  !selectedHostId && styles.launchButtonDisabled,
                ]}
                onPress={handleBlankLaunch}
                disabled={!selectedHostId || launching}
              >
                <TerminalIcon size={20} color={selectedHostId ? colors.accentText : colors.textSecondary} />
                <AppText
                  variant="subtitle"
                  style={[
                    styles.launchButtonText,
                    !selectedHostId && styles.launchButtonTextDisabled,
                  ]}
                >
                  {launching ? 'Creating...' : 'Create Session'}
                </AppText>
              </Pressable>
            </View>
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  title: {
    marginBottom: theme.spacing.md,
  },
  modeToggleContainer: {
    marginBottom: theme.spacing.lg,
  },
  segmentedControl: {
    height: 40,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  sectionLabel: {
    marginBottom: theme.spacing.sm,
  },
  addLink: {
    color: colors.accent,
  },
  recentRow: {
    gap: theme.spacing.sm,
  },
  recentCard: {
    padding: theme.spacing.sm,
    minWidth: 120,
    gap: 4,
  },
  chipRow: {
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radii.md,
    backgroundColor: colors.cardPressed,
  },
  chipSelected: {
    backgroundColor: colors.barBg,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipTextSelected: {
    color: colors.accent,
  },
  emptyState: {
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  addButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
  },
  addButtonText: {
    color: colors.accentText,
  },
  loadingContainer: {
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  commandsList: {
    gap: theme.spacing.xs,
  },
  commandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
  },
  commandIcon: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandText: {
    flex: 1,
    fontSize: 13,
  },
  launchIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  launchIconText: {
    color: colors.accentText,
    fontSize: 12,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  textInput: {
    flex: 1,
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 14,
    color: colors.text,
    paddingVertical: 8,
  },
  launchButtonContainer: {
    marginTop: theme.spacing.md,
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
    backgroundColor: colors.separator,
  },
  launchButtonText: {
    color: colors.accentText,
  },
  launchButtonTextDisabled: {
    color: colors.textMuted,
  },
});
