import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { AppText } from '@/components/AppText';
import { fetchDirectoryListing } from '@/lib/api';
import { DirectoryItem, Host } from '@/lib/types';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';

type DirectoryBrowserProps = {
  host: Host;
  onSelect: (path: string, name: string) => void;
  onClose: () => void;
};

export function DirectoryBrowser({ host, onSelect, onClose }: DirectoryBrowserProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const listing = await fetchDirectoryListing(host, path);
      setCurrentPath(listing.path);
      setParentPath(listing.parent);
      setItems(listing.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, [host]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.cancelButton}>
          <AppText variant="label" style={styles.cancelText}>Cancel</AppText>
        </Pressable>
        <AppText variant="subtitle">Browse</AppText>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.pathBar}>
        <AppText variant="mono" numberOfLines={1} style={styles.pathText}>
          {currentPath || '...'}
        </AppText>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <AppText variant="body" tone="muted">{error}</AppText>
          <Pressable style={styles.retryButton} onPress={() => loadDirectory(currentPath ?? undefined)}>
            <AppText variant="label" style={styles.retryText}>Retry</AppText>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {parentPath && (
            <Pressable style={styles.row} onPress={() => loadDirectory(parentPath)}>
              <AppText variant="subtitle" style={styles.rowName}>..</AppText>
            </Pressable>
          )}
          {items.length === 0 && !parentPath ? (
            <View style={styles.center}>
              <AppText variant="body" tone="muted">No subdirectories</AppText>
            </View>
          ) : (
            items.map((item) => (
              <View key={item.path} style={styles.row}>
                <Pressable style={styles.rowMain} onPress={() => loadDirectory(item.path)}>
                  <AppText variant="subtitle" style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </AppText>
                  {item.hasPackageJson && (
                    <AppText variant="caps" style={styles.badge}>npm</AppText>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.selectButton, item.hasPackageJson && styles.selectButtonHighlight]}
                  onPress={() => onSelect(item.path, item.name)}
                >
                  <AppText
                    variant="caps"
                    style={item.hasPackageJson ? styles.selectTextHighlight : styles.selectText}
                  >
                    Select
                  </AppText>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  cancelButton: {
    paddingVertical: 4,
  },
  cancelText: {
    color: colors.blue,
  },
  headerSpacer: {
    width: 50,
  },
  pathBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  pathText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  retryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  retryText: {
    color: colors.accentText,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowName: {
    flex: 1,
  },
  badge: {
    color: colors.accent,
    backgroundColor: colors.barBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  selectButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
  },
  selectButtonHighlight: {
    backgroundColor: colors.accent,
  },
  selectText: {
    color: colors.textMuted,
  },
  selectTextHighlight: {
    color: colors.accentText,
  },
});
