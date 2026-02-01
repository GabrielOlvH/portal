import { DefaultTheme } from '@react-navigation/native';

// Re-export new system colors for easy access
export { systemColors, hostColors } from './colors';

export const theme = {
  radii: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
  },
  shadow: {
    // Flat design - no shadows
    card: {},
  },
};

/**
 * Navigation theme for React Navigation.
 * Returns theme colors based on dark mode state.
 */
export function getNavTheme(isDark: boolean) {
  return {
    ...DefaultTheme,
    dark: isDark,
    colors: {
      ...DefaultTheme.colors,
      primary: isDark ? '#60A5FA' : '#3B82F6',      // Portal blue
      background: isDark ? '#0A0A0A' : '#FAFAF9',   // Near-black / warm cream
      card: isDark ? '#171717' : '#FFFFFF',         // Neutral-900 / white
      text: isDark ? '#FAFAFA' : '#1C1917',         // Soft white / warm black
      border: isDark ? '#262626' : '#E7E5E4',       // Neutral-800 / Stone-200
      notification: isDark ? '#60A5FA' : '#3B82F6', // Portal blue
    },
  };
}
