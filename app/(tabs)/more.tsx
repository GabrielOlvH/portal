import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight } from 'lucide-react-native';

import { useStore } from '@/lib/store';
import { getCopilotAuthStatus, logoutCopilot, getUsage, sendTestPushNotification } from '@/lib/api';
import { sendTestNotification } from '@/lib/notifications';
import type { ProviderUsage, ThemeSetting } from '@/lib/types';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';

interface MenuItemProps {
  title: string;
  subtitle?: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  chevronColor: string;
}

function MenuItem({ title, subtitle, onPress, styles, chevronColor }: MenuItemProps) {
  return (
    <Pressable onPress={onPress} style={styles.menuItem}>
      <View style={styles.menuItemContent}>
        <AppText variant="subtitle">{title}</AppText>
        {subtitle && (
          <AppText variant="label" tone="muted">
            {subtitle}
          </AppText>
        )}
      </View>
      <ChevronRight size={20} color={chevronColor} />
    </Pressable>
  );
}

type ProviderStatus = {
  loading?: boolean;
  error?: string;
  ready?: boolean;
};

interface ToggleItemProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  status?: ProviderStatus;
}

function ToggleItem({ title, subtitle, value, onValueChange, styles, colors, status }: ToggleItemProps) {
  const getStatusDisplay = () => {
    if (status?.loading) {
      return (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <AppText variant="label" tone="muted">Checking...</AppText>
        </View>
      );
    }
    if (status?.error) {
      return (
        <AppText variant="label" style={{ color: colors.red }}>
          {status.error}
        </AppText>
      );
    }
    if (status?.ready) {
      return (
        <AppText variant="label" style={{ color: colors.accent }}>
          Ready
        </AppText>
      );
    }
    if (subtitle) {
      return (
        <AppText variant="label" tone="muted">
          {subtitle}
        </AppText>
      );
    }
    return null;
  };

  return (
    <View style={styles.toggleItem}>
      <View style={styles.menuItemContent}>
        <AppText variant="subtitle">{title}</AppText>
        {getStatusDisplay()}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.separator, true: colors.accent }}
        thumbColor={colors.card}
        ios_backgroundColor={colors.separator}
      />
    </View>
  );
}

interface ThemeOptionProps {
  label: string;
  value: ThemeSetting;
  selected: boolean;
  onSelect: (value: ThemeSetting) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}

