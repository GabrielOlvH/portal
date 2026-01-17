import { useColorScheme } from 'react-native';

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
};

export type ThemeColors = typeof lightColors;

export function useTheme() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
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
