import { DefaultTheme } from '@react-navigation/native';

// Re-export new system colors for easy access
export { systemColors, hostColors } from './colors';

export const theme = {
  radii: {
    sm: 12,
    md: 18,
    lg: 24,
    xl: 32,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 22,
    xl: 28,
    xxl: 36,
  },
  shadow: {
    card: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 20,
      elevation: 4,
    },
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
      primary: isDark ? '#60a5fa' : '#3b82f6',      // Portal blue
      background: isDark ? '#0f172a' : '#f8fafc',   // Navy / cool gray
      card: isDark ? '#1e293b' : '#FFFFFF',         // Slate-800 / white
      text: isDark ? '#f1f5f9' : '#0f172a',         // Soft white / navy
      border: isDark ? '#334155' : '#e2e8f0',       // Slate-700 / slate-200
      notification: isDark ? '#60a5fa' : '#3b82f6', // Portal blue
    },
  };
}
