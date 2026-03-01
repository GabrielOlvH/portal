import React, { useMemo } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, GitBranch, Globe, Grid2x2, Plus, ScrollText, Server, Settings, Terminal, Unplug } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { AppText } from '@/components/AppText';
import { ProviderIcon } from '@/components/icons/ProviderIcons';
import { useStore } from '@/lib/store';
import { withAlpha } from '@/lib/colors';
import { useTheme, type ThemeColors } from '@/lib/useTheme';
import type { SessionWithHost } from '@/lib/workspace-types';

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
  const size = 28;
  const sw = 2.5;
  const center = size / 2;
  const radius = center - sw / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (Math.max(0, percentLeft) / 100) * circ;
  const ringColor = percentLeft > 50 ? colors.green : percentLeft > 20 ? colors.orange : colors.red;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={center} cy={center} r={radius} fill="none" stroke={colors.border} strokeWidth={sw} />
        <Circle
          cx={center} cy={center} r={radius} fill="none"
          stroke={ringColor} strokeWidth={sw}
          rotation={-90} origin={`${center}, ${center}`}
          {...(percentLeft >= 100 ? {} : { strokeDasharray: `${dash} ${circ}`, strokeLinecap: 'round' as const })}
        />
      </Svg>
      <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
        <ProviderIcon provider={provider} size={12} color={colors.textSecondary} />
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
  const { colors } = useTheme();
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

  const styles = useMemo(() => createStyles(colors), [colors]);

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
            <Terminal size={20} color={colors.accent} />
            <AppText variant="title" style={styles.title}>Portal</AppText>
            {posText ? (
              <AppText variant="caps" tone="muted" style={styles.posText}>{posText}</AppText>
            ) : null}
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
                <Server size={28} color={colors.textMuted} />
              </View>
              <AppText variant="subtitle" style={styles.emptyTitle}>No hosts connected</AppText>
              <AppText variant="body" tone="muted" style={styles.emptyBody}>
                Add a server to start managing terminal sessions.
              </AppText>
              <Pressable
                style={({ pressed }) => [styles.newSessionBtn, pressed && { opacity: 0.85 }]}
                onPress={() => router.push('/hosts/new')}
              >
                <Plus size={16} color={colors.accentText} />
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
                    <Icon size={18} color={colors.text} />
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
              <Plus size={16} color={colors.accentText} />
              <AppText variant="subtitle" style={styles.newSessionText}>New Session</AppText>
            </Pressable>

            {/* Dock */}
            <View style={styles.dock}>
              {DOCK_ITEMS.map(({ key, label, Icon }) => (
                <Pressable key={key} style={styles.dockItem} onPress={() => handleDockPress(key)}>
                  <View style={styles.dockIcon}>
                    <Icon size={18} color={colors.text} />
                  </View>
                  <AppText variant="caps" style={styles.dockLabel}>{label}</AppText>
                </Pressable>
              ))}
            </View>

            {/* Sessions */}
            {quickSessions.length > 0 && (
              <View style={styles.card}>
                <View style={styles.sectionHeader}>
                  <AppText variant="caps" tone="muted" style={styles.sectionLabel}>Sessions</AppText>
                  <AppText variant="caps" tone="muted" style={styles.sectionCount}>{quickSessions.length}</AppText>
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
                        <View style={[styles.sessionDot, dotColor ? { backgroundColor: dotColor } : { backgroundColor: colors.separator }]} />
                        <View style={styles.sessionText}>
                          <AppText variant="body" style={styles.sessionName} numberOfLines={1}>
                            {session.name}
                          </AppText>
                          <AppText variant="mono" tone="muted" style={styles.sessionSub} numberOfLines={1}>
                            {subtitle}
                          </AppText>
                        </View>
                        <ChevronRight size={12} color={colors.textMuted} />
                      </Pressable>
                      {idx < quickSessions.length - 1 && <View style={styles.separator} />}
                    </React.Fragment>
                  );
                })}
              </View>
            )}

            {/* Gestures */}
            <Pressable style={styles.card} onPress={() => setGesturesExpanded(v => !v)}>
              <View style={styles.gestureHeader}>
                <AppText variant="caps" tone="muted" style={styles.sectionLabel}>Gestures</AppText>
                <AppText variant="caps" tone="muted">{gesturesExpanded ? '−' : '+'}</AppText>
              </View>
              {gesturesExpanded && (
                <View style={styles.gestureGrid}>
                  {GESTURES.map((g) => (
                    <View key={g.label} style={styles.gestureCell}>
                      <MaterialCommunityIcons name={g.icon} size={18} color={colors.textMuted} />
                      <View style={styles.gestureCellText}>
                        <AppText variant="body" style={{ color: colors.textSecondary, fontSize: 13 }}>
                          {g.desc}
                        </AppText>
                        <AppText variant="caps" tone="muted" style={{ fontSize: 9 }}>
                          {g.label}
                        </AppText>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Pressable>
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
      gap: 14,
    },
    scrollContentWide: {
      maxWidth: 480,
      alignSelf: 'center' as const,
      width: '100%',
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
    },
    posText: {
      fontSize: 10,
      marginLeft: 4,
    },
    headerRings: {
      flexDirection: 'row',
      gap: 6,
    },

    // Empty state
    emptyState: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 24,
    },
    emptyIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: withAlpha(colors.accent, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    emptyTitle: {
      textAlign: 'center',
    },
    emptyBody: {
      textAlign: 'center',
      maxWidth: 260,
      lineHeight: 20,
    },

    // New Session
    newSessionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 13,
    },
    newSessionText: {
      color: colors.accentText,
      fontSize: 15,
    },

    // Dock
    dock: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      paddingVertical: 4,
    },
    dockItem: {
      alignItems: 'center',
      gap: 4,
      minWidth: 44,
    },
    dockIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dockLabel: {
      fontSize: 9,
      letterSpacing: 0.3,
      color: colors.textMuted,
    },

    // Card
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 4,
    },
    sectionLabel: {
      fontSize: 11,
      letterSpacing: 0.8,
    },
    sectionCount: {
      fontSize: 10,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.separator,
      marginLeft: 30,
    },
    rowPressed: {
      backgroundColor: colors.cardPressed,
    },

    // Sessions
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      gap: 10,
    },
    sessionDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    sessionText: {
      flex: 1,
      gap: 1,
    },
    sessionName: {
      fontSize: 14,
    },
    sessionSub: {
      fontSize: 10,
    },

    // Gestures
    gestureHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    gestureGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 10,
      paddingBottom: 10,
      gap: 2,
    },
    gestureCell: {
      width: '48%' as unknown as number,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 6,
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
      borderRadius: 14,
      padding: 20,
      gap: 16,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    modalCancel: {
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    modalSubmit: {
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
  });
}
