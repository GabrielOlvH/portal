import React, { useMemo } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, GitBranch, Globe, Grid2x2, Plus, ScrollText, Server, Settings, Terminal, Unplug, ArrowRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { AppText } from '@/components/AppText';
import { GlassCard } from '@/components/ui/GlassCard';
import { ProviderIcon } from '@/components/icons/ProviderIcons';
import { useStore } from '@/lib/store';
import { withAlpha } from '@/lib/colors';
import { useTheme, type ThemeColors } from '@/lib/useTheme';
import type { SessionWithHost } from '@/lib/workspace-types';
import { LinearGradient } from 'expo-linear-gradient';

type ProviderName = 'claude' | 'codex' | 'copilot' | 'cursor' | 'kimi';

// ─── Usage Ring ──────────────────────────────────────────────────────────────

function UsageRing({
  provider,
  percentLeft,
  colors,
}: {
  provider: ProviderName;
  percentLeft: number;
  colors: ThemeColors;
}) {
  const size = 32;
  const sw = 3;
  const center = size / 2;
  const radius = center - sw / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (Math.max(0, percentLeft) / 100) * circ;
  const ringColor = percentLeft > 50 ? colors.green : percentLeft > 20 ? colors.orange : colors.red;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={center} cy={center} r={radius} fill="none" stroke={withAlpha(colors.text, 0.1)} strokeWidth={sw} />
        <Circle
          cx={center} cy={center} r={radius} fill="none"
          stroke={ringColor} strokeWidth={sw}
          rotation={-90} origin={`${center}, ${center}`}
          {...(percentLeft >= 100 ? {} : { strokeDasharray: `${dash} ${circ}`, strokeLinecap: 'round' as const })}
        />
      </Svg>
      <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
        <ProviderIcon provider={provider} size={14} color={colors.textSecondary} />
      </View>
    </View>
  );
}

// ─── Session helpers ─────────────────────────────────────────────────────────

function getSessionSubtitle(session: SessionWithHost): string {
  const meta = session.insights?.meta;
  if (meta?.agentCommand) return meta.agentCommand;
  if (meta?.cwd) return meta.cwd;
  return session.host.name;
}

function getSessionDotColor(session: SessionWithHost, colors: ThemeColors): string | null {
  const state = session.insights?.meta?.agentState;
  if (state === 'running') return colors.green;
  if (state === 'idle') return colors.textMuted;
  return null;
}

// ─── Gestures ────────────────────────────────────────────────────────────────

type MCIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const GESTURES: { icon: MCIconName; desc: string; label: string }[] = [
  { icon: 'gesture-swipe-horizontal', desc: 'Prev/next window', label: 'Fling L/R' },
  { icon: 'gesture-swipe-up', desc: 'Next workspace', label: '2-finger fling up' },
  { icon: 'gesture-swipe-down', desc: 'Prev workspace', label: '2-finger fling down' },
  { icon: 'gesture-pinch', desc: 'Overview mode', label: 'Pinch in' },
  { icon: 'gesture-spread', desc: 'Exit overview', label: 'Pinch out' },
  { icon: 'gesture-tap', desc: 'Switch workspace', label: 'Tap indicator' },
];

// ─── Dock items ──────────────────────────────────────────────────────────────

