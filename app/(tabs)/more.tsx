import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight } from 'lucide-react-native';

import { useStore } from '@/lib/store';
import { getCopilotAuthStatus, logoutCopilot, getUsage } from '@/lib/api';
import type { ProviderUsage } from '@/lib/types';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { palette, theme } from '@/lib/theme';

interface MenuItemProps {
  title: string;
  subtitle?: string;
  onPress: () => void;
}

function MenuItem({ title, subtitle, onPress }: MenuItemProps) {
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
      <ChevronRight size={20} color={palette.muted} />
    </Pressable>
  );
}

export default function MoreTabScreen() {
  const router = useRouter();
  const { hosts } = useStore();
  const host = hosts[0];

  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotAuthenticated, setCopilotAuthenticated] = useState(false);
  const [copilotUsage, setCopilotUsage] = useState<ProviderUsage | null>(null);

  const fetchCopilotStatus = useCallback(async () => {
    if (!host) return;
    setCopilotLoading(true);
    try {
      const [statusRes, usageRes] = await Promise.all([
        getCopilotAuthStatus(host),
        getUsage(host),
      ]);
      setCopilotAuthenticated(statusRes.authenticated);
      setCopilotUsage(usageRes.copilot ?? null);
    } catch {
      setCopilotAuthenticated(false);
      setCopilotUsage(null);
    } finally {
      setCopilotLoading(false);
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
          />
          <View style={styles.separator} />
          <MenuItem
            title="Ports"
            subtitle="View and manage active ports"
            onPress={() => router.push('/ports')}
          />
          <View style={styles.separator} />
          <MenuItem
            title="Keybinds"
            subtitle="Terminal keyboard shortcuts"
            onPress={() => router.push('/keybinds')}
          />
        </Card>

        <Card style={styles.card}>
          <View style={styles.copilotItem}>
            <View style={styles.menuItemContent}>
              <AppText variant="subtitle">GitHub Copilot</AppText>
              {copilotLoading ? (
                <ActivityIndicator size="small" color={palette.muted} />
              ) : copilotAuthenticated ? (
                <>
                  <AppText variant="label" tone="accent">Connected</AppText>
                  {copilotUsage && (
                    <AppText variant="label" tone="muted">
                      Session: {copilotUsage.session?.percentLeft ?? '—'}% • Weekly: {copilotUsage.weekly?.percentLeft ?? '—'}%
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
          <MenuItem
            title="Settings"
            subtitle="App preferences"
            onPress={() => {
              // TODO: Navigate to settings when implemented
            }}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  menuItemContent: {
    flex: 1,
    gap: 2,
  },
  separator: {
    height: 1,
    backgroundColor: palette.line,
    marginHorizontal: theme.spacing.md,
  },
  copilotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  copilotButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
});
