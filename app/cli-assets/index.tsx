import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { FadeIn } from '@/components/FadeIn';
import { SearchBar } from '@/components/SearchBar';
import { useStore } from '@/lib/store';
import { deleteCliAsset, getCliAssets, upsertCliAsset } from '@/lib/api';
import { AiProvider, CliAsset, CliAssetType } from '@/lib/types';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';

const PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
};

const PROVIDER_COLORS: Record<AiProvider, string> = {
  claude: '#D97706',
  codex: '#059669',
  opencode: '#7C3AED',
};

const ASSET_TYPES: { id: CliAssetType; label: string; claudeOnly?: boolean }[] = [
  { id: 'skill', label: 'Skills' },
  { id: 'rule', label: 'Rules' },
  { id: 'agent', label: 'Agents', claudeOnly: true },
  { id: 'mcp', label: 'MCPs' },
];

// Which providers support which asset types
const PROVIDER_SUPPORT: Record<CliAssetType, AiProvider[]> = {
  skill: ['claude', 'codex', 'opencode'],
  rule: ['claude', 'codex', 'opencode'],
  agent: ['claude'], // Only Claude supports agents
  mcp: ['claude', 'codex', 'opencode'],
};

interface GroupedAsset {
  name: string;
  filename: string;
  providers: Map<AiProvider, CliAsset>;
  latestUpdate: number;
  description?: string;
  userInvocable?: boolean;
  keywords?: string[];
}

