import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from '@/components/AppText';
import { ProviderIcon } from '@/components/icons/ProviderIcons';
import { WindowContent } from './WindowContent';
import { LaunchpadPage } from './LaunchpadPage';
import { WorkspaceIndicator } from './WorkspaceIndicator';
import { useTheme } from '@/lib/useTheme';
import { useStore } from '@/lib/store';
import type { Workspace, SessionWithHost, Window } from '@/lib/workspace-types';

type ProviderName = 'claude' | 'codex' | 'copilot' | 'cursor' | 'kimi';

// ─── Constants ────────────────────────────────────────────────────────────────

const H_GAP = 12;
const V_GAP = 24;
const SPRING = { damping: 20, stiffness: 200, mass: 0.8 };
const OVERVIEW_TOP_INSET = 96;
const OVERVIEW_BOTTOM_INSET = 108;

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkspaceGridProps = {
  workspaces: Workspace[];
  sessionMap: Map<string, SessionWithHost>;
  activeWorkspaceIndex: number;
  activeWindowIndices: Map<number, number>;
  onWorkspaceChanged: (index: number) => void;
  onWindowChanged: (wsIdx: number, winIdx: number) => void;
  onCloseWindow: (wsIdx: number, windowId: string) => void;
  onKillWindow: (wsIdx: number, windowId: string) => void;
  onMoveWindow: (sourceWsIdx: number, windowId: string, targetWsIdx: number, targetIndex: number) => void;
  onOpenWindow: (wsIdx: number, route: string, params?: Record<string, string>) => void;
  onNewSession: () => void;
  providerUsage: { provider: ProviderName; percentLeft: number }[];
  totalWorkspaces: number;
};

type DragState = {
  sourceWsIdx: number;
  sourceWinIdx: number;
  windowId: string;
  label: string;
  x: number;
  y: number;
  targetWsIdx: number;
  targetIndex: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(val, min), max);
}

