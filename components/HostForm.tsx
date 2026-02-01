import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, TextInput } from 'react-native';
import { AppText } from '@/components/AppText';
import { HostDraft } from '@/lib/types';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';

export function HostForm({
  initial,
  onSubmit,
  submitLabel = 'Save Host',
}: {
  initial?: Partial<HostDraft>;
  onSubmit: (draft: HostDraft) => void;
  submitLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState(initial?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [authToken, setAuthToken] = useState(initial?.authToken ?? '');

  const canSubmit = useMemo(() => name.trim().length > 0 && baseUrl.trim().length > 0, [name, baseUrl]);

  const draft: HostDraft = {
    name: name.trim(),
    baseUrl: baseUrl.trim(),
    authToken: authToken.trim() || undefined,
    color: initial?.color,
  };

  return (
    <View style={styles.form}>
      {/* Connection Details */}
      <View style={styles.section}>
        <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
          Connection
        </AppText>
        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <AppText variant="label" style={styles.inputLabel}>Host Name</AppText>
            <TextInput
              style={styles.input}
              placeholder="Studio, Pi, or Cloud"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <AppText variant="label" style={styles.inputLabel}>Agent URL</AppText>
            <TextInput
              style={[styles.input, styles.monoInput]}
              placeholder="http://192.168.1.12:4020"
              placeholderTextColor={colors.textMuted}
              value={baseUrl}
              onChangeText={setBaseUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
        </View>
      </View>

      {/* Authentication */}
      <View style={styles.section}>
        <AppText variant="caps" tone="muted" style={styles.sectionLabel}>
          Authentication (Optional)
        </AppText>
        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <AppText variant="label" style={styles.inputLabel}>API Token</AppText>
            <TextInput
              style={[styles.input, styles.monoInput]}
              placeholder="Bearer token for the agent"
              placeholderTextColor={colors.textMuted}
              value={authToken}
              onChangeText={setAuthToken}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>
        </View>
        <AppText variant="body" tone="muted" style={styles.hint}>
          Leave empty if your agent doesn't require authentication.
        </AppText>
      </View>

      <Pressable
        style={[styles.submit, !canSubmit && styles.submitDisabled]}
        disabled={!canSubmit}
        onPress={() => onSubmit(draft)}
      >
        <AppText variant="subtitle" style={styles.submitText}>
          {submitLabel}
        </AppText>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  form: {
    paddingBottom: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionLabel: {
    marginBottom: theme.spacing.sm,
    marginLeft: 4,
  },

  // Form Card
  formCard: {
    padding: 0,
    overflow: 'hidden',
  },
  inputGroup: {
    padding: theme.spacing.md,
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
  hint: {
    marginTop: theme.spacing.sm,
    marginLeft: 4,
  },

  // Submit
  submit: {
    paddingVertical: 16,
    borderRadius: theme.radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  submitDisabled: {
    backgroundColor: colors.separator,
  },
  submitText: {
    color: colors.accentText,
  },
});
