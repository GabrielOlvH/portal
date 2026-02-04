import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, StyleSheet, Pressable, Modal, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Check, X, Clock, Server } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { ProviderIcon, providerColors } from '@/components/icons/ProviderIcons';
import { AppText } from '@/components/AppText';
import { ProviderUsage, GitHubCommitStatus } from '@/lib/types';
import { ThemeColors, useTheme } from '@/lib/useTheme';
import { withAlpha } from '@/lib/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ProviderType = 'claude' | 'codex' | 'copilot' | 'cursor' | 'kimi';

type UsageData = {
  claude: ProviderUsage | null;
  codex: ProviderUsage | null;
  copilot: ProviderUsage | null;
  cursor: ProviderUsage | null;
  kimi: ProviderUsage | null;
};

type UsageVisibility = {
  claude: boolean;
  codex: boolean;
  copilot: boolean;
  cursor: boolean;
  kimi: boolean;
};

type CISummary = {
  total: number;
  success: number;
  failure: number;
  pending: number;
};

type HostSummary = {
  online: number;
  total: number;
  names: string[];
};

type StatusBarProps = {
  usage: UsageData;
  usageVisibility: UsageVisibility;
  ciSummary: CISummary | null;
  ciEnabled: boolean;
  hostSummary: HostSummary;
  onCIPress?: () => void;
};

function getUrgencyColor(percentLeft: number, colors: ThemeColors): string {
  if (percentLeft > 50) return colors.green;
  if (percentLeft > 20) return colors.orange;
  return colors.red;
}

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

// Mini ring for usage icon
function MiniRing({
  size,
  strokeWidth,
  percent,
  color,
  bgColor,
}: {
  size: number;
  strokeWidth: number;
  percent: number;
  color: string;
  bgColor: string;
}) {
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;
  const isFull = percent >= 100;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={bgColor}
        strokeWidth={strokeWidth}
      />
      <Circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        rotation={-90}
        origin={`${center}, ${center}`}
        {...(isFull ? {} : {
          strokeDasharray: `${dash} ${circumference}`,
          strokeLinecap: 'round' as const,
        })}
      />
    </Svg>
  );
}