function getWindowLabel(win: Window): string {
  if (win.route === 'terminal') {
    return win.params?.sessionName ?? 'Terminal';
  }
  if (win.route === 'browser') {
    const url = win.params?.url;
    if (!url) return 'Browser';
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }
  return win.route.charAt(0).toUpperCase() + win.route.slice(1);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceGrid({
  workspaces,
  sessionMap,
  activeWorkspaceIndex,
  activeWindowIndices,
  onWorkspaceChanged,
  onWindowChanged,
  onCloseWindow,
  onKillWindow,
  onMoveWindow,
  onOpenWindow,
  onNewSession,
  providerUsage,
  totalWorkspaces,
}: WorkspaceGridProps) {
  const { colors } = useTheme();
  const { preferences } = useStore();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: windowWidth, height: windowHeight });
  const screenWidth = viewport.width;
  const screenHeight = viewport.height;

  const handleLayout = useCallback((event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setViewport((prev) => (
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height }
    ));
  }, []);

  // ─── Gesture debug toast ──────────────────────────────────────────

  const [gestureToast, setGestureToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showGestureToast = useCallback((label: string) => {
    if (!preferences.debug.gestureToasts) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setGestureToast(label);
    toastTimer.current = setTimeout(() => setGestureToast(null), 1200);
  }, [preferences.debug.gestureToasts]);

  // ─── Overview state ───────────────────────────────────────────────

  const [isOverview, setIsOverview] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const overviewProgress = useSharedValue(0);

  // ─── Shared values for focused position ───────────────────────────

  const focusedCol = useSharedValue(activeWindowIndices.get(activeWorkspaceIndex) ?? 0);
  const focusedRow = useSharedValue(activeWorkspaceIndex);
  const rowOverviewOffsets = useSharedValue<number[]>([]);
  const overviewGlobalYOffset = useSharedValue(0);
  const overviewPanRow = useSharedValue(-1);
  const overviewPanRowStartOffset = useSharedValue(0);
  const overviewPanStartGlobalY = useSharedValue(0);

  // ─── Grid dimensions ──────────────────────────────────────────────

  const maxCols = useMemo(() => {
    let max = 1;
    for (const ws of workspaces) {
      max = Math.max(max, ws.windows.length + 1);
    }
    return max;
  }, [workspaces]);

  const numRows = totalWorkspaces;
  const gridW = maxCols * screenWidth + (maxCols - 1) * H_GAP;
  const gridH = numRows * screenHeight + (numRows - 1) * V_GAP;
  const overviewAvailableHeight = Math.max(1, screenHeight - OVERVIEW_TOP_INSET - OVERVIEW_BOTTOM_INSET);
  const fitScale = Math.min(screenWidth / gridW, overviewAvailableHeight / gridH) * 0.92;
  const oScale = Math.max(fitScale, 0.38);
  const rowMaxCols = useMemo(
    () => Array.from({ length: numRows }, (_, row) => (
      row < workspaces.length ? workspaces[row].windows.length : 0
    )),
    [numRows, workspaces]
  );
  const getMaxColForRow = useCallback((row: number) => (
    row < workspaces.length ? workspaces[row].windows.length : 0
  ), [workspaces]);

  const getSavedColForRow = useCallback((row: number) => {
    const maxCol = getMaxColForRow(row);
    const saved = activeWindowIndices.get(row) ?? 0;
    return Math.min(Math.max(saved, 0), maxCol);
  }, [activeWindowIndices, getMaxColForRow]);

  const getCenteredOffsetForCol = useCallback((col: number) => {
    const worldViewportW = screenWidth / oScale;
    const baseTx = (worldViewportW - gridW) / 2;
    const activeCenter = col * (screenWidth + H_GAP) + screenWidth / 2;
    return worldViewportW / 2 - activeCenter - baseTx;
  }, [screenWidth, oScale, gridW]);

  const getCenteredRowOffset = useCallback((row: number, col: number) => {
    const maxCol = getMaxColForRow(row);
    const clampedCol = Math.min(Math.max(col, 0), maxCol);
    return getCenteredOffsetForCol(clampedCol);
  }, [getMaxColForRow, getCenteredOffsetForCol]);

  const getCenteredOverviewYOffset = useCallback((row: number) => {
    const worldViewportH = overviewAvailableHeight / oScale;
    const baseNoInset = (worldViewportH - gridH) / 2;
    const centerOffsetForRow = (rowIndex: number) => (
      worldViewportH / 2 - (rowIndex * (screenHeight + V_GAP) + screenHeight / 2) - baseNoInset
    );
    const minOffset = Math.min(centerOffsetForRow(0), centerOffsetForRow(Math.max(0, numRows - 1)));
    const maxOffset = Math.max(centerOffsetForRow(0), centerOffsetForRow(Math.max(0, numRows - 1)));
    return clamp(centerOffsetForRow(row), minOffset, maxOffset);
  }, [overviewAvailableHeight, oScale, gridH, screenHeight, numRows]);

  useEffect(() => {
    const current = rowOverviewOffsets.value;
    rowOverviewOffsets.value = Array.from({ length: numRows }, (_, i) => current[i] ?? 0);
  }, [numRows, rowOverviewOffsets]);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  const getOverviewWorldTransforms = useCallback(() => {
    const worldViewportW = screenWidth / oScale;
    const worldViewportH = overviewAvailableHeight / oScale;
    const tx = (worldViewportW - gridW) / 2;
    const ty = OVERVIEW_TOP_INSET / oScale + (worldViewportH - gridH) / 2 + overviewGlobalYOffset.value;
    return { tx, ty };
  }, [screenWidth, oScale, overviewAvailableHeight, gridW, gridH, overviewGlobalYOffset]);

  const screenToOverviewCell = useCallback((x: number, y: number): { wsIdx: number; index: number } | null => {
    if (!isOverview) return null;
    const { tx, ty } = getOverviewWorldTransforms();
    const worldY = y / oScale - ty;
    const row = Math.min(Math.max(Math.floor(worldY / (screenHeight + V_GAP)), 0), numRows - 1);

    const worldX = x / oScale - tx;
    const rowOffset = rowOverviewOffsets.value[row] ?? 0;
    const relativeX = worldX - rowOffset;
    const rawIndex = Math.round(relativeX / (screenWidth + H_GAP));
    const maxIndex = row < workspaces.length ? workspaces[row].windows.length : 0;
    const index = Math.min(Math.max(rawIndex, 0), maxIndex);

    return { wsIdx: row, index };
  }, [isOverview, getOverviewWorldTransforms, oScale, screenHeight, numRows, rowOverviewOffsets, screenWidth, workspaces]);

  const getOverviewCellCenter = useCallback((wsIdx: number, winIdx: number): { x: number; y: number } => {
    const { tx, ty } = getOverviewWorldTransforms();
    const rowOffset = rowOverviewOffsets.value[wsIdx] ?? 0;
    const worldX = winIdx * (screenWidth + H_GAP) + rowOffset + screenWidth / 2;
    const worldY = wsIdx * (screenHeight + V_GAP) + screenHeight / 2;
    return {
      x: oScale * (worldX + tx),
      y: oScale * (worldY + ty),
    };
  }, [getOverviewWorldTransforms, rowOverviewOffsets, screenWidth, screenHeight, oScale]);

  const startWindowDrag = useCallback((wsIdx: number, winIdx: number, win: Window, touchX?: number, touchY?: number) => {
    if (!isOverview || wsIdx >= workspaces.length || winIdx >= workspaces[wsIdx].windows.length) return;
    const center = getOverviewCellCenter(wsIdx, winIdx);
    const next: DragState = {
      sourceWsIdx: wsIdx,
      sourceWinIdx: winIdx,
      windowId: win.id,
      label: getWindowLabel(win),
      x: typeof touchX === 'number' ? touchX : center.x,
      y: typeof touchY === 'number' ? touchY : center.y,
      targetWsIdx: wsIdx,
      targetIndex: winIdx,
    };
    dragStateRef.current = next;
    setDragState(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showGestureToast('Drag window');
  }, [isOverview, workspaces, getOverviewCellCenter, showGestureToast]);

  const updateWindowDrag = useCallback((x: number, y: number) => {
    setDragState((prev) => {
      if (!prev) return prev;
      const target = screenToOverviewCell(x, y);
      if (!target) return { ...prev, x, y };
      return {
        ...prev,
        x,
        y,
        targetWsIdx: target.wsIdx,
        targetIndex: target.index,
      };
    });
  }, [screenToOverviewCell]);

  const finishWindowDrag = useCallback((cancelled: boolean) => {
    const current = dragStateRef.current;
    if (!current) return;
    dragStateRef.current = null;
    setDragState(null);

    if (cancelled) return;
    const noOpSameWorkspace =
      current.targetWsIdx === current.sourceWsIdx &&
      (current.targetIndex === current.sourceWinIdx || current.targetIndex === current.sourceWinIdx + 1);
    if (noOpSameWorkspace) return;
    onMoveWindow(current.sourceWsIdx, current.windowId, current.targetWsIdx, current.targetIndex);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showGestureToast('Window moved');
  }, [onMoveWindow, showGestureToast]);

  useEffect(() => {
    if (isOverview) return;
    dragStateRef.current = null;
    setDragState(null);
  }, [isOverview]);

  // ─── Animated grid container style ────────────────────────────────

  const containerStyle = useAnimatedStyle(() => {
    const fTx = -focusedCol.value * (screenWidth + H_GAP);
    const fTy = -focusedRow.value * (screenHeight + V_GAP);

    const oTx = (screenWidth / oScale - gridW) / 2;
    const worldViewportH = overviewAvailableHeight / oScale;
    const oTy = OVERVIEW_TOP_INSET / oScale + (worldViewportH - gridH) / 2 + overviewGlobalYOffset.value;

    const tx = interpolate(overviewProgress.value, [0, 1], [fTx, oTx]);
    const ty = interpolate(overviewProgress.value, [0, 1], [fTy, oTy]);
    const scale = interpolate(overviewProgress.value, [0, 1], [1, oScale]);

    return {
      transform: [{ scale }, { translateX: tx }, { translateY: ty }],
    };
  });

  // ─── Derived values for virtualization ────────────────────────────

  const focusedRowRounded = useDerivedValue(() => Math.round(focusedRow.value));
  const focusedColRounded = useDerivedValue(() => Math.round(focusedCol.value));
  const overviewDerived = useDerivedValue(() => overviewProgress.value);

  // ─── JS callbacks ─────────────────────────────────────────────────

  const enterOverview = useCallback(() => {
    Keyboard.dismiss();
    const nextOffsets = Array.from({ length: numRows }, (_, row) => {
      const savedCol = getSavedColForRow(row);
      return getCenteredRowOffset(row, savedCol);
    });
    rowOverviewOffsets.value = nextOffsets;
    const anchorRow = workspaces.length > 0
      ? Math.min(activeWorkspaceIndex, workspaces.length - 1)
      : 0;
    overviewGlobalYOffset.value = getCenteredOverviewYOffset(anchorRow);
    setIsOverview(true);
  }, [
    numRows,
    getSavedColForRow,
    getCenteredRowOffset,
    rowOverviewOffsets,
    overviewGlobalYOffset,
    getCenteredOverviewYOffset,
    activeWorkspaceIndex,
    workspaces.length,
  ]);
  const exitOverview = useCallback(() => { setIsOverview(false); }, []);
  const onPinchBegin = useCallback(() => { setIsPinching(true); }, []);
  const onPinchEnd = useCallback(() => { setIsPinching(false); }, []);

  const navigateCol = useCallback((rowIdx: number, col: number) => {
    Keyboard.dismiss();
    onWindowChanged(rowIdx, col);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [onWindowChanged]);

  const navigateRow = useCallback((row: number) => {
    const savedCol = getSavedColForRow(row);
    Keyboard.dismiss();
    focusedRow.value = withSpring(row, SPRING);
    focusedCol.value = withSpring(savedCol, SPRING);
    onWorkspaceChanged(row);
    onWindowChanged(row, savedCol);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, [focusedRow, focusedCol, getSavedColForRow, onWorkspaceChanged, onWindowChanged]);

  const navigateRowDelta = useCallback((delta: number) => {
    const maxRow = numRows - 1;
    const next = clamp(Math.round(focusedRow.value) + delta, 0, maxRow);
    if (next === Math.round(focusedRow.value)) return;
    navigateRow(next);
  }, [focusedRow, numRows, navigateRow]);

  const isLaunchpadActive = useMemo(() => {
    const row = activeWorkspaceIndex;
    if (row >= workspaces.length) return true; // implicit empty workspace row
    const col = activeWindowIndices.get(row) ?? 0;
    return col >= workspaces[row].windows.length;
  }, [activeWorkspaceIndex, activeWindowIndices, workspaces]);

  useEffect(() => {
    if (isOverview) return;
    const row = activeWorkspaceIndex;
    const col = getSavedColForRow(row);
    focusedRow.value = withSpring(row, SPRING);
    focusedCol.value = withSpring(col, SPRING);
  }, [activeWorkspaceIndex, getSavedColForRow, focusedRow, focusedCol, isOverview]);

  // ─── Gestures ───────────────────────────────────────────────────────

  const nativeContentGesture = Gesture.Native();

  // Pinch — toggle overview (with deadzone to avoid conflicts with two-finger flings)
  const pinchStartOverview = useSharedValue(0);
  const pinchActivated = useSharedValue(false);
  const PINCH_DEADZONE = 0.12; // scale must deviate this much from 1.0 before pinch engages
  const pinchGesture = Gesture.Pinch()
    .simultaneousWithExternalGesture(nativeContentGesture)
    .onBegin(() => {
      pinchActivated.value = false;
      runOnJS(onPinchBegin)();
      pinchStartOverview.value = overviewProgress.value;
    })
    .onUpdate((e) => {
      // Don't engage pinch until scale deviates enough from 1.0
      if (!pinchActivated.value) {
        if (Math.abs(e.scale - 1.0) < PINCH_DEADZONE) return;
        pinchActivated.value = true;
      }
      if (pinchStartOverview.value > 0.5) {
        overviewProgress.value = clamp(
          interpolate(e.scale, [1.0, 1.5], [1, 0]),
          0, 1,
        );
      } else {
        overviewProgress.value = clamp(
          interpolate(e.scale, [1.0, 0.6], [0, 1]),
          0, 1,
        );
      }
    })
    .onEnd(() => {
      if (!pinchActivated.value) {
        // Pinch never passed deadzone — skip overview toggle
        runOnJS(onPinchEnd)();
        return;
      }
      const target = overviewProgress.value > 0.4 ? 1 : 0;
      overviewProgress.value = withSpring(target, SPRING);
      if (target === 1) {
        runOnJS(enterOverview)();
        runOnJS(showGestureToast)('Pinch: overview');
      } else {
        runOnJS(exitOverview)();
        runOnJS(showGestureToast)('Pinch: exit overview');
      }
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Heavy);
    })
    .onFinalize(() => {
      runOnJS(onPinchEnd)();
    });

  // Two-finger flings — switch workspaces (fling-only, no pan to avoid scroll conflicts)
  const twoFingerFlingUp = Gesture.Fling()
    .enabled(!isOverview && !dragState)
    .numberOfPointers(2)
    .direction(Directions.UP)
    .simultaneousWithExternalGesture(nativeContentGesture)
    .blocksExternalGesture(nativeContentGesture)
    .onEnd(() => {
      if (overviewProgress.value > 0.3) return;
      runOnJS(navigateRowDelta)(1);
      runOnJS(showGestureToast)('2-finger fling up');
    });

  const twoFingerFlingDown = Gesture.Fling()
    .enabled(!isOverview && !dragState)
    .numberOfPointers(2)
    .direction(Directions.DOWN)
    .simultaneousWithExternalGesture(nativeContentGesture)
    .blocksExternalGesture(nativeContentGesture)
    .onEnd(() => {
      if (overviewProgress.value > 0.3) return;
      runOnJS(navigateRowDelta)(-1);
      runOnJS(showGestureToast)('2-finger fling down');
    });

  const overviewPan = Gesture.Pan()
    .enabled(isOverview && !dragState)
    .minPointers(1)
    .maxPointers(1)
    .onBegin((e) => {
      const worldViewportH = overviewAvailableHeight / oScale;
      const oTy = OVERVIEW_TOP_INSET / oScale + (worldViewportH - gridH) / 2;
      const worldY = e.y / oScale - (oTy + overviewGlobalYOffset.value);
      const row = clamp(Math.floor(worldY / (screenHeight + V_GAP)), 0, numRows - 1);
      overviewPanRow.value = row;
      overviewPanRowStartOffset.value = rowOverviewOffsets.value[row] ?? 0;
      overviewPanStartGlobalY.value = overviewGlobalYOffset.value;
    })
    .onUpdate((e) => {
      if (overviewProgress.value < 0.5) return;
      const row = overviewPanRow.value;
      if (row < 0) return;

      const worldViewportH = overviewAvailableHeight / oScale;
      const baseNoInset = (worldViewportH - gridH) / 2;
      let nextGlobalY = overviewPanStartGlobalY.value + (e.translationY / oScale);
      const centerOffsetForRow = (rowIndex: number) => (
        worldViewportH / 2 - (rowIndex * (screenHeight + V_GAP) + screenHeight / 2) - baseNoInset
      );
      const minYOffset = Math.min(centerOffsetForRow(0), centerOffsetForRow(Math.max(0, numRows - 1)));
      const maxYOffset = Math.max(centerOffsetForRow(0), centerOffsetForRow(Math.max(0, numRows - 1)));
      nextGlobalY = clamp(nextGlobalY, minYOffset, maxYOffset);
      overviewGlobalYOffset.value = nextGlobalY;

      let nextOffset = overviewPanRowStartOffset.value + (e.translationX / oScale);
      const worldViewportW = screenWidth / oScale;
      const baseTx = (worldViewportW - gridW) / 2;
      const centerOffsetForCol = (col: number) => (
        worldViewportW / 2 - (col * (screenWidth + H_GAP) + screenWidth / 2) - baseTx
      );
      const maxCol = rowMaxCols[row] ?? 0;
      const minOffset = Math.min(centerOffsetForCol(0), centerOffsetForCol(maxCol));
      const maxOffset = Math.max(centerOffsetForCol(0), centerOffsetForCol(maxCol));
      nextOffset = clamp(nextOffset, minOffset, maxOffset);

      const next = rowOverviewOffsets.value.slice();
      next[row] = nextOffset;
      rowOverviewOffsets.value = next;
    })
    .onFinalize(() => {
      overviewPanRow.value = -1;
    });

  // Fling left → go to next window (discrete — doesn't block WebView touches)
  const flingLeft = Gesture.Fling()
    .enabled(!isOverview && !dragState)
    .direction(Directions.LEFT)
    .simultaneousWithExternalGesture(nativeContentGesture)
    .onEnd(() => {
      if (overviewProgress.value > 0.3) return;
      const rowIdx = Math.round(focusedRow.value);
      const maxCol = rowIdx < workspaces.length ? workspaces[rowIdx].windows.length : 0;
      const next = clamp(Math.round(focusedCol.value) + 1, 0, maxCol);
      focusedCol.value = withSpring(next, SPRING);
      runOnJS(navigateCol)(rowIdx, next);
      runOnJS(showGestureToast)('Fling left: next window');
    });

  // Fling right → go to previous window
  const flingRight = Gesture.Fling()
    .enabled(!isOverview && !dragState)
    .direction(Directions.RIGHT)
    .simultaneousWithExternalGesture(nativeContentGesture)
    .onEnd(() => {
      if (overviewProgress.value > 0.3) return;
      const rowIdx = Math.round(focusedRow.value);
      const maxCol = rowIdx < workspaces.length ? workspaces[rowIdx].windows.length : 0;
      const prev = clamp(Math.round(focusedCol.value) - 1, 0, maxCol);
      focusedCol.value = withSpring(prev, SPRING);
      runOnJS(navigateCol)(rowIdx, prev);
      runOnJS(showGestureToast)('Fling right: prev window');
    });

  // Compose: two-finger flings race each other; pinch runs simultaneously but
  // has a deadzone so quick two-finger flings don't accidentally trigger overview.
  const twoFingerWorkspaceSwitch = Gesture.Race(twoFingerFlingUp, twoFingerFlingDown);
  const twoFingerGestures = Gesture.Simultaneous(pinchGesture, twoFingerWorkspaceSwitch);
  const horizontalFlings = Gesture.Race(flingLeft, flingRight);
  const composedGesture = Gesture.Simultaneous(
    nativeContentGesture,
    twoFingerGestures,
    horizontalFlings,
    overviewPan,
  );

  // ─── Overview: tap cell to zoom in ────────────────────────────────

  const handleOverviewTap = useCallback((wsIdx: number, winIdx: number) => {
    if (dragStateRef.current) return;
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    focusedRow.value = withSpring(wsIdx, SPRING);
    focusedCol.value = withSpring(winIdx, SPRING);
    overviewProgress.value = withSpring(0, SPRING);
    setIsOverview(false);
    onWorkspaceChanged(wsIdx);
    onWindowChanged(wsIdx, winIdx);
  }, [focusedRow, focusedCol, overviewProgress, onWorkspaceChanged, onWindowChanged]);

  // ─── Animated styles ──────────────────────────────────────────────

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(overviewProgress.value, [0, 0.3], [1, 0]),
  }));

  const cellOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(overviewProgress.value, [0.3, 0.7], [0, 1]),
  }));

  // ─── Render grid cells ────────────────────────────────────────────

  const cells: React.ReactNode[] = [];
  const quickSessions = useMemo(
    () => Array.from(sessionMap.values()).slice(0, 8),
    [sessionMap]
  );

  workspaces.forEach((ws, wsIdx) => {
    ws.windows.forEach((win, winIdx) => {
      const left = winIdx * (screenWidth + H_GAP);
      const top = wsIdx * (screenHeight + V_GAP);
      const isFocusedCell = activeWorkspaceIndex === wsIdx &&
        (activeWindowIndices.get(wsIdx) ?? 0) === winIdx;
      const isWorkspaceSavedActive = (activeWindowIndices.get(wsIdx) ?? 0) === winIdx;
      const isDraggingSource = dragState?.windowId === win.id;
      const isDropTarget = dragState?.targetWsIdx === wsIdx && dragState?.targetIndex === winIdx;

      cells.push(
        <CellWrapper
          key={win.id}
          left={left}
          top={top}
          width={screenWidth}
          height={screenHeight}
          wsIdx={wsIdx}
          winIdx={winIdx}
          focusedRow={focusedRowRounded}
          focusedCol={focusedColRounded}
          overviewProgress={overviewDerived}
          rowOverviewOffsets={rowOverviewOffsets}
        >
          <View
            style={[StyleSheet.absoluteFill, isDraggingSource && { opacity: 0.25 }]}
            pointerEvents={isOverview || isPinching ? 'none' : 'auto'}
          >
            <WindowContent
              window={win}
              sessionMap={sessionMap}
              isActive={isFocusedCell && !isOverview && !isPinching}
              onOpenWindow={(route, params) => onOpenWindow(wsIdx, route, params)}
              onCloseWindow={() => onCloseWindow(wsIdx, win.id)}
            />
          </View>

          {/* Overview overlay per cell */}
          {isOverview && (
            <Animated.View
              style={[StyleSheet.absoluteFill, cellOverlayStyle]}
              pointerEvents="box-none"
            >
              <GestureDetector
                gesture={Gesture.Exclusive(
                  Gesture.Tap()
                    .enabled(isOverview)
                    .onEnd((_e, success) => {
                      if (!success) return;
                      runOnJS(handleOverviewTap)(wsIdx, winIdx);
                    }),
                  Gesture.Pan()
                    .enabled(isOverview)
                    .minDistance(1)
                    .activateAfterLongPress(220)
                    .onStart((e) => {
                      runOnJS(startWindowDrag)(wsIdx, winIdx, win, e.absoluteX, e.absoluteY);
                    })
                    .onUpdate((e) => {
                      runOnJS(updateWindowDrag)(e.absoluteX, e.absoluteY);
                    })
                    .onEnd(() => {
                      runOnJS(finishWindowDrag)(false);
                    })
                    .onFinalize((_e, success) => {
                      if (!success) {
                        runOnJS(finishWindowDrag)(true);
                      }
                    })
                )}
              >
                <View style={StyleSheet.absoluteFill} />
              </GestureDetector>
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderRadius: 14,
                    borderWidth: isDropTarget ? 3 : isFocusedCell ? 3 : isWorkspaceSavedActive ? 2 : 1,
                    borderColor: isDropTarget ? colors.green : (isFocusedCell || isWorkspaceSavedActive ? colors.accent : colors.border),
                  },
                ]}
                pointerEvents="none"
              />
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onCloseWindow(wsIdx, win.id);
                }}
                hitSlop={12}
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  zIndex: 10,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  borderRadius: 20,
                  width: 40,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={20} color="rgba(255,255,255,0.9)" />
              </Pressable>
            </Animated.View>
          )}
        </CellWrapper>,
      );
    });

    // Launchpad at end of row
    const launchpadLeft = ws.windows.length * (screenWidth + H_GAP);
    const launchpadTop = wsIdx * (screenHeight + V_GAP);
    const isLaunchpadDropTarget = dragState?.targetWsIdx === wsIdx && dragState?.targetIndex === ws.windows.length;
    cells.push(
      <CellWrapper
        key={`launchpad-${ws.id}`}
        left={launchpadLeft}
        top={launchpadTop}
        width={screenWidth}
        height={screenHeight}
        wsIdx={wsIdx}
        winIdx={ws.windows.length}
        focusedRow={focusedRowRounded}
        focusedCol={focusedColRounded}
        overviewProgress={overviewDerived}
        rowOverviewOffsets={rowOverviewOffsets}
      >
        <LaunchpadPage
          totalPages={ws.windows.length + 1}
          currentIndex={activeWindowIndices.get(wsIdx) ?? 0}
          onOpenWindow={(route, params) => onOpenWindow(wsIdx, route, params)}
          onNewSession={onNewSession}
          quickSessions={quickSessions}
          providerUsage={providerUsage}
        />
        {isOverview && isLaunchpadDropTarget && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: 14,
                borderWidth: 3,
                borderColor: colors.green,
              },
            ]}
          />
        )}
      </CellWrapper>,
    );
  });

  // Empty workspace row
  const emptyRowTop = workspaces.length * (screenHeight + V_GAP);
  const isEmptyRowDropTarget = dragState?.targetWsIdx === workspaces.length;
  cells.push(
    <CellWrapper
      key="ws-empty"
      left={0}
      top={emptyRowTop}
      width={screenWidth}
      height={screenHeight}
      wsIdx={workspaces.length}
      winIdx={0}
      focusedRow={focusedRowRounded}
      focusedCol={focusedColRounded}
      overviewProgress={overviewDerived}
      rowOverviewOffsets={rowOverviewOffsets}
    >
      <LaunchpadPage
        totalPages={totalWorkspaces}
        currentIndex={activeWorkspaceIndex}
        onOpenWindow={(route, params) => onOpenWindow(workspaces.length, route, params)}
        onNewSession={onNewSession}
        quickSessions={quickSessions}
        providerUsage={providerUsage}
      />
      {isOverview && isEmptyRowDropTarget && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: 14,
              borderWidth: 3,
              borderColor: colors.green,
            },
          ]}
        />
      )}
    </CellWrapper>,
  );

  const dragDropIndicator = useMemo(() => {
    if (!isOverview || !dragState) return null;
    const { tx, ty } = getOverviewWorldTransforms();
    const rowOffset = rowOverviewOffsets.value[dragState.targetWsIdx] ?? 0;
    const worldX = dragState.targetIndex * (screenWidth + H_GAP) + rowOffset;
    const worldY = dragState.targetWsIdx * (screenHeight + V_GAP);
    return {
      x: oScale * (worldX + tx),
      y: oScale * (worldY + ty),
      h: oScale * screenHeight,
    };
  }, [isOverview, dragState, getOverviewWorldTransforms, rowOverviewOffsets, screenWidth, screenHeight, oScale]);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={handleLayout}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={StyleSheet.absoluteFill} collapsable={false}>
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: gridW,
                height: gridH,
                transformOrigin: 'top left',
              },
              containerStyle,
            ]}
          >
            {cells}
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {isOverview && dragState && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {dragDropIndicator && (
            <View
              style={{
                position: 'absolute',
                left: dragDropIndicator.x - 2,
                top: dragDropIndicator.y + 8,
                width: 4,
                height: Math.max(16, dragDropIndicator.h - 16),
                borderRadius: 3,
                backgroundColor: colors.green,
                opacity: 0.95,
              }}
            />
          )}
          <View
            style={{
              position: 'absolute',
              left: dragState.x - 98,
              top: dragState.y - 38,
              width: 196,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.green,
              backgroundColor: colors.card,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 12,
            }}
          >
            <AppText variant="caps" tone="muted" style={{ fontSize: 10 }}>Moving Window</AppText>
            <AppText numberOfLines={1} style={{ marginTop: 2 }}>{dragState.label}</AppText>
          </View>
        </View>
      )}

      {/* Screen-space overview UI */}
      {isOverview && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {providerUsage.length > 0 && (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', top: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 16, zIndex: 10 }}
            >
              {providerUsage.map(({ provider, percentLeft }) => {
                const ringSize = 36;
                const sw = 3;
                const center = ringSize / 2;
                const radius = center - sw / 2;
                const circ = 2 * Math.PI * radius;
                const dash = (Math.max(0, percentLeft) / 100) * circ;
                const ringColor = percentLeft > 50 ? colors.green : percentLeft > 20 ? colors.orange : colors.red;
                return (
                  <View key={provider} style={{ alignItems: 'center', gap: 4 }}>
                    <View style={{ width: ringSize, height: ringSize }}>
                      <Svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
                        <Circle cx={center} cy={center} r={radius} fill="none" stroke={colors.border} strokeWidth={sw} />
                        <Circle
                          cx={center} cy={center} r={radius} fill="none"
                          stroke={ringColor} strokeWidth={sw}
                          rotation={-90} origin={`${center}, ${center}`}
                          {...(percentLeft >= 100 ? {} : { strokeDasharray: `${dash} ${circ}`, strokeLinecap: 'round' as const })}
                        />
                      </Svg>
                      <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
                        <ProviderIcon provider={provider} size={14} color={colors.textSecondary} />
                      </View>
                    </View>
                    <AppText style={{ color: colors.textMuted, fontSize: 9 }}>
                      {Math.round(percentLeft)}%
                    </AppText>
                  </View>
                );
              })}
            </View>
          )}


        </View>
      )}

      {/* Workspace indicator */}
      <Animated.View
        style={[{ position: 'absolute', top: 0, bottom: 0, right: 0 }, indicatorStyle]}
        pointerEvents={isOverview ? 'none' : 'box-none'}
      >
        <WorkspaceIndicator
          total={totalWorkspaces}
          current={activeWorkspaceIndex}
          onSelect={(idx) => {
            Keyboard.dismiss();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            focusedRow.value = withSpring(idx, SPRING);
            const savedCol = getSavedColForRow(idx);
            focusedCol.value = withSpring(savedCol, SPRING);
            onWorkspaceChanged(idx);
            onWindowChanged(idx, savedCol);
          }}
        />
      </Animated.View>

      {/* Gesture debug toast */}
      {gestureToast && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(300)}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 50,
            alignSelf: 'center',
            left: 0,
            right: 0,
            alignItems: 'center',
            zIndex: 999,
          }}
        >
          <View style={{
            backgroundColor: 'rgba(0,0,0,0.8)',
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 8,
          }}>
            <AppText style={{ color: '#fff', fontSize: 12 }}>{gestureToast}</AppText>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// ─── CellWrapper — virtualization ─────────────────────────────────────────────

