import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { List, LayoutGrid, CheckSquare, XSquare, Plus, ZapOff } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { FadeIn } from '@/components/FadeIn';
import { PortRow } from '@/components/PortRow';
import { PortGroup } from '@/components/PortGroup';
import { TunnelRow } from '@/components/TunnelRow';
import { SearchBar } from '@/components/SearchBar';
import { CreateTunnelModal } from '@/components/CreateTunnelModal';
import { GlassCard } from '@/components/ui/GlassCard';
import { useWindowActions } from '@/lib/useWindowActions';
import { useStore } from '@/lib/store';
import { getPorts, killPorts, getTunnels, closeTunnel } from '@/lib/api';
import { PortInfo, Tunnel } from '@/lib/types';
import { theme } from '@/lib/theme';
import { systemColors, withAlpha } from '@/lib/colors';
import { ThemeColors, useTheme } from '@/lib/useTheme';

type ViewMode = 'list' | 'grouped';

export function PortsWindow() {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { params, isActive } = useWindowActions();
  const { hosts, ready } = useStore();

  const [selectedHostId, setSelectedHostId] = useState<string | null>(params.hostId ?? null);
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
    enabled: ready && !!currentHost && isActive,
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
    enabled: ready && !!currentHost && isActive,
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
      if (!groups.has(key)) groups.set(key, []);
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
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
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
    <View style={styles.container}>
      <View style={styles.header}>
        <AppText variant="title">Ports</AppText>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.actionBtn, viewMode === 'grouped' && styles.actionBtnActive]}
            onPress={() => setViewMode(viewMode === 'list' ? 'grouped' : 'list')}
          >
            {viewMode === 'list' ? (
              <List size={20} color={colors.text} />
            ) : (
              <LayoutGrid size={20} color={colors.accentText} />
            )}
          </Pressable>
          <Pressable
            style={[styles.actionBtn, selectionMode && styles.actionBtnActive]}
            onPress={toggleSelectionMode}
          >
            {selectionMode ? (
              <XSquare size={20} color={colors.accentText} />
            ) : (
              <CheckSquare size={20} color={colors.text} />
            )}
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
        <FadeIn delay={0}>
          <Pressable style={styles.killSelectedButton} onPress={handleKillSelected}>
            <ZapOff size={20} color={colors.accentText} />
            <AppText variant="subtitle" style={styles.killSelectedText}>
              Kill {selectedPids.size} Selected
            </AppText>
          </Pressable>
        </FadeIn>
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
              <ZapOff size={32} color={colors.textMuted} />
            </View>
            <AppText variant="subtitle">No hosts configured</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyBody}>
              Add a host to view active ports.
            </AppText>
          </FadeIn>
        ) : (
          <>
            {tunnels.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <AppText variant="subtitle" tone="muted">Port Forwards</AppText>
                  <View style={styles.badge}>
                    <AppText variant="caps" tone="base">{tunnels.length}</AppText>
                  </View>
                </View>
                {tunnels.map((tunnel, index) => (
                  <FadeIn key={tunnel.id} delay={index * 30}>
                    <TunnelRow tunnel={tunnel} onClose={() => handleCloseTunnel(tunnel)} />
                  </FadeIn>
                ))}
              </View>
            )}

            <Pressable
              style={styles.createTunnelButton}
              onPress={() => {
                setTunnelPrefillPort(undefined);
                setTunnelModalOpen(true);
              }}
            >
              <Plus size={20} color={colors.textSecondary} />
              <AppText variant="label" style={styles.createTunnelText}>Create Port Forward</AppText>
            </Pressable>

            {filteredPorts.length === 0 ? (
              <FadeIn style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <ZapOff size={32} color={colors.textMuted} />
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
                  <View style={styles.badge}>
                    <AppText variant="caps" tone="base">{filteredPorts.length}</AppText>
                  </View>
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
                  <View style={styles.badge}>
                    <AppText variant="caps" tone="base">{filteredPorts.length}</AppText>
                  </View>
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
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(colors.text, 0.05),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: colors.accent,
  },
  hostSelectorContainer: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 16,
  },
  hostSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
  },
  hostChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 100,
    backgroundColor: withAlpha(colors.text, 0.05),
    marginRight: 12,
  },
  hostChipActive: {
    backgroundColor: colors.accent,
  },
  hostChipTextActive: {
    color: colors.accentText,
    fontWeight: '600',
  },
  hostDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  killSelectedButton: {
    flexDirection: 'row',
    backgroundColor: colors.red,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    shadowColor: colors.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  killSelectedText: {
    color: colors.accentText,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: 60,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  badge: {
    backgroundColor: withAlpha(colors.text, 0.05),
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  groupedPortRow: {
    marginBottom: 8,
  },
  createTunnelButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: withAlpha(colors.text, 0.1),
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 24,
  },
  createTunnelText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  empty: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: withAlpha(colors.text, 0.02),
    borderRadius: 20,
    marginTop: 20,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: withAlpha(colors.text, 0.05),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyBody: {
    textAlign: 'center',
    marginTop: 8,
  },
});
