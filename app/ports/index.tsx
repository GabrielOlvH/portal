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
import { PortRow } from '@/components/PortRow';
import { PortGroup } from '@/components/PortGroup';
import { TunnelRow } from '@/components/TunnelRow';
import { SearchBar } from '@/components/SearchBar';
import { CreateTunnelModal } from '@/components/CreateTunnelModal';
import { useStore } from '@/lib/store';
import { getPorts, killPorts, getTunnels, closeTunnel } from '@/lib/api';
import { PortInfo, Tunnel } from '@/lib/types';
import { theme } from '@/lib/theme';
import { systemColors } from '@/lib/colors';
import { ThemeColors, useTheme } from '@/lib/useTheme';

type ViewMode = 'list' | 'grouped';

export default function PortsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { hosts, ready } = useStore();

  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [tunnelModalOpen, setTunnelModalOpen] = useState(false);
  const [tunnelPrefillPort, setTunnelPrefillPort] = useState<number | undefined>();

  const currentHost = useMemo(() => {
    if (selectedHostId) {
      return hosts.find((h) => h.id === selectedHostId) || null;
    }
    return hosts.length > 0 ? hosts[0] : null;
  }, [hosts, selectedHostId]);

  const {
    data: portsData,
    isFetching: refreshingPorts,
    refetch: refetchPorts,
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

  const {
    data: tunnelsData,
    isFetching: refreshingTunnels,
    refetch: refetchTunnels,
  } = useQuery({
    queryKey: ['tunnels', currentHost?.id],
    queryFn: async () => {
      if (!currentHost) return { tunnels: [] };
      return getTunnels(currentHost);
    },
    enabled: ready && !!currentHost,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  const ports = portsData?.ports || [];
  const tunnels = tunnelsData?.tunnels || [];
  const refreshing = refreshingPorts || refreshingTunnels;

  const filteredPorts = useMemo(() => {
    if (!searchQuery.trim()) return ports;
    const q = searchQuery.toLowerCase();
    return ports.filter((p) =>
      String(p.port).includes(q) ||
      p.process.toLowerCase().includes(q) ||
      (p.command && p.command.toLowerCase().includes(q))
    );
  }, [ports, searchQuery]);

  const groupedPorts = useMemo(() => {
    const groups = new Map<string, PortInfo[]>();
    for (const port of filteredPorts) {
      const key = port.process;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(port);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredPorts]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const refetch = useCallback(() => {
    refetchPorts();
    refetchTunnels();
  }, [refetchPorts, refetchTunnels]);

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

  const closeTunnelMutation = useMutation({
    mutationFn: async (tunnelId: string) => {
      if (!currentHost) throw new Error('No host selected');
      return closeTunnel(currentHost, tunnelId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tunnels', currentHost?.id] });
    },
    onError: (err) => {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to close tunnel');
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

  const handleCloseTunnel = useCallback(
    (tunnel: Tunnel) => {
      Alert.alert(
        'Close Port Forward',
        `Close forward :${tunnel.listenPort} → :${tunnel.targetPort}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Close',
            style: 'destructive',
            onPress: () => closeTunnelMutation.mutate(tunnel.id),
          },
        ]
      );
    },
    [closeTunnelMutation]
  );

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

  const renderPortRow = useCallback(
    (port: PortInfo, index: number) => (
      <FadeIn key={`${port.pid}-${port.port}`} delay={index * 30}>
        <PortRow
          port={port}
          selected={selectedPids.has(port.pid)}
          selectionMode={selectionMode}
          onToggleSelect={() => toggleSelection(port.pid)}
          onKill={() => handleKillSingle(port)}
        />
      </FadeIn>
    ),
    [selectedPids, selectionMode, toggleSelection, handleKillSingle]
  );

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">Ports</AppText>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.viewToggle, viewMode === 'grouped' && styles.viewToggleActive]}
            onPress={() => setViewMode(viewMode === 'list' ? 'grouped' : 'list')}
          >
            <AppText variant="label" style={viewMode === 'grouped' ? styles.viewToggleTextActive : undefined}>
              {viewMode === 'list' ? '≡' : '⊞'}
            </AppText>
          </Pressable>
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
      </View>

      {hosts.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hostSelector}
          style={styles.hostSelectorContainer}
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
                  { backgroundColor: host.color || colors.accent },
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

      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search ports, processes..."
      />

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
            onRefresh={refetch}
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
        ) : (
          <>
            {/* Port Forwards Section */}
            {tunnels.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <AppText variant="subtitle" tone="muted">Port Forwards</AppText>
                  <AppText variant="label" tone="muted">{tunnels.length}</AppText>
                </View>
                {tunnels.map((tunnel, index) => (
                  <FadeIn key={tunnel.id} delay={index * 30}>
                    <TunnelRow
                      tunnel={tunnel}
                      onClose={() => handleCloseTunnel(tunnel)}
                    />
                  </FadeIn>
                ))}
              </View>
            )}

            {/* Create Port Forward Button */}
            <Pressable
              style={styles.createTunnelButton}
              onPress={() => {
                setTunnelPrefillPort(undefined);
                setTunnelModalOpen(true);
              }}
            >
              <AppText variant="label" style={styles.createTunnelText}>+ Create Port Forward</AppText>
            </Pressable>

            {/* Ports Section */}
            {filteredPorts.length === 0 ? (
              <FadeIn style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <AppText variant="title" style={styles.emptyIconText}>:</AppText>
                </View>
                <AppText variant="subtitle">
                  {searchQuery ? 'No matching ports' : 'No active ports'}
                </AppText>
                <AppText variant="body" tone="muted" style={styles.emptyBody}>
                  {searchQuery
                    ? 'Try a different search term.'
                    : `No processes using ports 3000-9999 on ${currentHost.name}.`}
                </AppText>
              </FadeIn>
            ) : viewMode === 'grouped' ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <AppText variant="subtitle" tone="muted">Ports by Process</AppText>
                  <AppText variant="label" tone="muted">{filteredPorts.length}</AppText>
                </View>
                {groupedPorts.map(([processName, processPorts]) => (
                  <PortGroup key={processName} processName={processName} ports={processPorts}>
                    {processPorts.map((port) => (
                      <View key={`${port.pid}-${port.port}`} style={styles.groupedPortRow}>
                        <PortRow
                          port={port}
                          selected={selectedPids.has(port.pid)}
                          selectionMode={selectionMode}
                          onToggleSelect={() => toggleSelection(port.pid)}
                          onKill={() => handleKillSingle(port)}
                        />
                      </View>
                    ))}
                  </PortGroup>
                ))}
              </View>
            ) : (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <AppText variant="subtitle" tone="muted">Active Ports</AppText>
                  <AppText variant="label" tone="muted">{filteredPorts.length}</AppText>
                </View>
                {filteredPorts.map((port, index) => renderPortRow(port, index))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <CreateTunnelModal
        isOpen={tunnelModalOpen}
        onClose={() => setTunnelModalOpen(false)}
        host={currentHost}
        prefillPort={tunnelPrefillPort}
        onCreated={() => refetchTunnels()}
      />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardPressed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleActive: {
    backgroundColor: colors.accent,
  },
  viewToggleTextActive: {
    color: colors.accentText,
  },
  modeButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.cardPressed,
  },
  modeButtonActive: {
    backgroundColor: colors.accent,
  },
  modeButtonTextActive: {
    color: colors.accentText,
  },
  hostSelectorContainer: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: theme.spacing.sm,
  },
  hostSelector: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.sm,
    backgroundColor: colors.cardPressed,
    marginRight: 8,
  },
  hostChipActive: {
    backgroundColor: colors.accent,
  },
  hostChipTextActive: {
    color: colors.accentText,
  },
  hostDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  killSelectedButton: {
    backgroundColor: colors.red,
    paddingVertical: 14,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  killSelectedText: {
    color: colors.accentText,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    paddingHorizontal: 4,
  },
  groupedPortRow: {
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  createTunnelButton: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderStyle: 'dashed',
    borderRadius: theme.radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  createTunnelText: {
    color: colors.textSecondary,
  },
  empty: {
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadow.card,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.cardPressed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  emptyIconText: {
    color: colors.textSecondary,
  },
  emptyBody: {
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: theme.radii.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  ctaText: {
    color: colors.accentText,
  },
});
