import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/useTheme';

export type WorkspaceIndicatorProps = {
  total: number;
  current: number;
  onSelect: (index: number) => void;
};

const DOT_SIZE = 6;
const ACTIVE_DOT_SIZE = 8;
const DOT_GAP = 6;
const PADDING_V = 6;

export function WorkspaceIndicator({ total, current, onSelect }: WorkspaceIndicatorProps) {
  const { colors } = useTheme();
  const lastSelectedRef = useRef(current);

  const getIndexFromY = useCallback((y: number) => {
    const dotStep = DOT_SIZE + DOT_GAP;
    const idx = Math.round((y - PADDING_V - DOT_SIZE / 2) / dotStep);
    return Math.max(0, Math.min(total - 1, idx));
  }, [total]);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      const idx = getIndexFromY(e.y);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(idx);
      lastSelectedRef.current = idx;
    });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => {
      const idx = getIndexFromY(e.y);
      if (idx !== lastSelectedRef.current) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSelect(idx);
        lastSelectedRef.current = idx;
      }
    })
    .onUpdate((e) => {
      const idx = getIndexFromY(e.y);
      if (idx !== lastSelectedRef.current) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSelect(idx);
        lastSelectedRef.current = idx;
      }
    });

  const composed = Gesture.Race(pan, tap);

  if (total <= 1) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <GestureDetector gesture={composed}>
        <View style={styles.track} collapsable={false}>
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={i}
              style={{
                backgroundColor: i === current ? colors.accent : 'rgba(255,255,255,0.3)',
                width: i === current ? ACTIVE_DOT_SIZE : DOT_SIZE,
                height: i === current ? ACTIVE_DOT_SIZE : DOT_SIZE,
                borderRadius: i === current ? ACTIVE_DOT_SIZE / 2 : DOT_SIZE / 2,
              }}
            />
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 6,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  track: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    paddingVertical: PADDING_V,
    paddingHorizontal: 8,
    gap: DOT_GAP,
    alignItems: 'center',
  },
});