type CellWrapperProps = {
  left: number;
  top: number;
  width: number;
  height: number;
  wsIdx: number;
  winIdx: number;
  focusedRow: Readonly<SharedValue<number>>;
  focusedCol: Readonly<SharedValue<number>>;
  overviewProgress: Readonly<SharedValue<number>>;
  rowOverviewOffsets: Readonly<SharedValue<number[]>>;
  children: React.ReactNode;
};

function CellWrapper({
  left,
  top,
  width,
  height,
  wsIdx,
  winIdx,
  focusedRow,
  focusedCol,
  overviewProgress,
  rowOverviewOffsets,
  children,
}: CellWrapperProps) {
  const { colors } = useTheme();

  const shouldRender = useDerivedValue(() => {
    if (overviewProgress.value > 0.5) return true;
    const rowDist = Math.abs(wsIdx - focusedRow.value);
    const colDist = Math.abs(winIdx - focusedCol.value);
    return rowDist <= 1 && colDist <= 1;
  });

  const placeholderStyle = useAnimatedStyle(() => ({
    opacity: shouldRender.value ? 0 : 1,
  }));

  const rowShiftStyle = useAnimatedStyle(() => {
    const rowOffset = rowOverviewOffsets.value[wsIdx] ?? 0;
    const tx = interpolate(overviewProgress.value, [0, 1], [0, rowOffset]);
    return {
      transform: [{ translateX: tx }],
    };
  });

  return (
    <Animated.View
      collapsable={false}
      style={[
        {
          position: 'absolute',
          left,
          top,
          width,
          height,
          overflow: 'hidden',
        },
        rowShiftStyle,
      ]}
    >
      {children}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.terminalBackground },
          placeholderStyle,
        ]}
        pointerEvents="none"
      />
    </Animated.View>
  );
}
