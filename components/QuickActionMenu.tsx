import React, { useCallback } from 'react';
import { View, StyleSheet, Pressable, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Copy, Share2, Power, Pencil, X, Terminal } from 'lucide-react-native';
import { useTheme } from '@/lib/useTheme';
import { AppText } from './AppText';
import * as Haptics from 'expo-haptics';
import { withAlpha } from '@/lib/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type QuickAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  onPress: () => void;
};

type QuickActionMenuProps = {
  isVisible: boolean;
  onClose: () => void;
  sessionName: string;
  onCopyName: () => void;
  onShare: () => void;
  onRename: () => void;
  onKill: () => void;
  onTerminal: () => void;
};

export function QuickActionMenu({
  isVisible,
  onClose,
  sessionName,
  onCopyName,
  onShare,
  onRename,
  onKill,
  onTerminal,
}: QuickActionMenuProps) {
  const { colors } = useTheme();
  const translateY = useSharedValue(300);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  React.useEffect(() => {
    if (isVisible) {
      translateY.value = withSpring(0, { damping: 20 });
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 20 });
    } else {
      translateY.value = withSpring(300, { damping: 20 });
      opacity.value = withTiming(0, { duration: 200 });
      scale.value = withSpring(0.9, { damping: 20 });
    }
  }, [isVisible, translateY, opacity, scale]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(opacity.value, [0, 1], [0, 0.5], Extrapolate.CLAMP),
    pointerEvents: isVisible ? 'auto' : 'none',
  }));

  const menuStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  const handleAction = useCallback((action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    action();
    onClose();
  }, [onClose]);

  const actions: QuickAction[] = [
    {
      id: 'terminal',
      label: 'Open Terminal',
      icon: <Terminal size={20} color={colors.accent} />,
      color: colors.accent,
      onPress: () => handleAction(onTerminal),
    },
    {
      id: 'copy',
      label: 'Copy Name',
      icon: <Copy size={20} color={colors.text} />,
      color: colors.text,
      onPress: () => handleAction(onCopyName),
    },
    {
      id: 'share',
      label: 'Share',
      icon: <Share2 size={20} color={colors.text} />,
      color: colors.text,
      onPress: () => handleAction(onShare),
    },
    {
      id: 'rename',
      label: 'Rename',
      icon: <Pencil size={20} color={colors.text} />,
      color: colors.text,
      onPress: () => handleAction(onRename),
    },
    {
      id: 'kill',
      label: 'Kill Session',
      icon: <Power size={20} color={colors.red} />,
      color: colors.red,
      onPress: () => handleAction(onKill),
    },
  ];

  if (!isVisible) return null;

  return (
    <View style={styles.overlay}>
      <AnimatedPressable
        style={[styles.backdrop, { backgroundColor: colors.shadow }, backdropStyle]}
        onPress={onClose}
      />

      <Animated.View style={[styles.menuContainer, menuStyle]}>
        <BlurView
          intensity={80}
          tint="dark"
          style={[styles.menu, { backgroundColor: colors.card }]}
        >
          <View style={[styles.header, { borderBottomColor: colors.separator }]}>
            <AppText variant="label" style={styles.sessionName} numberOfLines={1}>
              {sessionName}
            </AppText>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.actionsGrid}>
            {actions.map((action, index) => (
              <AnimatedPressable
                key={action.id}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.cardPressed },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.iconContainer, { backgroundColor: `${action.color}20` }]}>
                  {action.icon}
                </View>
                <AppText
                  variant="label"
                  style={[styles.actionLabel, { color: action.id === 'kill' ? colors.red : colors.text }]}
                >
                  {action.label}
                </AppText>
              </AnimatedPressable>
            ))}
          </View>
        </BlurView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  menuContainer: {
    paddingHorizontal: 16,
    paddingBottom: 34,
  },
  menu: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  sessionName: {
    flex: 1,
    fontWeight: '600',
    marginRight: 12,
  },
  closeButton: {
    padding: 4,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    width: (SCREEN_WIDTH - 64) / 3,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
});
