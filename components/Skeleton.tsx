import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/lib/theme';
import { useTheme } from '@/lib/useTheme';
import { withAlpha } from '@/lib/colors';

function createStyles(colors: { card: string; cardPressed: string; separator: string }) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.cardPressed,
      overflow: 'hidden',
    },
    shimmer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 200,
    },
    gradient: {
      flex: 1,
      width: 200,
    },
    list: {
      gap: theme.spacing.sm,
    },
    sessionCard: {
      padding: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    sessionCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    sessionCardContent: {
      flex: 1,
      gap: 6,
    },
    sessionCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sessionCardSubtitle: {
      marginTop: 2,
    },
    hostCard: {
      padding: 16,
      gap: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    hostCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    hostCardTitleWrap: {
      flex: 1,
      gap: 4,
    },
    hostCardHostname: {
      marginTop: 2,
    },
    hostCardStats: {
      flexDirection: 'row',
      gap: 24,
    },
    hostCardStat: {
      gap: 4,
    },
    hostCardStatValue: {
      marginTop: 2,
    },
    hostCardActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    containerCard: {
      padding: 14,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    containerCardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    containerCardInfo: {
      flex: 1,
      gap: 6,
    },
    containerCardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    containerCardStats: {
      flexDirection: 'row',
      gap: 20,
    },
    containerCardStat: {
      gap: 4,
    },
    containerCardActions: {
      flexDirection: 'row',
      gap: 10,
    },
  });
}

function useSkeletonStyles() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return { colors, isDark, styles };
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const { colors, isDark, styles } = useSkeletonStyles();
  const shimmerPosition = useSharedValue(0);

  useEffect(() => {
    shimmerPosition.value = withRepeat(
      withTiming(1, {
        duration: 1200,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, [shimmerPosition]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          shimmerPosition.value,
          [0, 1],
          [-200, 200]
        ),
      },
    ],
  }));

  const shimmerColor = withAlpha(colors.text, isDark ? 0.2 : 0.12);

  return (
    <View
      style={[
        styles.container,
        {
          width: width as number,
          height,
          borderRadius,
        },
        style,
      ]}
    >
      <Animated.View style={[styles.shimmer, animatedStyle]}>
        <LinearGradient
          colors={[
            'transparent',
            shimmerColor,
            'transparent',
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.gradient}
        />
      </Animated.View>
    </View>
  );
}

type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

type SkeletonCardProps = {
  style?: ViewStyle;
};

export function SkeletonSessionCard({ style }: SkeletonCardProps) {
  const { styles } = useSkeletonStyles();

  return (
    <View style={[styles.sessionCard, style]}>
      <View style={styles.sessionCardRow}>
        <Skeleton width={4} height={36} borderRadius={2} />
        <View style={styles.sessionCardContent}>
          <View style={styles.sessionCardHeader}>
            <Skeleton width={120} height={18} />
            <Skeleton width={20} height={20} borderRadius={10} />
          </View>
          <Skeleton width={180} height={14} style={styles.sessionCardSubtitle} />
        </View>
      </View>
    </View>
  );
}

export function SkeletonHostCard({ style }: SkeletonCardProps) {
  const { styles } = useSkeletonStyles();

  return (
    <View style={[styles.hostCard, style]}>
      <View style={styles.hostCardHeader}>
        <Skeleton width={12} height={12} borderRadius={6} />
        <View style={styles.hostCardTitleWrap}>
          <Skeleton width={100} height={18} />
          <Skeleton width={140} height={14} style={styles.hostCardHostname} />
        </View>
        <Skeleton width={60} height={24} borderRadius={12} />
      </View>
      <View style={styles.hostCardStats}>
        <View style={styles.hostCardStat}>
          <Skeleton width={50} height={12} />
          <Skeleton width={24} height={16} style={styles.hostCardStatValue} />
        </View>
        <View style={styles.hostCardStat}>
          <Skeleton width={60} height={12} />
          <Skeleton width={24} height={16} style={styles.hostCardStatValue} />
        </View>
      </View>
      <View style={styles.hostCardActions}>
        <Skeleton width={90} height={32} borderRadius={8} />
        <Skeleton width={80} height={32} borderRadius={8} />
      </View>
    </View>
  );
}

export function SkeletonContainerCard({ style }: SkeletonCardProps) {
  const { styles } = useSkeletonStyles();

  return (
    <View style={[styles.containerCard, style]}>
      <View style={styles.containerCardHeader}>
        <Skeleton width={8} height={8} borderRadius={4} />
        <View style={styles.containerCardInfo}>
          <Skeleton width={140} height={18} />
          <View style={styles.containerCardMeta}>
            <Skeleton width={70} height={20} borderRadius={10} />
            <Skeleton width={50} height={14} />
          </View>
        </View>
      </View>
      <View style={styles.containerCardStats}>
        <View style={styles.containerCardStat}>
          <Skeleton width={30} height={12} />
          <Skeleton width={40} height={14} />
        </View>
        <View style={styles.containerCardStat}>
          <Skeleton width={40} height={12} />
          <Skeleton width={50} height={14} />
        </View>
      </View>
      <View style={styles.containerCardActions}>
        <Skeleton width={80} height={28} borderRadius={6} />
        <Skeleton width={60} height={28} borderRadius={6} />
      </View>
    </View>
  );
}

type SkeletonListProps = {
  count?: number;
  type: 'session' | 'host' | 'container';
  style?: ViewStyle;
};

export function SkeletonList({ count = 3, type, style }: SkeletonListProps) {
  const { styles } = useSkeletonStyles();
  const CardComponent =
    type === 'session'
      ? SkeletonSessionCard
      : type === 'host'
        ? SkeletonHostCard
        : SkeletonContainerCard;

  return (
    <View style={[styles.list, style]}>
      {Array.from({ length: count }).map((_, index) => (
        <CardComponent key={index} />
      ))}
    </View>
  );
}
