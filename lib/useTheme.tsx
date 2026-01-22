import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemeSetting } from '@/lib/types';

export const lightColors = {
  // Backgrounds - Portal cool gray
  background: '#f8fafc',        // Cool gray to match blue identity
  card: '#FFFFFF',              // Solid white cards
  cardPressed: '#f1f5f9',       // Slate-100 on press

  // Text - Navy instead of pure black
  text: '#0f172a',              // Slate-900 (deep navy)
  textSecondary: '#475569',     // Slate-600
  textMuted: '#94a3b8',         // Slate-400

  // Accent - Portal Blue
  accent: '#3b82f6',            // Blue-500 (logo border color)
  accentText: '#FFFFFF',        // White text on accent

  // Borders & Separators
  border: '#e2e8f0',            // Slate-200
  separator: '#e2e8f0',         // Slate-200

  // Status colors (kept vibrant)
  green: '#22c55e',             // Green-500
  red: '#ef4444',               // Red-500
  orange: '#f97316',            // Orange-500
  blue: '#3b82f6',              // Blue-500
  teal: '#14b8a6',              // Teal-500
  purple: '#a855f7',            // Purple-500

  // UI elements
  barBg: '#e2e8f0',             // Slate-200
  shadow: '#0f172a',            // Navy shadow

  // Terminal theme
  terminalBackground: '#FFFFFF',
  terminalForeground: '#0f172a',
  terminalSelection: '#bfdbfe', // Blue-200
  terminalMuted: '#64748b',     // Slate-500
  terminalBorder: '#e2e8f0',
  terminalPressed: '#f1f5f9',
};

export const darkColors = {
  // Backgrounds - Portal deep navy
  background: '#0f172a',        // Slate-900 (deep navy from logo)
  card: '#1e293b',              // Slate-800
  cardPressed: '#334155',       // Slate-700 on press

  // Text
  text: '#f1f5f9',              // Slate-100 (soft white)
  textSecondary: '#94a3b8',     // Slate-400
  textMuted: '#64748b',         // Slate-500

  // Accent - Portal Blue (brighter for dark mode)
  accent: '#60a5fa',            // Blue-400 (visible on dark)
  accentText: '#0f172a',        // Navy text on accent

  // Borders & Separators
  border: '#334155',            // Slate-700
  separator: '#334155',         // Slate-700

  // Status colors (brighter for dark mode)
  green: '#4ade80',             // Green-400
  red: '#f87171',               // Red-400
  orange: '#fb923c',            // Orange-400
  blue: '#60a5fa',              // Blue-400
  teal: '#2dd4bf',              // Teal-400
  purple: '#c084fc',            // Purple-400

  // UI elements
  barBg: '#1e293b',             // Slate-800
  shadow: '#000000',

  // Terminal theme - Portal navy
  terminalBackground: '#0f172a',
  terminalForeground: '#e2e8f0',
  terminalSelection: '#1e3a5f', // Logo square color
  terminalMuted: '#64748b',
  terminalBorder: '#1e293b',
  terminalPressed: '#1e293b',
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
