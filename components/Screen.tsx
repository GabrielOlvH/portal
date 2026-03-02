import React from 'react';
import { View, StyleSheet, ViewProps, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
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
    // Also account for left/right insets (landscape tablets with camera cutouts).
    return (
      <View style={[styles.root, { backgroundColor, width: '100%' }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={{ height: insets.top }} />
        <View
          style={[
            styles.content,
            styles.contentTerminal,
            { backgroundColor, width: '100%', paddingLeft: insets.left, paddingRight: insets.right },
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
    <View style={styles.root}>
      {/* Modern gradient background layer */}
      <LinearGradient
        colors={
          isDark 
            ? ['#0A0A0A', '#121212', '#080808'] // Deep sleek dark mode
            : ['#F8FAFC', '#F1F5F9', '#F8FAFC'] // Crisp slate light mode
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      <SafeAreaView
        style={styles.root}
        // Terminal screens intentionally bleed to the sides/bottom; keep only the top safe area.
        edges={['top', 'left', 'right', 'bottom']}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View
          style={[
            styles.content,
            style,
          ]}
          {...props}
        >
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  contentTerminal: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
});