// Single usage icon with progress ring
function UsageIcon({
  provider,
  usage,
  colors,
}: {
  provider: ProviderType;
  usage: ProviderUsage | null;
  colors: ThemeColors;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const iconRef = useRef<View>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scale = useSharedValue(1);

  const sessionLeft = usage?.session?.percentLeft;
  const weeklyLeft = usage?.weekly?.percentLeft;
  const hasData = sessionLeft != null;

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    };
  }, []);

  const hideTooltip = useCallback(() => {
    setShowTooltip(false);
  }, []);

  const handlePress = () => {
    if (!hasData) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.9, { damping: 15 });
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 15 });
    }, 100);

    iconRef.current?.measure((x, y, width, height, pageX, pageY) => {
      const tooltipX = pageX + width / 2 - 75;
      const tooltipY = pageY + height + 8;
      const clampedX = Math.max(10, Math.min(tooltipX, SCREEN_WIDTH - 160));
      setTooltipPosition({ x: clampedX, y: tooltipY });
      setShowTooltip(true);
    });

    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    tooltipTimeoutRef.current = setTimeout(() => {
      runOnJS(hideTooltip)();
    }, 3000);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const urgencyColor = hasData ? getUrgencyColor(sessionLeft, colors) : colors.textMuted;
  const providerColor = providerColors[provider];
  const hasWeekly = provider !== 'copilot' && weeklyLeft != null;

  return (
    <>
      <View ref={iconRef} collapsable={false}>
        <Pressable onPress={handlePress} disabled={!hasData}>
          <Animated.View style={[styles.usageIcon, animatedStyle]}>
            <View style={styles.ringWrapper}>
              <MiniRing
                size={28}
                strokeWidth={2.5}
                percent={hasData ? Math.max(0, sessionLeft) : 0}
                color={hasData ? urgencyColor : colors.barBg}
                bgColor={colors.barBg}
              />
              <View style={styles.iconCenter}>
                <ProviderIcon
                  provider={provider}
                  size={12}
                  color={hasData ? colors.textSecondary : colors.textMuted}
                />
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </View>

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
                backgroundColor: colors.background,
                left: tooltipPosition.x,
                top: tooltipPosition.y,
                borderColor: colors.separator,
              },
            ]}
          >
            <AppText variant="label" style={{ fontWeight: '600', marginBottom: 4 }}>
              {provider.charAt(0).toUpperCase() + provider.slice(1)}
            </AppText>
            <View style={styles.tooltipRow}>
              <View style={[styles.dot, { backgroundColor: urgencyColor }]} />
              <AppText variant="mono" style={{ fontSize: 11 }}>
                Session: {Math.round(sessionLeft ?? 0)}%
              </AppText>
            </View>
            {usage?.session?.reset && (
              <AppText variant="label" tone="muted" style={{ fontSize: 10, marginLeft: 10 }}>
                Resets {formatReset(usage.session.reset)}
              </AppText>
            )}
            {hasWeekly && (
              <>
                <View style={styles.tooltipRow}>
                  <View style={[styles.dot, { backgroundColor: providerColor }]} />
                  <AppText variant="mono" style={{ fontSize: 11 }}>
                    Weekly: {Math.round(weeklyLeft ?? 0)}%
                  </AppText>
                </View>
                {usage?.weekly?.reset && (
                  <AppText variant="label" tone="muted" style={{ fontSize: 10, marginLeft: 10 }}>
                    Resets {formatReset(usage.weekly.reset)}
                  </AppText>
                )}
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function StatusBar({
  usage,
  usageVisibility,
  ciSummary,
  ciEnabled,
  hostSummary,
  onCIPress,
}: StatusBarProps) {
  const { colors } = useTheme();

  const providers: ProviderType[] = ['claude', 'codex', 'copilot', 'cursor', 'kimi'];
  const visibleProviders = providers.filter((p) => usageVisibility[p]);
  const hasUsageData = visibleProviders.some((p) => usage[p]?.session?.percentLeft != null);

  const hasCI = ciEnabled && ciSummary && ciSummary.total > 0;
  const ciHasFailures = hasCI && (ciSummary.failure > 0);
  const ciHasPending = hasCI && ciSummary.pending > 0;

  // Host summary text
  const hostText = useMemo(() => {
    if (hostSummary.total === 0) return null;
    if (hostSummary.total <= 2 && hostSummary.names.length > 0) {
      return hostSummary.names.join(' · ');
    }
    return `${hostSummary.online}/${hostSummary.total}`;
  }, [hostSummary]);

  if (!hasUsageData && !hasCI && hostSummary.total === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Usage Icons */}
      {hasUsageData && (
        <View style={styles.usageSection}>
          {visibleProviders.map((provider) => (
            <UsageIcon
              key={provider}
              provider={provider}
              usage={usage[provider]}
              colors={colors}
            />
          ))}
        </View>
      )}

      {/* Separator */}
      {hasUsageData && (hasCI || hostText) && (
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
      )}

      {/* CI Status */}
      {hasCI && (
        <Pressable style={styles.ciSection} onPress={onCIPress}>
          <View style={styles.ciDots}>
            {ciSummary.success > 0 && (
              <View style={styles.ciDot}>
                <Check size={10} color={colors.green} />
                <AppText variant="mono" style={[styles.ciCount, { color: colors.green }]}>
                  {ciSummary.success}
                </AppText>
              </View>
            )}
            {ciSummary.failure > 0 && (
              <View style={styles.ciDot}>
                <X size={10} color={colors.red} />
                <AppText variant="mono" style={[styles.ciCount, { color: colors.red }]}>
                  {ciSummary.failure}
                </AppText>
              </View>
            )}
            {ciSummary.pending > 0 && (
              <View style={styles.ciDot}>
                <Clock size={10} color={colors.orange} />
                <AppText variant="mono" style={[styles.ciCount, { color: colors.orange }]}>
                  {ciSummary.pending}
                </AppText>
              </View>
            )}
          </View>
        </Pressable>
      )}

      {/* Separator */}
      {hasCI && hostText && (
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
      )}

      {/* Host Summary */}
      {hostText && (
        <View style={styles.hostSection}>
          <Server size={12} color={colors.textMuted} />
          <AppText variant="mono" tone="muted" style={styles.hostText}>
            {hostText}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 12,
  },
  usageSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  usageIcon: {
    width: 28,
    height: 28,
  },
  ringWrapper: {
    width: 28,
    height: 28,
    position: 'relative',
  },
  iconCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    width: 1,
    height: 20,
  },
  ciSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ciDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ciDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ciCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  hostSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hostText: {
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
  },
  tooltip: {
    position: 'absolute',
    width: 150,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
