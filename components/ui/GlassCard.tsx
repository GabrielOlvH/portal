import React from 'react';
import { StyleSheet, View, ViewProps, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/lib/useTheme';
import { theme } from '@/lib/theme';
import { withAlpha } from '@/lib/colors';

export interface GlassCardProps extends ViewProps {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
}

export function GlassCard({ children, style, intensity = 20, tint, ...props }: GlassCardProps) {
  const { isDark, colors } = useTheme();
  
  const blurTint = tint || (isDark ? 'dark' : 'light');
  
  // On Android, BlurView can sometimes be buggy or slow, so we provide a sleek solid fallback
  // that still looks premium. On iOS/Web, we use the full blur effect.
  if (Platform.OS === 'android') {
    return (
      <View 
        style={[
          styles.container, 
          { 
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderColor: isDark ? '#2C2C2E' : '#E5E5EA',
          }, 
          style
        ]} 
        {...props}
      >
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }, style]} {...props}>
      <BlurView
        intensity={intensity}
        tint={blurTint}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)' }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20, // Modern, slightly larger radius
    overflow: 'hidden',
    borderWidth: 1,
  },
});
