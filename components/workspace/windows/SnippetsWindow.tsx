import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { Plus, Edit2, Trash2, Code, FileCode2 } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Field } from '@/components/Field';
import { FadeIn } from '@/components/FadeIn';
import { GlassCard } from '@/components/ui/GlassCard';
import { useSnippets } from '@/lib/snippets-store';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { withAlpha } from '@/lib/colors';

export function SnippetsWindow() {
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
    <View style={styles.container}>
      <View style={styles.header}>
        <AppText variant="title">Snippets</AppText>
        {!showForm && (
          <Pressable style={styles.addButton} onPress={() => setShowForm(true)}>
            <Plus size={20} color={colors.accentText} />
          </Pressable>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {showForm && (
          <FadeIn>
            <GlassCard style={styles.formCard}>
              <View style={styles.formHeader}>
                <Code size={20} color={colors.accent} />
                <AppText variant="subtitle" style={styles.formTitle}>
                  {editingId ? 'Edit Snippet' : 'New Snippet'}
                </AppText>
              </View>

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
            </GlassCard>
          </FadeIn>
        )}

        {snippets.length === 0 && !showForm ? (
          <FadeIn style={styles.empty}>
            <View style={styles.emptyIcon}>
              <FileCode2 size={32} color={colors.textMuted} />
            </View>
            <AppText variant="subtitle">No snippets yet</AppText>
            <AppText variant="body" tone="muted" style={styles.emptyBody}>
              Save your most used terminal commands here for quick access.
            </AppText>
            <Pressable style={styles.cta} onPress={() => setShowForm(true)}>
              <Plus size={16} color={colors.accentText} />
              <AppText variant="label" style={styles.ctaText}>Create Snippet</AppText>
            </Pressable>
          </FadeIn>
        ) : (
          <View style={styles.snippetsList}>
            {snippets.map((snippet, idx) => (
              <FadeIn key={snippet.id} delay={idx * 50}>
                <GlassCard style={styles.snippetCard} intensity={15}>
                  <View style={styles.snippetInfo}>
                    <AppText variant="subtitle" style={{ fontWeight: '600' }}>{snippet.label}</AppText>
                    <View style={styles.codeBlock}>
                      <AppText variant="mono" tone="muted" numberOfLines={2}>{snippet.command}</AppText>
                    </View>
                  </View>
                  <View style={styles.snippetActions}>
                    <Pressable style={styles.iconButton} onPress={() => handleEdit(snippet.id)}>
                      <Edit2 size={16} color={colors.text} />
                    </Pressable>
                    <Pressable style={[styles.iconButton, { backgroundColor: withAlpha(colors.red, 0.1) }]} onPress={() => handleDelete(snippet.id, snippet.label)}>
                      <Trash2 size={16} color={colors.red} />
                    </Pressable>
                  </View>
                </GlassCard>
              </FadeIn>
            ))}
          </View>
        )}
      </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 8,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  formCard: {
    padding: 20,
    marginBottom: 16,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: withAlpha(colors.text, 0.05),
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: colors.accentText,
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
    marginBottom: 24,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 100,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  ctaText: {
    color: colors.accentText,
    fontWeight: '600',
  },
  snippetsList: {
    gap: 12,
  },
  snippetCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 16,
  },
  snippetInfo: {
    flex: 1,
    gap: 8,
  },
  codeBlock: {
    backgroundColor: withAlpha(colors.text, 0.03),
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: withAlpha(colors.text, 0.05),
  },
  snippetActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(colors.text, 0.05),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
