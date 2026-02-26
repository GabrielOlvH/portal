import React, { useMemo } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Globe, Grid2x2, Plus, Server, Settings, Terminal } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from '@/components/AppText';
import { useStore } from '@/lib/store';
import { useTheme, type ThemeColors } from '@/lib/useTheme';

// ─── Position Dots ───────────────────────────────────────────────────────────

function PositionDots({
  total,
  current,
  colors,
}: {
  total: number;
  current: number;
  colors: ThemeColors;
}) {
  if (total <= 0) return null;

  if (total > 8) {
    return (
      <AppText variant="caps" tone="muted" style={{ fontSize: 10 }}>
        {current + 1} / {total}
      </AppText>
    );
  }

  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === current ? 8 : 5,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: i === current ? colors.accent : colors.textMuted,
            opacity: i === current ? 1 : 0.5,
          }}
        />
      ))}
    </View>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type LaunchpadPageProps = {
  totalPages: number;
  currentIndex: number;
  onOpenWindow: (route: string, params?: Record<string, string>) => void;
  onNewSession: () => void;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function LaunchpadPage({ totalPages, currentIndex, onOpenWindow, onNewSession }: LaunchpadPageProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { hosts } = useStore();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWide = width >= 768;
  const [browserPromptVisible, setBrowserPromptVisible] = React.useState(false);
  const [browserUrl, setBrowserUrl] = React.useState('');

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

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Terminal size={28} color={colors.accent} />
          <AppText variant="title" style={styles.title}>
            Bridge
          </AppText>
          <PositionDots total={totalPages} current={currentIndex} colors={colors} />
        </View>

        {hosts.length === 0 ? (
          <View style={styles.emptyState}>
            <AppText variant="subtitle" style={styles.emptyTitle}>
              Welcome to Bridge
            </AppText>
            <AppText variant="body" tone="muted" style={styles.emptyBody}>
              Connect to a server to start managing your terminal sessions.
            </AppText>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push('/hosts/new')}
            >
              <Server size={16} color={colors.accentText} />
              <AppText variant="subtitle" style={styles.primaryButtonText}>
                Add a host to get started
              </AppText>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.newSessionButton, pressed && styles.newSessionButtonPressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onNewSession();
            }}
          >
            <Plus size={22} color={colors.accentText} />
            <AppText variant="subtitle" style={styles.newSessionButtonText}>
              New Session
            </AppText>
          </Pressable>
        )}

        {/* Navigation rows */}
        {hosts.length > 0 && (
          <View style={styles.navSection}>
            <Pressable
              style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
              onPress={() => onOpenWindow('hosts')}
            >
              <View style={styles.navRowIcon}>
                <Server size={18} color={colors.text} />
              </View>
              <AppText variant="body" style={styles.navRowLabel}>Hosts</AppText>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>

            <View style={styles.navRowSeparator} />

            <Pressable
              style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
              onPress={() => onOpenWindow('projects')}
            >
              <View style={styles.navRowIcon}>
                <Grid2x2 size={18} color={colors.text} />
              </View>
              <AppText variant="body" style={styles.navRowLabel}>Projects</AppText>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>

            <View style={styles.navRowSeparator} />

            <Pressable
              style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
              onPress={() => onOpenWindow('settings')}
            >
              <View style={styles.navRowIcon}>
                <Settings size={18} color={colors.text} />
              </View>
              <AppText variant="body" style={styles.navRowLabel}>Settings</AppText>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>

            <View style={styles.navRowSeparator} />

            <Pressable
              style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
              onPress={openBrowserPrompt}
            >
              <View style={styles.navRowIcon}>
                <Globe size={18} color={colors.text} />
              </View>
              <AppText variant="body" style={styles.navRowLabel}>Browser</AppText>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {hosts.length === 0 && (
          <View style={styles.navSection}>
            <Pressable
              style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
              onPress={() => onOpenWindow('settings')}
            >
              <View style={styles.navRowIcon}>
                <Settings size={18} color={colors.text} />
              </View>
              <AppText variant="body" style={styles.navRowLabel}>Settings</AppText>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>

            <View style={styles.navRowSeparator} />

            <Pressable
              style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
              onPress={openBrowserPrompt}
            >
              <View style={styles.navRowIcon}>
                <Globe size={18} color={colors.text} />
              </View>
              <AppText variant="body" style={styles.navRowLabel}>Browser</AppText>
              <ChevronRight size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        )}
      </ScrollView>

      {Platform.OS !== 'ios' && (
        <Modal
          visible={browserPromptVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setBrowserPromptVisible(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 32 }}
            onPress={() => setBrowserPromptVisible(false)}
          >
            <Pressable
              style={{ backgroundColor: colors.card, borderRadius: 14, padding: 20, gap: 16 }}
              onPress={() => {}}
            >
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
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                <Pressable onPress={() => setBrowserPromptVisible(false)} style={{ paddingVertical: 8, paddingHorizontal: 16 }}>
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
                  style={{ backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 }}
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
      paddingHorizontal: 24,
      paddingTop: 32,
      paddingBottom: 32,
      gap: 24,
    },
    scrollContentWide: {
      maxWidth: 480,
      alignSelf: 'center' as const,
      width: '100%',
    },
    titleSection: {
      alignItems: 'center',
      gap: 8,
      paddingBottom: 8,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
    },
    emptyState: {
      alignItems: 'center',
      gap: 12,
      paddingVertical: 16,
    },
    emptyTitle: {
      textAlign: 'center',
    },
    emptyBody: {
      textAlign: 'center',
      maxWidth: 260,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 20,
      marginTop: 4,
    },
    primaryButtonText: {
      color: colors.accentText,
    },
    newSessionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingVertical: 18,
      paddingHorizontal: 24,
    },
    newSessionButtonPressed: {
      opacity: 0.85,
    },
    newSessionButtonText: {
      color: colors.accentText,
      fontSize: 18,
    },
    navSection: {
      backgroundColor: colors.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 12,
    },
    navRowPressed: {
      backgroundColor: colors.cardPressed,
    },
    navRowIcon: {
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: colors.barBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navRowLabel: {
      flex: 1,
      fontSize: 16,
    },
    navRowSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.separator,
      marginLeft: 56,
    },
  });
}
