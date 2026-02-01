import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/useTheme';
import { AppText } from './AppText';
import { Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { withAlpha } from '@/lib/colors';

type EmptyStateType = 'sessions' | 'hosts' | 'projects' | 'first-launch';

type SmartEmptyStateProps = {
  type: EmptyStateType;
  onAction?: () => void;
};

const emptyStateContent = {
  sessions: {
    title: 'No active sessions',
    subtitle: 'Start coding by launching a new session',
    actionLabel: 'Launch Session',
    illustration: 'terminal',
  },
  hosts: {
    title: 'No servers connected',
    subtitle: 'Add your first host to get started',
    actionLabel: 'Add Host',
    illustration: 'server',
  },
  projects: {
    title: 'No projects yet',
    subtitle: 'Add a project to quickly launch commands',
    actionLabel: 'Add Project',
    illustration: 'folder',
  },
  'first-launch': {
    title: 'Welcome to Portal',
    subtitle: 'Your remote development companion',
    actionLabel: 'Get Started',
    illustration: 'sparkles',
  },
};

// Animated illustration components
function TerminalIllustration({ colors, isDark }: { colors: { accent: string; textMuted: string; card: string; text: string }; isDark: boolean }) {
  const cursorOpacity = useSharedValue(1);
  
  React.useEffect(() => {
    cursorOpacity.value = withRepeat(
      withTiming(0, { duration: 500 }),
      -1,
      true
    );
  }, []);

  const cursorStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
  }));

  // Theme-aware terminal colors
  const terminalWindowBg = isDark ? withAlpha('#000000', 0.8) : withAlpha('#000000', 0.8);
  const terminalHeaderBg = isDark ? withAlpha('#FFFFFF', 0.1) : withAlpha('#FFFFFF', 0.1);

  return (
    <View style={[styles.illustrationContainer, { backgroundColor: colors.card }]}>
      <View style={[styles.terminalWindow, { backgroundColor: terminalWindowBg }]}>
        <View style={[styles.terminalHeader, { backgroundColor: terminalHeaderBg }]}>
          <View style={[styles.terminalDot, { backgroundColor: '#FF5F57' }]} />
          <View style={[styles.terminalDot, { backgroundColor: '#FFBD2E' }]} />
          <View style={[styles.terminalDot, { backgroundColor: '#28CA42' }]} />
        </View>
        <View style={styles.terminalBody}>
          <View style={styles.terminalLine}>
            <View style={[styles.terminalText, { width: 80, backgroundColor: colors.accent }]} />
            <Animated.View style={[styles.terminalCursor, { backgroundColor: colors.accent }, cursorStyle]} />
          </View>
          <View style={[styles.terminalText, { width: 60, backgroundColor: colors.textMuted, opacity: 0.5 }]} />
          <View style={[styles.terminalText, { width: 100, backgroundColor: colors.textMuted, opacity: 0.3 }]} />
        </View>
      </View>
    </View>
  );
}

function ServerIllustration({ colors, isDark }: { colors: { accent: string; textMuted: string; card: string; text: string }; isDark: boolean }) {
  const pulseScale = useSharedValue(1);
  
  React.useEffect(() => {
    pulseScale.value = withRepeat(
      withSpring(1.2, { damping: 10 }),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: interpolate(pulseScale.value, [1, 1.2], [0.6, 0]),
  }));

  // Theme-aware server unit background
  const serverUnitBg = withAlpha(colors.text, 0.1);

  return (
    <View style={[styles.illustrationContainer, { backgroundColor: colors.card }]}>
      <View style={styles.serverRack}>
        <Animated.View style={[styles.serverPulse, { backgroundColor: colors.accent }, pulseStyle]} />
        <View style={[styles.serverUnit, { backgroundColor: serverUnitBg }]}>
          <View style={[styles.serverLight, { backgroundColor: colors.textMuted }]} />
          <View style={[styles.serverLine, { backgroundColor: colors.textMuted }]} />
        </View>
        <View style={[styles.serverUnit, { backgroundColor: serverUnitBg }]}>
          <View style={[styles.serverLight, { backgroundColor: colors.textMuted }]} />
          <View style={[styles.serverLine, { backgroundColor: colors.textMuted }]} />
        </View>
        <View style={[styles.serverUnit, { backgroundColor: serverUnitBg }]}>
          <View style={[styles.serverLight, { backgroundColor: colors.accent }]} />
          <View style={[styles.serverLine, { backgroundColor: colors.textMuted }]} />
        </View>
      </View>
    </View>
  );
}

