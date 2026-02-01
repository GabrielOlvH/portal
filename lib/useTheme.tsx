import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemeSetting } from '@/lib/types';

export const lightColors = {
  // Backgrounds - Soft cream/warm white
  background: '#FAFAF9',        // Stone-50 (warm cream)
  card: '#FFFFFF',              // Pure white cards
  cardPressed: '#F5F5F4',       // Stone-100 on press

  // Text - Warm charcoal
  text: '#1C1917',              // Stone-900 (warm black)
  textSecondary: '#57534E',     // Stone-600
  textMuted: '#A8A29E',         // Stone-400

  // Accent - Portal Blue
  accent: '#3B82F6',            // Blue-500
  accentText: '#FFFFFF',        // White text on accent

  // Borders & Separators
  border: '#E7E5E4',            // Stone-200
  separator: '#E7E5E4',         // Stone-200

  // Status colors (vibrant for visibility)
  green: '#22C55E',             // Green-500
  red: '#EF4444',               // Red-500
  orange: '#F97316',            // Orange-500
  blue: '#3B82F6',              // Blue-500
  teal: '#14B8A6',              // Teal-500
  purple: '#A855F7',            // Purple-500

  // UI elements
  barBg: '#E7E5E4',             // Stone-200
  shadow: '#1C1917',            // Warm shadow

  // Terminal theme
  terminalBackground: '#FFFFFF',
  terminalForeground: '#1C1917',
  terminalSelection: '#DBEAFE', // Blue-100
  terminalMuted: '#78716C',     // Stone-500
  terminalBorder: '#E7E5E4',
  terminalPressed: '#F5F5F4',
};

export const darkColors = {
  // Backgrounds - Near-black charcoal
  background: '#0A0A0A',        // Near-black
  card: '#171717',              // Neutral-900
  cardPressed: '#262626',       // Neutral-800 on press

  // Text
  text: '#FAFAFA',              // Neutral-50 (soft white)
  textSecondary: '#A3A3A3',     // Neutral-400
  textMuted: '#737373',         // Neutral-500

  // Accent - Portal Blue (brighter for dark mode)
  accent: '#60A5FA',            // Blue-400 (visible on dark)
  accentText: '#0A0A0A',        // Dark text on accent

  // Borders & Separators
  border: '#262626',            // Neutral-800
  separator: '#262626',         // Neutral-800

  // Status colors (brighter for dark mode)
  green: '#4ADE80',             // Green-400
  red: '#F87171',               // Red-400
  orange: '#FB923C',            // Orange-400
  blue: '#60A5FA',              // Blue-400
  teal: '#2DD4BF',              // Teal-400
  purple: '#C084FC',            // Purple-400

  // UI elements
  barBg: '#171717',             // Neutral-900
  shadow: '#000000',

  // Terminal theme - Near-black
  terminalBackground: '#0A0A0A',
  terminalForeground: '#E5E5E5',
  terminalSelection: '#1E3A5F', // Blue tint selection
  terminalMuted: '#737373',
  terminalBorder: '#171717',
  terminalPressed: '#262626',
};

export type ThemeColors = typeof lightColors;

const ThemeContext = createContext<ThemeSetting>('system');

export function ThemeSettingProvider({
  value,
  children,
}: {
  value: ThemeSetting;
  children: React.ReactNode;
}) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const systemScheme = useColorScheme();
  const themeSetting = useContext(ThemeContext);

  const isDark = useMemo(() => {
    if (themeSetting === 'system') {
      return systemScheme === 'dark';
    }
    return themeSetting === 'dark';
  }, [themeSetting, systemScheme]);

  const colors = isDark ? darkColors : lightColors;

  return {
    colors,
    isDark,
  };
}

// Shadow styles for cards
export const cardShadow = {
  light: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  dark: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
};
