import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/useTheme';

const textStyles = StyleSheet.create({
  title: {
    fontWeight: '700',
    fontSize: 28,
  },
  subtitle: {
    fontWeight: '600',
    fontSize: 18,
  },
  body: {
    fontWeight: '400',
    fontSize: 15,
  },
  label: {
    fontWeight: '500',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  mono: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontWeight: '500',
    fontSize: 12,
  },
  caps: {
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});

export type AppTextProps = TextProps & {
  variant?: keyof typeof textStyles;
  tone?:
    | 'primary'
    | 'secondary'
    | 'accent'
    | 'success'
    | 'error'
    | 'warning'
    | 'ink'
    | 'muted'
    | 'clay';
};

export function AppText({ variant = 'body', tone = 'primary', style, ...props }: AppTextProps) {
  const { colors } = useTheme();

  const toneColor = {
    primary: colors.text,
    secondary: colors.textSecondary,
    accent: colors.accent,
    success: colors.green,
    error: colors.red,
    warning: colors.orange,
    ink: colors.text,
    muted: colors.textMuted,
    clay: colors.orange,
  }[tone];

  return (
    <Text
      {...props}
      style={[textStyles[variant], { color: toneColor }, style]}
    />
  );
}
