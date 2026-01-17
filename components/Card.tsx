import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useTheme, cardShadow } from '@/lib/useTheme';
import { theme } from '@/lib/theme';

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'flat';
};

export function Card({ children, style, variant = 'default' }: CardProps) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card },
        variant === 'default' && (isDark ? cardShadow.dark : cardShadow.light),
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
  },
});
