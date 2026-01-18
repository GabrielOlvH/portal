import React, { useMemo, useRef } from 'react';
import { StyleSheet, Pressable, Animated } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/AppText';
import { systemColors } from '@/lib/colors';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { Trash2 } from 'lucide-react-native';

type SwipeableRowProps = {
  children: React.ReactNode;
  onDelete?: () => void;
  onAction?: () => void;
  actionLabel?: string;
};

export function SwipeableRow({
  children,
  onDelete,
  onAction,
  actionLabel = 'Action',
}: SwipeableRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const swipeableRef = useRef<Swipeable>(null);

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeableRef.current?.close();
    onDelete?.();
  };

  const handleAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    swipeableRef.current?.close();
    onAction?.();
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    _dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (!onDelete) return null;

    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [80, 0],
    });

    return (
      <Animated.View style={[styles.rightAction, { transform: [{ translateX }] }]}>
        <Pressable
          style={[styles.actionButton, { backgroundColor: systemColors.red }]}
          onPress={handleDelete}
        >
          <Trash2 size={20} color={colors.accentText} />
        </Pressable>
      </Animated.View>
    );
  };

  const renderLeftActions = (
    progress: Animated.AnimatedInterpolation<number>,
    _dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (!onAction) return null;

    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [-100, 0],
    });

    return (
      <Animated.View style={[styles.leftAction, { transform: [{ translateX }] }]}>
        <Pressable
          style={[styles.actionButton, styles.leftActionButton, { backgroundColor: systemColors.blue }]}
          onPress={handleAction}
        >
          <AppText variant="label" style={styles.actionText}>
            {actionLabel}
          </AppText>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      leftThreshold={40}
      renderRightActions={onDelete ? renderRightActions : undefined}
      renderLeftActions={onAction ? renderLeftActions : undefined}
      onSwipeableWillOpen={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
    >
      {children}
    </Swipeable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  rightAction: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  leftAction: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  actionButton: {
    width: 80,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftActionButton: {
    width: 100,
  },
  actionText: {
    color: colors.accentText,
    fontWeight: '600',
  },
});
