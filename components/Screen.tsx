import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/lib/useTheme';

export function Screen({
  children,
  style,
  variant = 'default',
  ...props
}: ViewProps & { variant?: 'default' | 'terminal' }) {
  const { colors, isDark } = useTheme();
  const backgroundColor = variant === 'terminal' ? colors.terminalBackground : colors.background;
  const insets = useSafeAreaInsets();

  if (variant === 'terminal') {
    // Keep top safe area, but paint a full-screen background behind it to avoid
    // 1-2px rounding gaps showing the previous screen on some devices.
    return (
      <View style={[styles.root, { backgroundColor, width: '100%' }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={{ height: insets.top }} />
        <View
          style={[
            styles.content,
            styles.contentTerminal,
            { backgroundColor, width: '100%' },
            style,
          ]}
          {...props}
        >
          {children}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.root,
        { backgroundColor },
      ]}
      // Terminal screens intentionally bleed to the sides/bottom; keep only the top safe area.
      edges={['top', 'left', 'right', 'bottom']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View
        style={[
          styles.content,
          { backgroundColor },
          style,
        ]}
        {...props}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  contentTerminal: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
});
