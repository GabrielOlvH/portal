import React, { useCallback, useRef, useEffect } from 'react';
import { Pressable, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { Plus, Terminal, Rocket } from 'lucide-react-native';
import { useTheme } from '@/lib/useTheme';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type FABProps = {
  onPress: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  icon?: 'plus' | 'terminal' | 'rocket';
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary';
};

const iconMap = {
  plus: Plus,
  terminal: Terminal,
  rocket: Rocket,
};

const sizeConfig = {
  small: { size: 48, icon: 20 },
  medium: { size: 56, icon: 24 },
  large: { size: 64, icon: 28 },
};

export function FAB({
  onPress,
  onLongPress,
  style,
  icon = 'plus',
  size = 'medium',
  variant = 'primary',
}: FABProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = sizeConfig[size];
  const Icon = iconMap[icon];

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
    };
  }, []);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Spring animation
    scale.value = withSequence(
      withSpring(0.85, { damping: 10 }),
      withSpring(1, { damping: 12 })
    );
    
    // Rotation animation for plus icon
    if (icon === 'plus') {
      rotation.value = withSequence(
        withSpring(45, { damping: 10 }),
        withDelay(150, withSpring(0, { damping: 12 }))
      );
    }
    
    onPress();
  }, [onPress, scale, rotation, icon]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    scale.value = withSpring(0.9, { damping: 10 });
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
    longPressTimeoutRef.current = setTimeout(() => {
      scale.value = withSpring(1, { damping: 12 });
    }, 200);
    onLongPress?.();
  }, [onLongPress, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const backgroundColor = variant === 'primary' ? colors.accent : colors.card;
  const iconColor = variant === 'primary' ? colors.accentText : colors.accent;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={[
        styles.container,
        {
          width: config.size,
          height: config.size,
          borderRadius: config.size / 2,
          backgroundColor,
          shadowColor: colors.accent,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: variant === 'primary' ? 0.3 : 0.15,
          shadowRadius: 12,
          elevation: 8,
        },
        animatedStyle,
        style,
      ]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Icon size={config.icon} color={iconColor} strokeWidth={2.5} />
    </AnimatedPressable>
  );
}

// Secondary action that orbits around the main FAB
type OrbitalActionProps = {
  icon: 'plus' | 'terminal' | 'rocket';
  onPress: () => void;
  angle: number; // degrees
  distance: number;
  visible: boolean;
  label?: string;
};

export function OrbitalAction({
  icon,
  onPress,
  angle,
  distance,
  visible,
  label,
}: OrbitalActionProps) {
  const { colors } = useTheme();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);

  const rad = (angle * Math.PI) / 180;
  const targetX = Math.cos(rad) * distance;
  const targetY = Math.sin(rad) * distance;

  React.useEffect(() => {
    if (visible) {
      translateX.value = withSpring(targetX, { damping: 15 });
      translateY.value = withSpring(targetY, { damping: 15 });
      opacity.value = withSpring(1, { damping: 15 });
      scale.value = withSpring(1, { damping: 15 });
    } else {
      translateX.value = withSpring(0, { damping: 15 });
      translateY.value = withSpring(0, { damping: 15 });
      opacity.value = withSpring(0, { damping: 15 });
      scale.value = withSpring(0, { damping: 15 });
    }
  }, [visible, targetX, targetY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const Icon = iconMap[icon];

  return (
      <AnimatedPressable
        onPress={onPress}
        style={[
          styles.orbitalContainer,
          {
            backgroundColor: colors.accent,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 5,
          },
          animatedStyle,
        ]}
      >
        <Icon size={20} color={colors.accentText} strokeWidth={2} />
      </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitalContainer: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