function FolderIllustration({ colors, isDark }: { colors: { accent: string; textMuted: string; card: string; text: string }; isDark: boolean }) {
  // Theme-aware folder tab color - use accent with transparency for better theme contrast
  const folderTabBg = withAlpha(colors.accent, 0.3);

  return (
    <View style={[styles.illustrationContainer, { backgroundColor: colors.card }]}>
      <View style={styles.folderStack}>
        <View style={[styles.folderBack, { backgroundColor: colors.textMuted, opacity: 0.3 }]} />
        <View style={[styles.folderBack, { backgroundColor: colors.textMuted, opacity: 0.5, marginTop: -20 }]} />
        <View style={[styles.folderFront, { backgroundColor: colors.accent }]}>
          <View style={[styles.folderTab, { backgroundColor: folderTabBg }]} />
        </View>
      </View>
    </View>
  );
}

function SparklesIllustration({ colors, isDark }: { colors: { accent: string; textMuted: string; card: string; text: string }; isDark: boolean }) {
  const rotate = useSharedValue(0);
  
  React.useEffect(() => {
    rotate.value = withRepeat(
      withTiming(360, { duration: 8000 }),
      -1,
      false
    );
  }, []);

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return (
    <View style={[styles.illustrationContainer, { backgroundColor: colors.card }]}>
      <Animated.View style={[styles.sparkleContainer, sparkleStyle]}>
        <View style={[styles.sparkle, { backgroundColor: colors.accent }]} />
        <View style={[styles.sparkleRing, { borderColor: colors.accent }]} />
      </Animated.View>
    </View>
  );
}

export function SmartEmptyState({ type, onAction }: SmartEmptyStateProps) {
  const { colors, isDark } = useTheme();
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);
  const scaleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    scale.value = withSpring(1, { damping: 12 });
    opacity.value = withTiming(1, { duration: 400 });
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scaleTimeoutRef.current) clearTimeout(scaleTimeoutRef.current);
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const content = emptyStateContent[type];

  const renderIllustration = () => {
    switch (content.illustration) {
      case 'terminal':
        return <TerminalIllustration colors={colors} isDark={isDark} />;
      case 'server':
        return <ServerIllustration colors={colors} isDark={isDark} />;
      case 'folder':
        return <FolderIllustration colors={colors} isDark={isDark} />;
      case 'sparkles':
        return <SparklesIllustration colors={colors} isDark={isDark} />;
      default:
        return null;
    }
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSpring(0.95, { damping: 10 });
    if (scaleTimeoutRef.current) clearTimeout(scaleTimeoutRef.current);
    scaleTimeoutRef.current = setTimeout(() => {
      scale.value = withSpring(1, { damping: 12 });
    }, 100);
    onAction?.();
  };

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {renderIllustration()}
      
      <View style={styles.textContainer}>
        <AppText variant="subtitle" style={styles.title}>
          {content.title}
        </AppText>
        
        <AppText variant="body" tone="muted" style={styles.subtitle}>
          {content.subtitle}
        </AppText>
      </View>

      {onAction && (
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.actionButton,
            { backgroundColor: colors.accent },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Plus size={18} color={colors.accentText} />
          <AppText variant="label" style={[styles.actionText, { color: colors.accentText }]}>
            {content.actionLabel}
          </AppText>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 20,
  },
  illustrationContainer: {
    width: 120,
    height: 120,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Terminal styles
  terminalWindow: {
    width: 80,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  terminalHeader: {
    flexDirection: 'row',
    gap: 4,
    padding: 6,
  },
  terminalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  terminalBody: {
    padding: 8,
    gap: 4,
  },
  terminalLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  terminalText: {
    height: 4,
    borderRadius: 2,
  },
  terminalCursor: {
    width: 4,
    height: 8,
    borderRadius: 1,
  },
  // Server styles
  serverRack: {
    width: 60,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  serverPulse: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  serverUnit: {
    width: 50,
    height: 20,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 6,
  },
  serverLight: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  serverLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  // Folder styles
  folderStack: {
    alignItems: 'center',
  },
  folderBack: {
    width: 60,
    height: 40,
    borderRadius: 6,
  },
  folderFront: {
    width: 60,
    height: 40,
    borderRadius: 6,
    marginTop: -25,
    overflow: 'hidden',
  },
  folderTab: {
    width: 20,
    height: 8,
    borderBottomRightRadius: 4,
  },
  // Sparkles styles
  sparkleContainer: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  sparkleRing: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  // Text styles
  textContainer: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontWeight: '600',
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 240,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    marginTop: 8,
  },
  actionText: {
    fontWeight: '600',
  },
});
