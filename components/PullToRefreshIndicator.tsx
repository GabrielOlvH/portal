import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/useTheme';

type PullToRefreshProps = {
  refreshing: boolean;
  progress: number; // 0 to 1
};

export function PullToRefreshIndicator({ refreshing, progress }: PullToRefreshProps) {
  const { colors } = useTheme();
  const rotation = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    if (refreshing) {
      rotation.value = withTiming(rotation.value + 360, {
        duration: 1000,
      });
      scale.value = withSpring(1);
    } else {
      scale.value = withSpring(progress > 0.5 ? 1 : 0);
    }
  }, [refreshing, progress, rotation, scale]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress,
      [0, 0.3, 1],
      [0, 0.5, 1],
      Extrapolate.CLAMP
    ),
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.indicator,
          { borderColor: colors.accent },
          containerStyle,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: colors.accent }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
  },
  indicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
