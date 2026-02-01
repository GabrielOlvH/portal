import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, StyleSheet, Pressable, Modal, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { ProviderIcon, providerColors } from '@/components/icons/ProviderIcons';
import { AppText } from '@/components/AppText';
import { ProviderUsage } from '@/lib/types';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { withAlpha } from '@/lib/colors';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type CompactUsageCardProps = {
  provider: 'claude' | 'codex' | 'copilot' | 'cursor' | 'kimi';
  usage: ProviderUsage;
  onPress?: () => void;
};

function formatReset(reset?: string): string {
  if (!reset) return 'soon';

  if (/^\d+[hmd]\s*/i.test(reset) || /^in\s+/i.test(reset)) {
    return reset.replace(/^in\s+/i, '').trim() || 'soon';
  }

  const date = new Date(reset);
  if (isNaN(date.getTime())) return reset;

  const now = Date.now();
  const diff = date.getTime() - now;
  if (diff <= 0) return 'soon';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function getUrgencyColor(percentLeft: number, colors: ThemeColors): string {
  if (percentLeft > 50) return colors.green;
  if (percentLeft > 20) return colors.orange;
  return colors.red;
}

function DoubleRing({
  size,
  strokeWidth,
  sessionPercent,
  weeklyPercent,
  sessionColor,
  weeklyColor,
  bgColor,
}: {
  size: number;
  strokeWidth: number;
  sessionPercent: number;
  weeklyPercent: number;
  sessionColor: string;
  weeklyColor: string;
  bgColor: string;
}) {
  const center = size / 2;
  const outerRadius = center - strokeWidth / 2;
  const innerRadius = outerRadius - strokeWidth - 2;

  const outerCircumference = 2 * Math.PI * outerRadius;
  const innerCircumference = 2 * Math.PI * innerRadius;

  // Calculate dash lengths for progress rings
  const outerDash = (weeklyPercent / 100) * outerCircumference;
  const innerDash = (sessionPercent / 100) * innerCircumference;

  // At 100%, don't use strokeDasharray - just render a complete circle
  const isOuterFull = weeklyPercent >= 100;
  const isInnerFull = sessionPercent >= 100;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={center}
        cy={center}
        r={outerRadius}
        fill="none"
        stroke={bgColor}
        strokeWidth={strokeWidth}
      />
      <Circle
        cx={center}
        cy={center}
        r={outerRadius}
        fill="none"
        stroke={weeklyColor}
        strokeWidth={strokeWidth}
        rotation={-90}
        origin={`${center}, ${center}`}
        {...(isOuterFull ? {} : {
          strokeDasharray: `${outerDash} ${outerCircumference}`,
          strokeLinecap: 'round' as const,
        })}
      />
      <Circle
        cx={center}
        cy={center}
        r={innerRadius}
        fill="none"
        stroke={bgColor}
        strokeWidth={strokeWidth}
      />
      <Circle
        cx={center}
        cy={center}
        r={innerRadius}
        fill="none"
        stroke={sessionColor}
        strokeWidth={strokeWidth}
        rotation={-90}
        origin={`${center}, ${center}`}
        {...(isInnerFull ? {} : {
          strokeDasharray: `${innerDash} ${innerCircumference}`,
          strokeLinecap: 'round' as const,
        })}
      />
    </Svg>
  );
}

