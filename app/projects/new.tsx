import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Alert, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { DirectoryBrowser } from '@/components/DirectoryBrowser';
import { useStore } from '@/lib/store';
import { useProjects } from '@/lib/projects-store';
import { theme } from '@/lib/theme';
import { hostColors } from '@/lib/colors';
import { ThemeColors, useTheme } from '@/lib/useTheme';

export default function NewProjectScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hosts } = useStore();
  const { addProject } = useProjects();

  const [selectedHostId, setSelectedHostId] = useState<string | null>(
    hosts.length === 1 ? hosts[0].id : null
  );
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);

  const selectedHost = useMemo(
    () => hosts.find((h) => h.id === selectedHostId) || null,
    [hosts, selectedHostId]
  );

  const canSubmit = selectedHostId && name.trim() && path.trim();

  const handleSubmit = async () => {
    if (!canSubmit || submitting || !selectedHost) return;

    setSubmitting(true);
    try {
      await addProject({
        hostId: selectedHostId!,
        name: name.trim(),
        path: path.trim(),
        host: selectedHost,
      });
      router.back();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBrowseSelect = (selectedPath: string, selectedName: string) => {
    setPath(selectedPath);
    if (!name.trim()) {
      setName(selectedName);
    }
    setShowBrowser(false);
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <AppText variant="label" style={styles.backText}>Cancel</AppText>
        </Pressable>
        <AppText variant="subtitle" style={styles.headerTitle}>New Project</AppText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Host Selection */}
        <View style={styles.section}>
          <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
            Host
          </AppText>
          {hosts.length === 0 ? (
            <View style={styles.emptyCard}>
              <AppText variant="body" tone="muted" style={styles.emptyText}>
                No hosts configured yet
              </AppText>
              <Pressable style={styles.linkButton} onPress={() => router.push('/hosts/new')}>
                <AppText variant="label" style={styles.linkButtonText}>
                  Add Host First
                </AppText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.hostList}>
              {hosts.map((host, idx) => {
                const isSelected = selectedHostId === host.id;
                const hostColor = host.color || hostColors[idx % hostColors.length];
                return (
                  <Pressable
                    key={host.id}
                    style={[
                      styles.hostItem,
                      isSelected && styles.hostItemSelected,
                      isSelected && { borderColor: hostColor },
                    ]}
                    onPress={() => setSelectedHostId(host.id)}
                  >
                    <View style={[styles.hostDot, { backgroundColor: hostColor }]} />
                    <View style={styles.hostInfo}>
                      <AppText variant="subtitle" style={isSelected ? styles.hostNameSelected : undefined}>
                        {host.name}
                      </AppText>
                      <AppText variant="caps" tone="muted" numberOfLines={1}>
                        {host.baseUrl}
                      </AppText>
                    </View>
                    {isSelected && (
                      <View style={[styles.checkmark, { backgroundColor: hostColor }]}>
                        <AppText variant="caps" style={styles.checkmarkText}>✓</AppText>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Project Details */}
        <View style={styles.section}>
          <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
            Project Details
          </AppText>
          <View style={styles.formCard}>
            <View style={styles.inputGroup}>
              <AppText variant="label" style={styles.inputLabel}>Name</AppText>
              <TextInput
                style={styles.input}
                placeholder="my-project"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <AppText variant="label" style={styles.inputLabel}>Path on Host</AppText>
                <Pressable
                  style={[styles.browseChip, !selectedHostId && styles.browseChipDisabled]}
                  onPress={() => setShowBrowser(true)}
                  disabled={!selectedHostId}
                >
                  <AppText
                    variant="caps"
                    style={selectedHostId ? styles.browseChipText : styles.browseChipTextDisabled}
                  >
                    Browse
                  </AppText>
                </Pressable>
              </View>
              <TextInput
                style={[styles.input, styles.monoInput]}
                placeholder="/home/user/projects/my-project"
                placeholderTextColor={colors.textMuted}
                value={path}
                onChangeText={setPath}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
        </View>

        {/* Submit */}
        <Pressable
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          <AppText variant="subtitle" style={styles.submitButtonText}>
            {submitting ? 'Adding...' : 'Add Project'}
          </AppText>
        </Pressable>
      </ScrollView>

      <Modal
        visible={showBrowser}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBrowser(false)}
      >
        <View style={styles.browserModal}>
          {selectedHost && (
            <DirectoryBrowser
              host={selectedHost}
              onSelect={handleBrowseSelect}
              onClose={() => setShowBrowser(false)}
            />
          )}
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    marginBottom: theme.spacing.lg,
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: theme.spacing.sm,
  },
  backText: {
    color: colors.blue,
  },
  headerTitle: {
    textAlign: 'center',
  },
  headerSpacer: {
    width: 50,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionLabel: {
    marginBottom: theme.spacing.sm,
    marginLeft: 4,
  },

  // Host Selection
  hostList: {
    gap: theme.spacing.sm,
  },
  hostItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  hostItemSelected: {
    backgroundColor: colors.cardPressed,
  },
  hostDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  hostInfo: {
    flex: 1,
    gap: 2,
  },
  hostNameSelected: {
    fontWeight: '600',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCard: {
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    textAlign: 'center',
  },
  linkButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
  },
  linkButtonText: {
    color: colors.accentText,
  },

  // Form Card
  formCard: {
    overflow: 'hidden',
  },
  inputGroup: {
    padding: theme.spacing.md,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  inputLabel: {
    marginBottom: theme.spacing.xs,
  },
  input: {
    fontSize: 16,
    color: colors.text,
    paddingVertical: 8,
    backgroundColor: colors.cardPressed,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 12,
  },
  monoInput: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: colors.separator,
    marginHorizontal: theme.spacing.md,
  },
  browseChip: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
  },
  browseChipDisabled: {
    backgroundColor: colors.separator,
  },
  browseChipText: {
    color: colors.accentText,
  },
  browseChipTextDisabled: {
    color: colors.textMuted,
  },

  // Submit
  submitButton: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  submitButtonDisabled: {
    backgroundColor: colors.separator,
  },
  submitButtonText: {
    color: colors.accentText,
  },

  // Browser Modal
  browserModal: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
    paddingHorizontal: theme.spacing.md,
  },
});
