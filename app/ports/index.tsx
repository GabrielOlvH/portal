import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { Card } from '@/components/Card';
import { PortRow } from '@/components/PortRow';
import { useStore } from '@/lib/store';
import { getPorts, killPorts } from '@/lib/api';
import { Host, PortInfo } from '@/lib/types';
import { palette, theme } from '@/lib/theme';
import { systemColors } from '@/lib/colors';

export default function PortsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hosts, ready } = useStore();

  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set());

  // Auto-select first host if none selected
  const currentHost = useMemo(() => {
    if (selectedHostId) {
      return hosts.find((h) => h.id === selectedHostId) || null;
    }
    return hosts.length > 0 ? hosts[0] : null;
  }, [hosts, selectedHostId]);

  const {
    data: portsData,
    isFetching: refreshing,
    refetch,
  } = useQuery({
    queryKey: ['ports', currentHost?.id],
    queryFn: async () => {
      if (!currentHost) return { ports: [] };
      return getPorts(currentHost);
    },
    enabled: ready && !!currentHost,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const ports = portsData?.ports || [];

  const killMutation = useMutation({
    mutationFn: async (pids: number[]) => {
      if (!currentHost) throw new Error('No host selected');
      return killPorts(currentHost, pids);
    },
    onSuccess: (result) => {
      if (result.killed.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['ports', currentHost?.id] });
      }
      if (result.failed.length > 0) {
        const failedInfo = result.failed.map((f) => `PID ${f.pid}: ${f.error}`).join('\n');
        Alert.alert('Some processes failed to kill', failedInfo);
      }
      setSelectionMode(false);
      setSelectedPids(new Set());
    },
    onError: (err) => {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to kill processes');
    },
  });

  const handleKillSingle = useCallback(
    (port: PortInfo) => {
      Alert.alert(
        'Kill Process',
        `Kill ${port.process} (PID ${port.pid}) on port ${port.port}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Kill',
            style: 'destructive',
            onPress: () => killMutation.mutate([port.pid]),
          },
        ]
      );
    },
    [killMutation]
  );

  const handleKillSelected = useCallback(() => {
    const pids = Array.from(selectedPids);
    Alert.alert(
      'Kill Selected',
      `Kill ${pids.length} process${pids.length > 1 ? 'es' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Kill All',
          style: 'destructive',
          onPress: () => killMutation.mutate(pids),
        },
      ]
    );
  }, [selectedPids, killMutation]);

  const toggleSelection = useCallback((pid: number) => {
    setSelectedPids((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
      } else {
        next.add(pid);
      }
      return next;
    });
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => !prev);
    setSelectedPids(new Set());
  }, []);

  const portRows = useMemo(
    () =>
      ports.map((port, index) => (
        <FadeIn key={`${port.pid}-${port.port}`} delay={index * 30}>
          <PortRow
            port={port}
            selected={selectedPids.has(port.pid)}
            selectionMode={selectionMode}
            onToggleSelect={() => toggleSelection(port.pid)}
            onKill={() => handleKillSingle(port)}
          />
        </FadeIn>
      )),
    [ports, selectedPids, selectionMode, toggleSelection, handleKillSingle]
  );

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">Ports</AppText>
        <Pressable
          style={[styles.modeButton, selectionMode && styles.modeButtonActive]}
          onPress={toggleSelectionMode}
        >
          <AppText
            variant="label"
            style={selectionMode ? styles.modeButtonTextActive : undefined}
          >
            {selectionMode ? 'Done' : 'Select'}
          </AppText>
        </Pressable>
      </View>

      {/* Host Selector */}
      {hosts.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hostSelector}
        >
          {hosts.map((host) => (
            <Pressable
              key={host.id}
              style={[
                styles.hostChip,
                currentHost?.id === host.id && styles.hostChipActive,
              ]}
              onPress={() => setSelectedHostId(host.id)}
            >
              <View
                style={[
                  styles.hostDot,
                  { backgroundColor: host.color || palette.accent },
                ]}
              />
              <AppText
                variant="label"
                style={currentHost?.id === host.id ? styles.hostChipTextActive : undefined}
              >
                {host.name}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Kill Selected Button */}
      {selectionMode && selectedPids.size > 0 && (
        <Pressable style={styles.killSelectedButton} onPress={handleKillSelected}>
          <AppText variant="subtitle" style={styles.killSelectedText}>
            Kill {selectedPids.size} Selected
          </AppText>
        </Pressable>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => refetch()}
            tintColor={systemColors.blue as string}
          />
        }
      >
        {!currentHost ? (
          <FadeIn style={styles.empty}>
            <View style={styles.emptyIcon}>
              <AppText variant="title" style={styles.emptyIconText}>~</AppText>
            </View>
            <AppText variant="subtitle">No hosts configured</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyBody}>
              Add a host to view active ports.
            </AppText>
            <Pressable style={styles.cta} onPress={() => router.push('/hosts/new')}>
              <AppText variant="subtitle" style={styles.ctaText}>Add Host</AppText>
            </Pressable>
          </FadeIn>
        ) : ports.length === 0 ? (
          <FadeIn style={styles.empty}>
            <View style={styles.emptyIcon}>
              <AppText variant="title" style={styles.emptyIconText}>:</AppText>
            </View>
            <AppText variant="subtitle">No active ports</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyBody}>
              No processes using ports 3000-9999 on {currentHost.name}.
            </AppText>
          </FadeIn>
        ) : (
          portRows
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modeButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: palette.surfaceAlt,
  },
  modeButtonActive: {
    backgroundColor: palette.accent,
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
  },
  hostSelector: {
    paddingBottom: theme.spacing.sm,
    gap: 8,
  },
  hostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radii.md,
    backgroundColor: palette.surfaceAlt,
    marginRight: 8,
  },
  hostChipActive: {
    backgroundColor: palette.accent,
  },
  hostChipTextActive: {
    color: '#FFFFFF',
  },
  hostDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  killSelectedButton: {
    backgroundColor: palette.clay,
    paddingVertical: 14,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  killSelectedText: {
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  empty: {
    backgroundColor: palette.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadow.card,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  emptyIconText: {
    color: palette.muted,
  },
  emptyBody: {
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  cta: {
    backgroundColor: palette.accent,
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  ctaText: {
    color: '#FFFFFF',
  },
});