export function CompactUsageCard({ provider, usage, onPress }: CompactUsageCardProps) {
  const { colors } = useTheme();
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const cardRef = useRef<View>(null);
  const scaleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionLeft = usage.session?.percentLeft;
  const weeklyLeft = usage.weekly?.percentLeft;
  const color = providerColors[provider];
  const hasWeekly = provider !== 'copilot' && weeklyLeft != null;
  const isWeeklyExhausted = hasWeekly && weeklyLeft <= 0;
  const scale = useSharedValue(1);

  if (sessionLeft == null) return null;

  const urgencyColor = getUrgencyColor(sessionLeft, colors);
  const displayColor = isWeeklyExhausted ? withAlpha(color, 0.3) : urgencyColor;
  const weeklyColor = hasWeekly ? color : colors.barBg;

  const hideTooltip = useCallback(() => {
    setShowTooltip(false);
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (scaleTimeoutRef.current) clearTimeout(scaleTimeoutRef.current);
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    };
  }, []);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.92, { damping: 15 });
    if (scaleTimeoutRef.current) clearTimeout(scaleTimeoutRef.current);
    scaleTimeoutRef.current = setTimeout(() => {
      scale.value = withSpring(1, { damping: 15 });
    }, 100);

    // Get card position for tooltip placement
    cardRef.current?.measure((x, y, width, height, pageX, pageY) => {
      const tooltipX = pageX + width / 2 - 80; // Center tooltip horizontally (160px width / 2)
      const tooltipY = pageY + height + 8; // Below the card with 8px gap
      
      // Ensure tooltip stays within screen bounds
      const clampedX = Math.max(10, Math.min(tooltipX, SCREEN_WIDTH - 170));
      
      setTooltipPosition({ x: clampedX, y: tooltipY });
      setShowTooltip(true);
    });

    // Hide after 3 seconds
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    tooltipTimeoutRef.current = setTimeout(() => {
      runOnJS(hideTooltip)();
    }, 3000);

    onPress?.();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <>
      <View ref={cardRef} collapsable={false}>
        <Pressable onPress={handlePress}>
          <Animated.View style={[styles.card, { backgroundColor: colors.card }, animatedStyle]}>
            <View style={styles.ringContainer}>
              <DoubleRing
                size={40}
                strokeWidth={4}
                sessionPercent={Math.max(0, sessionLeft)}
                weeklyPercent={Math.max(0, hasWeekly ? weeklyLeft : 100)}
                sessionColor={displayColor}
                weeklyColor={weeklyColor}
                bgColor={colors.barBg}
              />
              <View style={styles.iconOverlay}>
                <ProviderIcon provider={provider} size={16} color={colors.textSecondary} />
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </View>

      {/* Modal tooltip - positioned near the card */}
      <Modal
        visible={showTooltip}
        transparent
        animationType="none"
        onRequestClose={hideTooltip}
      >
        <Pressable style={styles.modalOverlay} onPress={hideTooltip}>
          <View 
            style={[
              styles.tooltip, 
              { 
                backgroundColor: colors.card,
                left: tooltipPosition.x,
                top: tooltipPosition.y,
              }
            ]}
            pointerEvents="none"
          >
            <View style={styles.tooltipContent}>
              <AppText variant="label" style={[styles.tooltipTitle, { color: colors.text }]} >
                {provider.charAt(0).toUpperCase() + provider.slice(1)}
              </AppText>
              
              <View style={styles.tooltipRow}>
                <View style={[styles.dot, { backgroundColor: displayColor }]} />
                <AppText variant="mono" style={[styles.tooltipText, { color: colors.text }]}>
                  Session: {Math.round(sessionLeft)}%
                </AppText>
              </View>
              {usage.session?.reset && (
                <AppText variant="label" tone="muted" style={styles.tooltipReset}>
                  Resets in {formatReset(usage.session.reset)}
                </AppText>
              )}

              {hasWeekly && (
                <>
                  <View style={styles.tooltipRow}>
                    <View style={[styles.dot, { backgroundColor: weeklyColor }]} />
                    <AppText variant="mono" style={[styles.tooltipText, { color: colors.text }]}>
                      Weekly: {Math.round(weeklyLeft)}%
                    </AppText>
                  </View>
                  {usage.weekly?.reset && (
                    <AppText variant="label" tone="muted" style={styles.tooltipReset}>
                      Resets in {formatReset(usage.weekly.reset)}
                    </AppText>
                  )}
                </>
              )}
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringContainer: {
    width: 40,
    height: 40,
    position: 'relative',
  },
  iconOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
  },
  tooltip: {
    position: 'absolute',
    width: 160,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  tooltipContent: {
    padding: 12,
    gap: 6,
  },
  tooltipTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tooltipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tooltipReset: {
    fontSize: 10,
    marginLeft: 12,
    marginTop: -2,
  },
});
