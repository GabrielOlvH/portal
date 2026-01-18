import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemeSetting } from '@/lib/types';

export const lightColors = {
  // Backgrounds
  background: '#F7F3EB',        // Warm cream (kept per user preference)
  card: '#FFFFFF',              // Solid white cards
  cardPressed: '#F5F5F5',       // Slightly darker on press

  // Text
  text: '#1A1A1A',              // Bold black primary text
  textSecondary: '#666666',     // Secondary text
  textMuted: '#999999',         // Muted/tertiary text

  // Accent - Bold Black
  accent: '#1A1A1A',            // Primary actions
  accentText: '#FFFFFF',        // Text on accent

  // Borders & Separators
  border: '#E5E5E5',
  separator: '#EBEBEB',

  // Status colors (kept vibrant)
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  blue: '#007AFF',
  teal: '#00C7BE',
  purple: '#AF52DE',

  // UI elements
  barBg: '#F0EBE3',             // Progress bar backgrounds
  shadow: '#000000',

  // Terminal theme
  terminalBackground: '#FFFFFF',
  terminalForeground: '#1A1A1A',
  terminalMuted: '#6B6B6B',
  terminalBorder: '#E5E5E5',
  terminalPressed: '#F5F5F5',
};

export const darkColors = {
  // Backgrounds
  background: '#000000',        // Pure black
  card: '#1C1C1E',              // iOS dark card
  cardPressed: '#2C2C2E',       // Slightly lighter on press

  // Text
  text: '#FFFFFF',              // White primary text
  textSecondary: '#ABABAB',     // Secondary text
  textMuted: '#6B6B6B',         // Muted/tertiary text

  // Accent - stays light for contrast
  accent: '#FFFFFF',            // White accent on dark
  accentText: '#000000',        // Black text on accent

  // Borders & Separators
  border: '#38383A',
  separator: '#38383A',

  // Status colors (same, they work in both modes)
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  blue: '#0A84FF',
  teal: '#64D2FF',
  purple: '#BF5AF2',

  // UI elements
  barBg: '#2C2C2E',
  shadow: '#000000',

  // Terminal theme
  terminalBackground: '#0B0D0F',
  terminalForeground: '#E6EDF3',
  terminalMuted: '#8B949E',
  terminalBorder: '#1E2226',
  terminalPressed: '#1E2226',
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