function groupAssetsByName(assets: CliAsset[]): GroupedAsset[] {
  const groups = new Map<string, GroupedAsset>();

  for (const asset of assets) {
    const key = asset.meta?.filename ?? asset.name;
    if (!groups.has(key)) {
      groups.set(key, {
        name: asset.name,
        filename: key,
        providers: new Map(),
        latestUpdate: 0,
        description: asset.meta?.description,
        userInvocable: asset.meta?.userInvocable,
        keywords: asset.meta?.keywords,
      });
    }
    const group = groups.get(key)!;
    group.providers.set(asset.provider, asset);
    if (asset.updatedAt && asset.updatedAt > group.latestUpdate) {
      group.latestUpdate = asset.updatedAt;
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildPreview(asset: CliAsset): string {
  if (!asset.content) return '';
  if (asset.type === 'mcp' && !asset.meta?.raw) {
    try {
      const parsed = JSON.parse(asset.content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const command = (parsed as { command?: string }).command;
        const url = (parsed as { url?: string }).url;
        if (command) return `command: ${command}`;
        if (url) return `url: ${url}`;
      }
    } catch {}
  }

  let content = asset.content;

  // Strip YAML frontmatter (---...---)
  const frontmatterMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
  if (frontmatterMatch) {
    content = content.slice(frontmatterMatch[0].length);
  }

  // Get first meaningful line (skip empty lines and headers)
  const lines = content.split('\n').filter((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#');
  });

  return lines.slice(0, 2).join(' ').trim().slice(0, 100);
}

export default function CliAssetsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hosts, ready } = useStore();

  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [assetType, setAssetType] = useState<CliAssetType>('skill');
  const [searchQuery, setSearchQuery] = useState('');

  const sheetRef = useRef<BottomSheet>(null);
  const [modalMode, setModalMode] = useState<'new' | 'edit' | 'view'>('new');
  const [assetName, setAssetName] = useState('');
  const [assetContent, setAssetContent] = useState('');
  const [targetProviders, setTargetProviders] = useState<AiProvider[]>([]);
  const [saving, setSaving] = useState(false);

  const currentHost = useMemo(() => {
    if (selectedHostId) {
      return hosts.find((h) => h.id === selectedHostId) || null;
    }
    return hosts.length > 0 ? hosts[0] : null;
  }, [hosts, selectedHostId]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['cli-assets', currentHost?.id, assetType],
    queryFn: async () => {
      if (!currentHost) return { assets: [] };
      return getCliAssets(currentHost, { type: assetType });
    },
    enabled: ready && !!currentHost,
    staleTime: 10_000,
  });

  const groupedAssets = useMemo(() => {
    const assets = data?.assets ?? [];
    const groups = groupAssetsByName(assets);

    if (!searchQuery.trim()) return groups;

    const q = searchQuery.toLowerCase();
    return groups.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      g.filename.toLowerCase().includes(q)
    );
  }, [data?.assets, searchQuery]);

  const openSheet = useCallback(() => {
    requestAnimationFrame(() => {
      sheetRef.current?.snapToIndex(0);
    });
  }, []);

  const closeSheet = useCallback(() => {
    sheetRef.current?.close();
    setAssetName('');
    setAssetContent('');
    setTargetProviders([]);
  }, []);

  const handleNew = useCallback(() => {
    setModalMode('new');
    setAssetName('');
    setAssetContent('');
    setTargetProviders(PROVIDER_SUPPORT[assetType]);
    openSheet();
  }, [assetType, openSheet]);

  const handleEdit = useCallback((group: GroupedAsset, provider: AiProvider) => {
    const asset = group.providers.get(provider);
    if (!asset) return;

    setModalMode('edit');
    setAssetName(group.filename);
    setAssetContent(asset.content);
    setTargetProviders([provider]);
    openSheet();
  }, [openSheet]);

  const handleView = useCallback((group: GroupedAsset) => {
    const firstAsset = group.providers.values().next().value;
    if (!firstAsset) return;

    setModalMode('view');
    setAssetName(group.filename);
    setAssetContent(firstAsset.content);
    openSheet();
  }, [openSheet]);

  const handleSync = useCallback((group: GroupedAsset, from: AiProvider) => {
    const asset = group.providers.get(from);
    if (!asset) return;

    const supported = PROVIDER_SUPPORT[assetType];
    const missing = supported.filter((p) => !group.providers.has(p));
    if (missing.length === 0) {
      Alert.alert('Already synced', 'This asset exists in all supported providers.');
      return;
    }

    Alert.alert(
      'Sync Asset',
      `Copy "${group.name}" to ${missing.map((p) => PROVIDER_LABELS[p]).join(', ')}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sync',
          onPress: async () => {
            if (!currentHost) return;
            try {
              await Promise.all(
                missing.map((provider) =>
                  upsertCliAsset(currentHost, {
                    provider,
                    type: assetType,
                    name: group.filename,
                    content: asset.content,
                  })
                )
              );
              refetch();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to sync');
            }
          },
        },
      ]
    );
  }, [assetType, currentHost, refetch]);

  const handleDelete = useCallback((group: GroupedAsset, provider: AiProvider) => {
    if (!currentHost) return;

    Alert.alert(
      'Delete Asset',
      `Delete "${group.name}" from ${PROVIDER_LABELS[provider]}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCliAsset(currentHost, {
                provider,
                type: assetType,
                name: group.filename,
              });
              refetch();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete');
            }
          },
        },
      ]
    );
  }, [assetType, currentHost, refetch]);

  const toggleProvider = useCallback((provider: AiProvider) => {
    setTargetProviders((prev) =>
      prev.includes(provider)
        ? prev.filter((p) => p !== provider)
        : [...prev, provider]
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentHost || saving) return;

    const name = assetName.trim();
    const content = assetContent.trim();

    if (!name) {
      Alert.alert('Missing name', 'Enter a name for this asset.');
      return;
    }
    if (!content) {
      Alert.alert('Missing content', 'Enter content for this asset.');
      return;
    }
    if (targetProviders.length === 0) {
      Alert.alert('No providers', 'Select at least one provider.');
      return;
    }

    setSaving(true);
    try {
      await Promise.all(
        targetProviders.map((provider) =>
          upsertCliAsset(currentHost, {
            provider,
            type: assetType,
            name,
            content,
          })
        )
      );
      closeSheet();
      refetch();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [assetContent, assetName, assetType, closeSheet, currentHost, refetch, saving, targetProviders]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const snapPoints = useMemo(() => ['70%', '90%'], []);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  if (hosts.length === 0) {
    return (
      <Screen>
        <FadeIn style={styles.empty}>
          <AppText variant="subtitle">No hosts connected</AppText>
          <AppText variant="body" tone="muted" style={styles.emptyHint}>
            Add a host to manage CLI assets.
          </AppText>
        </FadeIn>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <AppText variant="label" tone="muted">← Back</AppText>
        </Pressable>
        <AppText variant="title">CLI Sync</AppText>
        <Pressable style={styles.addBtn} onPress={handleNew}>
          <AppText variant="subtitle" style={styles.addBtnText}>+</AppText>
        </Pressable>
      </View>

      {/* Host selector */}
      {hosts.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hostRow}
        >
          {hosts.map((host) => (
            <Pressable
              key={host.id}
              style={[styles.chip, currentHost?.id === host.id && styles.chipActive]}
              onPress={() => setSelectedHostId(host.id)}
            >
              <View style={[styles.dot, { backgroundColor: host.color || colors.accent }]} />
              <AppText
                variant="label"
                style={currentHost?.id === host.id ? styles.chipTextActive : undefined}
              >
                {host.name}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Type tabs */}
      <View style={styles.tabs}>
        {ASSET_TYPES.map((type) => (
          <Pressable
            key={type.id}
            style={[styles.tab, assetType === type.id && styles.tabActive]}
            onPress={() => setAssetType(type.id)}
          >
            <AppText
              variant="label"
              style={assetType === type.id ? styles.tabTextActive : undefined}
            >
              {type.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={`Search ${assetType}s...`}
      />

      {/* Asset list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent} />
        }
      >
        {groupedAssets.length === 0 ? (
          <FadeIn style={styles.empty}>
            <AppText variant="subtitle">No {assetType}s found</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyHint}>
              {searchQuery ? 'Try a different search.' : 'Create one to get started.'}
            </AppText>
            {!searchQuery && (
              <Pressable style={styles.cta} onPress={handleNew}>
                <AppText variant="label" style={styles.ctaText}>Create {ASSET_TYPES.find((t) => t.id === assetType)?.label.slice(0, -1)}</AppText>
              </Pressable>
            )}
          </FadeIn>
        ) : (
          groupedAssets.map((group, idx) => {
            const firstAsset = group.providers.values().next().value;
            const description = group.description || (firstAsset ? buildPreview(firstAsset) : '');

            return (
              <FadeIn key={group.filename} delay={idx * 25}>
                <Card style={styles.card}>
                  <Pressable onPress={() => handleView(group)}>
                    <View style={styles.cardHeader}>
                      <AppText variant="subtitle" numberOfLines={1} style={styles.cardTitle}>
                        {group.userInvocable ? `/${group.name}` : group.name}
                      </AppText>
                      {group.userInvocable && (
                        <View style={styles.invocableBadge}>
                          <AppText variant="caps" style={styles.invocableText}>slash</AppText>
                        </View>
                      )}
                    </View>
                    {description && (
                      <AppText variant="body" tone="muted" numberOfLines={2} style={styles.description}>
                        {description}
                      </AppText>
                    )}
                  </Pressable>

                  {/* Provider badges */}
                  <View style={styles.providers}>
                    {PROVIDER_SUPPORT[assetType].map((provider) => {
                      const has = group.providers.has(provider);
                      return (
                        <Pressable
                          key={provider}
                          style={[
                            styles.badge,
                            has
                              ? { backgroundColor: PROVIDER_COLORS[provider] }
                              : styles.badgeMissing,
                          ]}
                          onPress={() => {
                            if (has) {
                              handleEdit(group, provider);
                            } else {
                              const source = group.providers.keys().next().value;
                              if (source) handleSync(group, source);
                            }
                          }}
                          onLongPress={() => {
                            if (has) handleDelete(group, provider);
                          }}
                        >
                          <AppText
                            variant="caps"
                            style={has ? styles.badgeText : styles.badgeTextMissing}
                          >
                            {PROVIDER_LABELS[provider].charAt(0)}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>
              </FadeIn>
            );
          })
        )}
      </ScrollView>

      {/* Bottom Sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={closeSheet}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheet}>
          <View style={styles.sheetHeader}>
            <AppText variant="subtitle">
              {modalMode === 'new' ? 'New Asset' : modalMode === 'edit' ? 'Edit Asset' : 'View Asset'}
            </AppText>
            <Pressable onPress={closeSheet}>
              <AppText variant="label" tone="muted">Close</AppText>
            </Pressable>
          </View>

          <Field
            label="Name"
            value={assetName}
            onChangeText={setAssetName}
            editable={modalMode !== 'view'}
            placeholder={assetType === 'mcp' ? 'server-name' : 'asset-name'}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {modalMode === 'view' ? (
            <View style={styles.viewContent}>
              <AppText variant="label" style={styles.viewLabel}>Content</AppText>
              <TextInput
                value={assetContent}
                editable={false}
                multiline
                scrollEnabled
                style={styles.viewer}
              />
            </View>
          ) : (
            <Field
              label="Content"
              value={assetContent}
              onChangeText={setAssetContent}
              placeholder={assetType === 'mcp' ? '{ "command": "...", "args": [] }' : 'Content...'}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              style={styles.contentField}
            />
          )}

          {modalMode !== 'view' && (
            <>
              <AppText variant="label" style={styles.targetLabel}>
                {modalMode === 'new' ? 'Create in:' : 'Save to:'}
              </AppText>
              <View style={styles.targetRow}>
                {PROVIDER_SUPPORT[assetType].map((provider) => {
                  const active = targetProviders.includes(provider);
                  return (
                    <Pressable
                      key={provider}
                      style={[
                        styles.targetChip,
                        active && { backgroundColor: PROVIDER_COLORS[provider], borderColor: PROVIDER_COLORS[provider] },
                      ]}
                      onPress={() => toggleProvider(provider)}
                    >
                      <AppText
                        variant="caps"
                        style={active ? styles.targetTextActive : styles.targetText}
                      >
                        {PROVIDER_LABELS[provider]}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.actions}>
                <Pressable style={styles.cancelBtn} onPress={closeSheet}>
                  <AppText variant="label">Cancel</AppText>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <AppText variant="label" style={styles.saveBtnText}>
                    {saving ? 'Saving...' : 'Save'}
                  </AppText>
                </Pressable>
              </View>
            </>
          )}

          {modalMode === 'view' && (
            <Pressable style={styles.doneBtn} onPress={closeSheet}>
              <AppText variant="label">Done</AppText>
            </Pressable>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing.md,
    },
    addBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
    },
    addBtnText: {
      color: colors.accentText,
      fontSize: 18,
    },
    hostRow: {
      gap: theme.spacing.xs,
      marginBottom: theme.spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: theme.radii.md,
      backgroundColor: colors.card,
    },
    chipActive: {
      backgroundColor: colors.accent,
    },
    chipTextActive: {
      color: colors.accentText,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    tabs: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
      marginBottom: theme.spacing.sm,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: theme.radii.md,
      backgroundColor: colors.card,
    },
    tabActive: {
      backgroundColor: colors.accent,
    },
    tabTextActive: {
      color: colors.accentText,
    },
    list: {
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.sm,
      paddingHorizontal: 2,
    },
    card: {
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardTitle: {
      flex: 1,
    },
    invocableBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: colors.accent + '20',
    },
    invocableText: {
      color: colors.accent,
      fontSize: 10,
    },
    description: {
      marginTop: 4,
    },
    preview: {
      marginTop: 6,
      lineHeight: 18,
    },
    providers: {
      flexDirection: 'row',
      gap: 8,
    },
    badge: {
      width: 28,
      height: 28,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeMissing: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    badgeText: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    badgeTextMissing: {
      color: colors.textMuted,
    },
    empty: {
      backgroundColor: colors.card,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.xl,
      alignItems: 'center',
    },
    emptyHint: {
      textAlign: 'center',
      marginTop: theme.spacing.xs,
    },
    cta: {
      marginTop: theme.spacing.md,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: theme.radii.md,
      backgroundColor: colors.accent,
    },
    ctaText: {
      color: colors.accentText,
    },
    sheet: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.sm,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing.xs,
    },
    contentField: {
      minHeight: 160,
      maxHeight: 280,
      textAlignVertical: 'top',
    },
    viewContent: {
      gap: 6,
    },
    viewLabel: {
      marginBottom: 4,
    },
    viewer: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      borderRadius: theme.radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: colors.text,
      minHeight: 160,
      maxHeight: 280,
      textAlignVertical: 'top',
    },
    targetLabel: {
      marginTop: theme.spacing.xs,
    },
    targetRow: {
      flexDirection: 'row',
      gap: 8,
    },
    targetChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    targetText: {
      color: colors.textSecondary,
    },
    targetTextActive: {
      color: '#FFFFFF',
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: theme.spacing.md,
    },
    cancelBtn: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: theme.radii.md,
      backgroundColor: colors.cardPressed,
    },
    saveBtn: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: theme.radii.md,
      backgroundColor: colors.accent,
    },
    saveBtnDisabled: {
      opacity: 0.6,
    },
    saveBtnText: {
      color: colors.accentText,
    },
    doneBtn: {
      alignSelf: 'center',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: theme.radii.md,
      backgroundColor: colors.cardPressed,
      marginTop: theme.spacing.md,
    },
  });
