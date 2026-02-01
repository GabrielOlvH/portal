import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/useTheme';
import { AppText } from './AppText';
import { withAlpha } from '@/lib/colors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type HealthRingProps = {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  color?: string;
};

export function HealthRing({
  value,
  size = 56,
  strokeWidth = 6,
  label,
  color,
}: HealthRingProps) {
  const { colors } = useTheme();
  
  const ringColor = color || (value > 80 ? colors.red : value > 50 ? colors.orange : colors.green);
  
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);
  
  React.useEffect(() => {
    progress.value = withSpring(value / 100, {
      damping: 15,
      stiffness: 100,
    });
  }, [value]);
  
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));
  
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.barBg}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.content}>
        <AppText variant="mono" style={[styles.value, { fontSize: size > 50 ? 14 : 11 }]}>
          {Math.round(value)}%
        </AppText>
        {label && (
          <AppText variant="label" tone="muted" style={[styles.label, { fontSize: size > 50 ? 9 : 7 }]}>
            {label}
          </AppText>
        )}
      </View>
    </View>
  );
}

type DualHealthRingsProps = {
  cpu: number;
  ram: number;
  size?: number;
};

export function DualHealthRings({ cpu, ram, size = 64 }: DualHealthRingsProps) {
  const { colors } = useTheme();
  const strokeWidth = 5;
  const gap = 3;
  
  const cpuRadius = (size - strokeWidth) / 2;
  const ramRadius = cpuRadius - strokeWidth - gap;
  
  const cpuCircumference = 2 * Math.PI * cpuRadius;
  const ramCircumference = 2 * Math.PI * ramRadius;
  
  const cpuProgress = useSharedValue(0);
  const ramProgress = useSharedValue(0);
  
  React.useEffect(() => {
    cpuProgress.value = withSpring(cpu / 100, { damping: 15, stiffness: 100 });
    ramProgress.value = withSpring(ram / 100, { damping: 15, stiffness: 100 });
  }, [cpu, ram]);
  
  const cpuAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: cpuCircumference * (1 - cpuProgress.value),
  }));
  
  const ramAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: ramCircumference * (1 - ramProgress.value),
  }));
  
  const getColor = (value: number) => {
    if (value > 80) return colors.red;
    if (value > 50) return colors.orange;
    return colors.green;
  };
  
  return (
    <View style={[styles.dualContainer, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={cpuRadius}
          stroke={colors.barBg}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={ramRadius}
          stroke={colors.barBg}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={cpuRadius}
          stroke={getColor(cpu)}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={cpuCircumference}
          animatedProps={cpuAnimatedProps}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={ramRadius}
          stroke={getColor(ram)}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={ramCircumference}
          animatedProps={ramAnimatedProps}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.dualContent}>
        <AppText variant="mono" style={[styles.dualLabel, { color: colors.textMuted }]}>
          CPU
        </AppText>
        <AppText variant="mono" style={[styles.dualValue, { color: getColor(cpu) }]}>
          {Math.round(cpu)}%
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontWeight: '700',
  },
  label: {
    marginTop: 2,
  },
  dualContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dualContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dualLabel: {
    fontSize: 8,
  },
  dualValue: {
    fontSize: 12,
    fontWeight: '700',
  },
});