function ThemeOption({ label, value, selected, onSelect, styles, colors }: ThemeOptionProps) {
  return (
    <Pressable
      onPress={() => onSelect(value)}
      style={[styles.themeOption, selected && { backgroundColor: colors.accent }]}
    >
      <AppText
        variant="label"
        style={{ color: selected ? colors.accentText : colors.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export default function MoreTabScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hosts, preferences, updateUsageCardVisibility, updateNotificationSettings, updateTheme } = useStore();
  const host = hosts[0];

  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotAuthenticated, setCopilotAuthenticated] = useState(false);
  const [copilotUsage, setCopilotUsage] = useState<ProviderUsage | null>(null);
  const [claudeUsage, setClaudeUsage] = useState<ProviderUsage | null>(null);
  const [codexUsage, setCodexUsage] = useState<ProviderUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [testNotificationLoading, setTestNotificationLoading] = useState(false);
  const [testPushLoading, setTestPushLoading] = useState(false);

  const fetchCopilotStatus = useCallback(async () => {
    if (!host) {
      setUsageLoading(false);
      return;
    }
    setCopilotLoading(true);
    setUsageLoading(true);
    try {
      const [statusRes, usageRes] = await Promise.all([
        getCopilotAuthStatus(host),
        getUsage(host),
      ]);
      setCopilotAuthenticated(statusRes.authenticated);
      setCopilotUsage(usageRes.copilot ?? null);
      setClaudeUsage(usageRes.claude ?? null);
      setCodexUsage(usageRes.codex ?? null);
    } catch {
      setCopilotAuthenticated(false);
      setCopilotUsage(null);
      setClaudeUsage({ error: 'fetch failed' });
      setCodexUsage({ error: 'fetch failed' });
    } finally {
      setCopilotLoading(false);
      setUsageLoading(false);
    }
  }, [host]);

  useFocusEffect(
    useCallback(() => {
      fetchCopilotStatus();
    }, [fetchCopilotStatus])
  );

  const handleCopilotConnect = () => {
    if (!host) return;
    router.push(`/copilot/auth?hostId=${host.id}`);
  };

  const handleCopilotDisconnect = () => {
    if (!host) return;
    Alert.alert(
      'Disconnect Copilot',
      'Are you sure you want to disconnect GitHub Copilot?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setCopilotLoading(true);
            try {
              await logoutCopilot(host);
              setCopilotAuthenticated(false);
              setCopilotUsage(null);
            } catch {
              Alert.alert('Error', 'Failed to disconnect Copilot');
            } finally {
              setCopilotLoading(false);
            }
          },
        },
      ]
    );
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Card style={styles.card}>
          <MenuItem
            title="Projects"
            subtitle="Quick-launch commands and agents"
            onPress={() => router.push('/projects')}
            styles={styles}
            chevronColor={colors.textSecondary}
          />
          <View style={styles.separator} />
          <MenuItem
            title="Ports"
            subtitle="View and manage active ports"
            onPress={() => router.push('/ports')}
            styles={styles}
            chevronColor={colors.textSecondary}
          />
        </Card>

        <Card style={styles.card}>
          <View style={styles.copilotItem}>
            <View style={styles.menuItemContent}>
              <AppText variant="subtitle">GitHub Copilot</AppText>
              {copilotLoading ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : copilotAuthenticated ? (
                <>
                  <AppText variant="label" tone="accent">Connected</AppText>
                  {copilotUsage && (
                    <AppText variant="label" tone="muted">
                      Premium: {copilotUsage.session?.percentLeft ?? '—'}% • Chat: {copilotUsage.weekly?.percentLeft ?? '—'}%
                    </AppText>
                  )}
                </>
              ) : (
                <AppText variant="label" tone="muted">Not connected</AppText>
              )}
            </View>
            <Pressable
              onPress={copilotAuthenticated ? handleCopilotDisconnect : handleCopilotConnect}
              disabled={copilotLoading || !host}
              style={styles.copilotButton}
            >
              <AppText variant="caps" tone={copilotAuthenticated ? 'clay' : 'accent'}>
                {copilotAuthenticated ? 'Disconnect' : 'Connect'}
              </AppText>
            </Pressable>
          </View>
        </Card>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <AppText variant="subtitle">Main page usage</AppText>
            <AppText variant="label" tone="muted">
              Choose which provider cards appear on the Sessions tab.
            </AppText>
          </View>
          <View style={styles.separator} />
          <ToggleItem
            title="Claude Code"
            value={preferences.usageCards.claude}
            onValueChange={(value) => updateUsageCardVisibility({ claude: value })}
            styles={styles}
            colors={colors}
            status={
              usageLoading
                ? { loading: true }
                : claudeUsage?.error
                  ? { error: claudeUsage.error }
                  : claudeUsage
                    ? { ready: true }
                    : { error: 'Not detected' }
            }
          />
          <View style={styles.separator} />
          <ToggleItem
            title="Codex"
            value={preferences.usageCards.codex}
            onValueChange={(value) => updateUsageCardVisibility({ codex: value })}
            styles={styles}
            colors={colors}
            status={
              usageLoading
                ? { loading: true }
                : codexUsage?.error
                  ? { error: codexUsage.error }
                  : codexUsage
                    ? { ready: true }
                    : { error: 'Not detected' }
            }
          />
          <View style={styles.separator} />
          <ToggleItem
            title="GitHub Copilot"
            value={preferences.usageCards.copilot}
            onValueChange={(value) => updateUsageCardVisibility({ copilot: value })}
            styles={styles}
            colors={colors}
            status={
              copilotLoading
                ? { loading: true }
                : copilotAuthenticated
                  ? { ready: true }
                  : { error: 'Not connected' }
            }
          />
        </Card>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <AppText variant="subtitle">Notifications</AppText>
            <AppText variant="label" tone="muted">
              Manage push alerts and live task updates.
            </AppText>
          </View>
          <View style={styles.separator} />
          <ToggleItem
            title="Push notifications"
            subtitle="Alerts when a task pauses"
            value={preferences.notifications.pushEnabled}
            onValueChange={(value) => updateNotificationSettings({ pushEnabled: value })}
            styles={styles}
            colors={colors}
          />
          <View style={styles.separator} />
          <ToggleItem
            title="Live updates"
            subtitle="Live Activity on iOS and ongoing notification on Android"
            value={preferences.notifications.liveEnabled}
            onValueChange={(value) => updateNotificationSettings({ liveEnabled: value })}
            styles={styles}
            colors={colors}
          />
          <View style={styles.separator} />
          <Pressable
            onPress={async () => {
              if (!host) {
                Alert.alert('No host', 'Add a host to send a push test.');
                return;
              }
              if (!preferences.notifications.pushEnabled) {
                Alert.alert('Push disabled', 'Enable push notifications to send a test alert.');
                return;
              }
              setTestPushLoading(true);
              try {
                const result = await sendTestPushNotification(host, {
                  title: 'Bridge',
                  body: 'Test push notification',
                });
                if (result.count && result.count > 0) {
                  Alert.alert('Push sent', `Sent to ${result.count} device(s).`);
                } else {
                  Alert.alert('No devices registered', 'Open the app to register this device, then try again.');
                }
              } catch (err) {
                Alert.alert('Failed to send', err instanceof Error ? err.message : 'Unable to send test push.');
              } finally {
                setTestPushLoading(false);
              }
            }}
            disabled={testPushLoading}
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed,
            ]}
          >
            <View style={styles.menuItemContent}>
              <AppText variant="subtitle">Send test push</AppText>
              <AppText variant="label" tone="muted">
                From server via Expo Push
              </AppText>
            </View>
            {testPushLoading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <AppText variant="caps" tone="accent">
                Send
              </AppText>
            )}
          </Pressable>
          <View style={styles.separator} />
          <Pressable
            onPress={async () => {
              if (!preferences.notifications.pushEnabled) {
                Alert.alert('Push disabled', 'Enable push notifications to send a test alert.');
                return;
              }
              setTestNotificationLoading(true);
              const result = await sendTestNotification();
              setTestNotificationLoading(false);

              if (result.status === 'success') {
                Alert.alert('Test notification sent', `Notification id: ${result.id}`);
              } else if (result.status === 'denied') {
                Alert.alert('Permission not granted', 'Enable notifications in system settings and try again.');
              } else {
                Alert.alert('Failed to send', result.message);
              }
            }}
            disabled={testNotificationLoading}
            style={({ pressed }) => [
              styles.menuItem,
              pressed && styles.menuItemPressed,
            ]}
          >
            <View style={styles.menuItemContent}>
              <AppText variant="subtitle">Send test notification</AppText>
              <AppText variant="label" tone="muted">
                Local alert to confirm permissions
              </AppText>
            </View>
            {testNotificationLoading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <AppText variant="caps" tone="accent">
                Send
              </AppText>
            )}
          </Pressable>
        </Card>

        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <AppText variant="subtitle">Appearance</AppText>
            <AppText variant="label" tone="muted">
              Choose your preferred theme
            </AppText>
          </View>
          <View style={styles.separator} />
          <View style={styles.themeSelector}>
            <ThemeOption
              label="Light"
              value="light"
              selected={preferences.theme === 'light'}
              onSelect={updateTheme}
              styles={styles}
              colors={colors}
            />
            <ThemeOption
              label="Dark"
              value="dark"
              selected={preferences.theme === 'dark'}
              onSelect={updateTheme}
              styles={styles}
              colors={colors}
            />
            <ThemeOption
              label="System"
              value="system"
              selected={preferences.theme === 'system'}
              onSelect={updateTheme}
              styles={styles}
              colors={colors}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  menuItemPressed: {
    backgroundColor: colors.cardPressed,
  },
  menuItemContent: {
    flex: 1,
    gap: 2,
  },
  separator: {
    height: 1,
    backgroundColor: colors.separator,
    marginHorizontal: theme.spacing.md,
  },
  sectionHeader: {
    padding: theme.spacing.md,
    gap: 2,
  },
  copilotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  copilotButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  themeSelector: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  themeOption: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    backgroundColor: colors.separator,
  },
});
