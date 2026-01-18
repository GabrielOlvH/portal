import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Field } from '@/components/Field';
import { FadeIn } from '@/components/FadeIn';
import { useSnippets } from '@/lib/snippets-store';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';

export default function SnippetsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { snippets, addSnippet, updateSnippet, removeSnippet } = useSnippets();

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [command, setCommand] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const canSubmit = label.trim() && command.trim();

  const resetForm = () => {
    setLabel('');
    setCommand('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleSaveSnippet = async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    try {
      const trimmedLabel = label.trim();
      const trimmedCommand = command.trim();
      if (editingId) {
        await updateSnippet(editingId, { label: trimmedLabel, command: trimmedCommand });
      } else {
        await addSnippet(trimmedLabel, trimmedCommand);
      }
      resetForm();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save snippet');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (snippetId: string) => {
    const snippet = snippets.find((item) => item.id === snippetId);
    if (!snippet) return;
    setLabel(snippet.label);
    setCommand(snippet.command);
    setEditingId(snippet.id);
    setShowForm(true);
  };

  const handleDelete = (snippetId: string, snippetLabel: string) => {
    Alert.alert(
      'Delete Snippet',
      `Are you sure you want to delete "${snippetLabel}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeSnippet(snippetId),
        },
      ]
    );
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <AppText variant="subtitle">Back</AppText>
        </Pressable>
        <View style={styles.headerInfo}>
          <AppText variant="caps" tone="muted">
            Global
          </AppText>
          <AppText variant="title">Snippets</AppText>
        </View>
        {!showForm && (
          <Pressable style={styles.addButton} onPress={() => setShowForm(true)}>
            <AppText variant="subtitle" style={styles.addButtonText}>
              +
            </AppText>
          </Pressable>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {showForm && (
          <FadeIn>
            <View style={styles.formCard}>
              <AppText variant="subtitle" style={styles.formTitle}>
                {editingId ? 'Edit Snippet' : 'New Snippet'}
              </AppText>

              <Field
                label="Label"
                placeholder="e.g., Dev Server"
                value={label}
                onChangeText={setLabel}
                autoCapitalize="words"
                autoCorrect={false}
              />

              <Field
                label="Command"
                placeholder="e.g., pnpm dev"
                value={command}
                onChangeText={setCommand}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.formActions}>
                <Pressable style={styles.cancelButton} onPress={resetForm}>
                  <AppText variant="label">Cancel</AppText>
                </Pressable>
                <Pressable
                  style={[styles.saveButton, !canSubmit && styles.saveButtonDisabled]}
                  onPress={handleSaveSnippet}
                  disabled={!canSubmit || submitting}
                >
                  <AppText variant="label" style={styles.saveButtonText}>
                    {submitting ? 'Saving...' : editingId ? 'Update Snippet' : 'Add Snippet'}
                  </AppText>
                </Pressable>
              </View>
            </View>
          </FadeIn>
        )}

        {snippets.length === 0 && !showForm ? (
          <FadeIn style={styles.empty}>
            <AppText variant="subtitle">No snippets</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyBody}>
              Add snippets to reuse common commands anywhere.
            </AppText>
            <Pressable style={styles.cta} onPress={() => setShowForm(true)}>
              <AppText variant="subtitle" style={styles.ctaText}>
                Add Snippet
              </AppText>
            </Pressable>
          </FadeIn>
        ) : (
          <View style={styles.snippetsList}>
            {snippets.map((snippet, idx) => (
              <FadeIn key={snippet.id} delay={idx * 50}>
                <View style={styles.snippetCard}>
                  <View style={styles.snippetInfo}>
                    <AppText variant="subtitle">{snippet.label}</AppText>
                    <AppText variant="mono" tone="muted">
                      {snippet.command}
                    </AppText>
                  </View>
                  <View style={styles.snippetActions}>
                    <Pressable
                      style={styles.editButton}
                      onPress={() => handleEdit(snippet.id)}
                    >
                      <AppText variant="caps" style={styles.editButtonText}>
                        Edit
                      </AppText>
                    </Pressable>
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => handleDelete(snippet.id, snippet.label)}
                    >
                      <AppText variant="caps" style={styles.deleteButtonText}>
                        Delete
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              </FadeIn>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.md,
  },
  back: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  headerInfo: {
    flex: 1,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: colors.accentText,
    fontSize: 20,
    marginTop: -2,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    ...theme.shadow.card,
  },
  formTitle: {
    marginBottom: theme.spacing.sm,
  },
  formActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.cardPressed,
    paddingVertical: 12,
    borderRadius: theme.radii.md,
    alignItems: 'center',
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: theme.radii.md,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: colors.separator,
  },
  saveButtonText: {
    color: colors.accentText,
  },
  empty: {
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadow.card,
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
  snippetsList: {
    gap: theme.spacing.sm,
  },
  snippetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadow.card,
  },
  snippetInfo: {
    flex: 1,
    gap: 4,
  },
  snippetActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  editButton: {
    backgroundColor: withAlpha(colors.accent, 0.14),
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radii.sm,
  },
  editButtonText: {
    color: colors.accent,
  },
  deleteButton: {
    backgroundColor: withAlpha(colors.red, 0.14),
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radii.sm,
  },
  deleteButtonText: {
    color: colors.red,
  },
});