const DOCK_ITEMS = [
  { key: 'hosts', label: 'Hosts', Icon: Server },
  { key: 'projects', label: 'Projects', Icon: Grid2x2 },
  { key: 'ports', label: 'Ports', Icon: Unplug },
  { key: 'snippets', label: 'Snippets', Icon: ScrollText },
  { key: 'github', label: 'GitHub', Icon: GitBranch },
  { key: 'browser', label: 'Browser', Icon: Globe },
  { key: 'settings', label: 'Settings', Icon: Settings },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type LaunchpadPageProps = {
  totalPages: number;
  currentIndex: number;
  onOpenWindow: (route: string, params?: Record<string, string>) => void;
  onNewSession: () => void;
  quickSessions?: SessionWithHost[];
  providerUsage?: { provider: ProviderName; percentLeft: number }[];
};

// ─── Component ───────────────────────────────────────────────────────────────

export function LaunchpadPage({
  totalPages,
  currentIndex,
  onOpenWindow,
  onNewSession,
  quickSessions = [],
  providerUsage = [],
}: LaunchpadPageProps) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { hosts } = useStore();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = width >= 768;
  const [browserPromptVisible, setBrowserPromptVisible] = React.useState(false);
  const [browserUrl, setBrowserUrl] = React.useState('');
  const [gesturesExpanded, setGesturesExpanded] = React.useState(false);

  const openBrowserPrompt = React.useCallback(() => {
    if (Platform.OS === 'ios') {
      Alert.prompt('Open Browser', 'Enter URL', (url) => {
        if (url?.trim()) {
          const normalized = url.trim().match(/^https?:\/\//) ? url.trim() : `https://${url.trim()}`;
          onOpenWindow('browser', { url: normalized });
        }
      }, 'plain-text', '', 'url');
    } else {
      setBrowserUrl('');
      setBrowserPromptVisible(true);
    }
  }, [onOpenWindow]);

  const handleDockPress = React.useCallback((key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (key === 'browser') {
      openBrowserPrompt();
    } else {
      onOpenWindow(key);
    }
  }, [onOpenWindow, openBrowserPrompt]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const posText = totalPages > 0 ? `${currentIndex + 1}/${totalPages}` : '';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoContainer}>
              <Terminal size={22} color={colors.accent} />
            </View>
            <View style={styles.headerTitles}>
              <AppText variant="title" style={styles.title}>Portal</AppText>
              {posText ? (
                <AppText variant="caps" tone="muted" style={styles.posText}>Page {posText}</AppText>
              ) : null}
            </View>
          </View>
          {providerUsage.length > 0 && (
            <View style={styles.headerRings}>
              {providerUsage.map(({ provider, percentLeft }) => (
                <UsageRing key={provider} provider={provider} percentLeft={percentLeft} colors={colors} />
              ))}
            </View>
          )}
        </View>

        {hosts.length === 0 ? (
          <>
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Server size={32} color={colors.textMuted} />
              </View>
              <AppText variant="title" style={styles.emptyTitle}>No hosts connected</AppText>
              <AppText variant="body" tone="muted" style={styles.emptyBody}>
                Add a server to start managing terminal sessions.
              </AppText>
              <Pressable
                style={({ pressed }) => [styles.newSessionBtn, pressed && { opacity: 0.85 }]}
                onPress={() => router.push('/hosts/new')}
              >
                <LinearGradient
                  colors={[withAlpha(colors.accent, 0.2), withAlpha(colors.accent, 0.0)]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Plus size={20} color={colors.accentText} />
                <AppText variant="subtitle" style={styles.newSessionText}>Add Host</AppText>
              </Pressable>
            </View>

            {/* Minimal dock for empty state */}
            <View style={styles.dock}>
              {([
                { key: 'settings', label: 'Settings', Icon: Settings },
                { key: 'browser', label: 'Browser', Icon: Globe },
              ] as const).map(({ key, label, Icon }) => (
                <Pressable key={key} style={styles.dockItem} onPress={() => handleDockPress(key)}>
                  <View style={styles.dockIcon}>
                    <Icon size={22} color={colors.text} />
                  </View>
                  <AppText variant="caps" style={styles.dockLabel}>{label}</AppText>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            {/* New Session CTA */}
            <Pressable
              style={({ pressed }) => [styles.newSessionBtn, pressed && { opacity: 0.85 }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onNewSession();
              }}
            >
              <LinearGradient
                colors={[withAlpha(colors.accent, 0.8), colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Plus size={20} color={colors.accentText} />
              <AppText variant="subtitle" style={styles.newSessionText}>New Session</AppText>
            </Pressable>

            {/* Dock */}
            <GlassCard style={styles.dockCard} intensity={25}>
              <View style={styles.dock}>
                {DOCK_ITEMS.map(({ key, label, Icon }) => (
                  <Pressable key={key} style={styles.dockItem} onPress={() => handleDockPress(key)}>
                    <View style={styles.dockIcon}>
                      <Icon size={22} color={colors.text} />
                    </View>
                    <AppText variant="caps" style={styles.dockLabel}>{label}</AppText>
                  </Pressable>
                ))}
              </View>
            </GlassCard>

            {/* Sessions */}
            {quickSessions.length > 0 && (
              <GlassCard style={styles.sessionsCard}>
                <View style={styles.sectionHeader}>
                  <AppText variant="caps" tone="muted" style={styles.sectionLabel}>Active Sessions</AppText>
                  <View style={styles.badge}>
                    <AppText variant="caps" tone="base" style={styles.sectionCount}>{quickSessions.length}</AppText>
                  </View>
                </View>
                {quickSessions.map((session, idx) => {
                  const subtitle = getSessionSubtitle(session);
                  const dotColor = getSessionDotColor(session, colors);
                  return (
                    <React.Fragment key={`${session.host.id}/${session.name}`}>
                      <Pressable
                        style={({ pressed }) => [styles.sessionRow, pressed && styles.rowPressed]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          onOpenWindow('terminal', {
                            hostId: session.host.id,
                            sessionName: session.name,
                          });
                        }}
                      >
                        <View style={styles.sessionDotContainer}>
                          <View style={[styles.sessionDot, dotColor ? { backgroundColor: dotColor, shadowColor: dotColor, shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } } : { backgroundColor: colors.textMuted }]} />
                        </View>
                        <View style={styles.sessionText}>
                          <AppText variant="body" style={styles.sessionName} numberOfLines={1}>
                            {session.name}
                          </AppText>
                          <AppText variant="mono" tone="muted" style={styles.sessionSub} numberOfLines={1}>
                            {subtitle}
                          </AppText>
                        </View>
                        <View style={styles.sessionChevron}>
                          <ArrowRight size={16} color={colors.textMuted} />
                        </View>
                      </Pressable>
                      {idx < quickSessions.length - 1 && <View style={styles.separator} />}
                    </React.Fragment>
                  );
                })}
              </GlassCard>
            )}

            {/* Gestures */}
            <GlassCard style={styles.gesturesCard}>
              <Pressable style={styles.gestureHeader} onPress={() => setGesturesExpanded(v => !v)}>
                <AppText variant="caps" tone="muted" style={styles.sectionLabel}>Gestures Guide</AppText>
                <View style={styles.gestureToggle}>
                  <AppText variant="caps" tone="muted">{gesturesExpanded ? 'Hide' : 'Show'}</AppText>
                </View>
              </Pressable>
              {gesturesExpanded && (
                <View style={styles.gestureGrid}>
                  {GESTURES.map((g) => (
                    <View key={g.label} style={styles.gestureCell}>
                      <View style={styles.gestureIconBox}>
                        <MaterialCommunityIcons name={g.icon} size={20} color={colors.text} />
                      </View>
                      <View style={styles.gestureCellText}>
                        <AppText variant="body" style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '500' }}>
                          {g.desc}
                        </AppText>
                        <AppText variant="caps" tone="muted" style={{ fontSize: 10, marginTop: 2 }}>
                          {g.label}
                        </AppText>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </GlassCard>
          </>
        )}
      </ScrollView>

      {Platform.OS !== 'ios' && (
        <Modal
          visible={browserPromptVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setBrowserPromptVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setBrowserPromptVisible(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
              <AppText variant="subtitle">Open Browser</AppText>
              <TextInput
                value={browserUrl}
                onChangeText={setBrowserUrl}
                placeholder="https://example.com"
                placeholderTextColor={colors.textMuted}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={() => {
                  const url = browserUrl.trim();
                  if (url) {
                    const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;
                    onOpenWindow('browser', { url: normalized });
                    setBrowserPromptVisible(false);
                  }
                }}
                style={{
                  backgroundColor: colors.barBg,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.text,
                  fontSize: 16,
                }}
              />
              <View style={styles.modalActions}>
                <Pressable onPress={() => setBrowserPromptVisible(false)} style={styles.modalCancel}>
                  <AppText variant="body" tone="muted">Cancel</AppText>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const url = browserUrl.trim();
                    if (url) {
                      const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;
                      onOpenWindow('browser', { url: normalized });
                      setBrowserPromptVisible(false);
                    }
                  }}
                  style={[styles.modalSubmit, { backgroundColor: colors.accent }]}
                >
                  <AppText variant="body" style={{ color: colors.accentText }}>Open</AppText>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 40,
      gap: 20,
    },
    scrollContentWide: {
      maxWidth: 600,
      alignSelf: 'center' as const,
      width: '100%',
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    logoContainer: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: withAlpha(colors.accent, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitles: {
      gap: 2,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    posText: {
      fontSize: 11,
      fontWeight: '600',
    },
    headerRings: {
      flexDirection: 'row',
      gap: 8,
    },

    // Empty state
    emptyState: {
      alignItems: 'center',
      gap: 12,
      paddingVertical: 40,
      backgroundColor: withAlpha(colors.text, 0.02),
      borderRadius: 24,
      borderWidth: 1,
      borderColor: withAlpha(colors.text, 0.05),
    },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: withAlpha(colors.text, 0.05),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    emptyTitle: {
      textAlign: 'center',
      fontSize: 20,
    },
    emptyBody: {
      textAlign: 'center',
      maxWidth: 280,
      lineHeight: 22,
      marginBottom: 16,
    },

    // New Session
    newSessionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingVertical: 18,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      overflow: 'hidden',
    },
    newSessionText: {
      color: colors.accentText,
      fontSize: 18,
      fontWeight: '600',
    },

    // Dock
    dockCard: {
      padding: 16,
      borderRadius: 24,
    },
    dock: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
    },
    dockItem: {
      alignItems: 'center',
      gap: 8,
      width: '22%' as unknown as number,
      marginBottom: 8,
    },
    dockIcon: {
      width: 56,
      height: 56,
      borderRadius: 20,
      backgroundColor: withAlpha(colors.text, 0.05),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(colors.text, 0.05),
    },
    dockLabel: {
      fontSize: 10,
      letterSpacing: 0.5,
      color: colors.textSecondary,
      fontWeight: '600',
    },

    // Sessions
    sessionsCard: {
      padding: 0,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    sectionLabel: {
      fontSize: 12,
      letterSpacing: 1,
      fontWeight: '700',
    },
    badge: {
      backgroundColor: withAlpha(colors.text, 0.05),
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    sectionCount: {
      fontSize: 11,
      fontWeight: '700',
    },
    separator: {
      height: 1,
      backgroundColor: withAlpha(colors.text, 0.05),
      marginHorizontal: 20,
    },
    rowPressed: {
      backgroundColor: withAlpha(colors.text, 0.05),
    },
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      gap: 14,
    },
    sessionDotContainer: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: withAlpha(colors.text, 0.05),
      alignItems: 'center',
      justifyContent: 'center',
    },
    sessionDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    sessionText: {
      flex: 1,
      gap: 4,
    },
    sessionName: {
      fontSize: 16,
      fontWeight: '600',
    },
    sessionSub: {
      fontSize: 12,
    },
    sessionChevron: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: withAlpha(colors.text, 0.03),
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Gestures
    gesturesCard: {
      padding: 0,
      overflow: 'hidden',
    },
    gestureHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    gestureToggle: {
      backgroundColor: withAlpha(colors.text, 0.05),
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    gestureGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 12,
      paddingBottom: 16,
      gap: 8,
    },
    gestureCell: {
      width: '48%' as unknown as number,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: withAlpha(colors.text, 0.02),
      borderRadius: 16,
      flexGrow: 1,
    },
    gestureIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: withAlpha(colors.text, 0.05),
      alignItems: 'center',
      justifyContent: 'center',
    },
    gestureCellText: {
      flex: 1,
    },

    // Modal
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 32,
    },
    modalContent: {
      borderRadius: 24,
      padding: 24,
      gap: 20,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    modalCancel: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      backgroundColor: withAlpha(colors.text, 0.05),
    },
    modalSubmit: {
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 20,
    },
  });
}
