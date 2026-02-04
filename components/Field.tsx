import React, { useMemo } from 'react';
import { View, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { AppText } from '@/components/AppText';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <AppText variant="label" style={styles.label}>
        {label}
      </AppText>
      <TextInput
        {...props}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, props.style]}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    marginBottom: theme.spacing.sm,
  },
  label: {
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
});
