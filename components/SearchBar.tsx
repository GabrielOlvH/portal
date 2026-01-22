import React, { useMemo } from 'react';
import { View, TextInput, StyleSheet, Pressable } from 'react-native';
import { Card } from '@/components/Card';
import { AppText } from '@/components/AppText';
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

export function SearchBar({ value, onChangeText, placeholder = 'Search...' }: SearchBarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Card style={styles.card}>
      <View style={styles.container}>
        <AppText style={styles.icon}>⌕</AppText>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="never"
        />
        {value.length > 0 && (
          <Pressable style={styles.clearButton} onPress={() => onChangeText('')}>
            <AppText style={styles.clearIcon}>✕</AppText>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    marginBottom: theme.spacing.sm,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 8,
  },
  icon: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 4,
  },
  clearButton: {
    padding: 4,
  },
  clearIcon: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
