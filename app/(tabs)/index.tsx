import React, { useCallback, useMemo, useRef, useState } from 'react';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import Svg, { Circle } from 'react-native-svg';
import { AppText } from '@/components/AppText';
import { ProviderIcon } from '@/components/icons/ProviderIcons';
import { Screen } from '@/components/Screen';
import { TerminalWebView } from '@/components/TerminalWebView';
import { BrowserPage } from '@/components/workspace/BrowserPage';
import { WindowPage } from '@/components/workspace/WindowPage';
import { WorkspacePager } from '@/components/workspace/WorkspacePager';
import { LaunchpadPage } from '@/components/workspace/LaunchpadPage';
import { WorkspaceIndicator } from '@/components/workspace/WorkspaceIndicator';
import { useTheme } from '@/lib/useTheme';
import { buildTerminalHtml } from '@/lib/terminal-html';
import { buildSessionWsUrl } from '@/lib/ws-urls';
import { useLaunchSheet } from '@/lib/launch-sheet';
import { useHostsLive } from '@/lib/live';
import { useStore } from '@/lib/store';
import { useWorkspaceState } from '@/lib/useWorkspaceState';
import type { SessionWithHost } from '@/lib/workspace-types';

export default function SessionsScreen() {
  const { hosts, preferences } = useStore();
  const isFocused = useIsFocused();
  const { open: openLaunchSheet } = useLaunchSheet();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { stateMap } = useHostsLive(hosts, {
    sessions: true,
    insights: isFocused,
    preview: true,
    previewLines: 5,
    enabled: isFocused,
    intervalMs: 2000,
  });

  // ─── Build flat session list ───────────────────────────────────────

  const allSessions = useMemo<SessionWithHost[]>(() => {
    const all: SessionWithHost[] = [];
    hosts.forEach((host, hostIndex) => {
      const hostState = stateMap[host.id];
      const hostStatus = hostState?.status ?? 'checking';
      (hostState?.sessions ?? []).forEach((session) => {
        all.push({ ...session, host, hostStatus, hostIndex });
      });
    });
    all.sort((a, b) => {
      const aTime = a.lastAttached || a.createdAt || 0;
      const bTime = b.lastAttached || b.createdAt || 0;
      return bTime - aTime;
    });
    return all;
  }, [hosts, stateMap]);

  const sessionMap = useMemo(() => {
    const map = new Map<string, SessionWithHost>();
    allSessions.forEach(s => map.set(`${s.host.id}/${s.name}`, s));
    return map;
  }, [allSessions]);

  // ─── Workspace state ───────────────────────────────────────────────

  const { workspaces, actions } = useWorkspaceState(allSessions);

  // ─── Refs ──────────────────────────────────────────────────────────

  const verticalPagerRef = useRef<PagerView | null>(null);
  const horizontalPagerRefs = useRef<Map<number, PagerView | null>>(new Map());

  // ─── Overlays ──────────────────────────────────────────────────────

  const [isOverview, setIsOverview] = useState(false);
  const isOverviewRef = useRef(false);
  const overviewAnim = useRef(new Animated.Value(0)).current;

  const toggleOverview = useCallback((open: boolean) => {
    isOverviewRef.current = open;
    if (open) setIsOverview(true);
    Animated.spring(overviewAnim, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 180,
    }).start(() => {
      if (!open) setIsOverview(false);
    });
  }, [overviewAnim]);

  // Aggregate usage from all sessions for overview rings
  const providerUsage = useMemo(() => {
    const providers = ['claude', 'codex', 'copilot', 'cursor', 'kimi'] as const;
    const result: { provider: typeof providers[number]; percentLeft: number }[] = [];
    for (const p of providers) {
      // Find the first session that has usage data for this provider
      for (const s of allSessions) {
        const usage = s.insights?.[p];
        if (usage?.session?.percentLeft != null) {
          result.push({ provider: p, percentLeft: usage.session.percentLeft });
          break;
        }
      }
    }
    return result;
  }, [allSessions]);

  const OVERVIEW_SCALE = 0.65;
  const CARD_WIDTH = screenWidth * OVERVIEW_SCALE;
  const CARD_HEIGHT = screenHeight * OVERVIEW_SCALE;

  // ─── Session kill ──────────────────────────────────────────────────

  // ─── Gestures ──────────────────────────────────────────────────────

  const totalWorkspaces = workspaces.length + 1; // +1 for empty workspace at bottom

  const twoFingerPan = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .runOnJS(true)
    .onEnd((event) => {
      if (Math.abs(event.translationY) < 60) return;
      const next = actions.activeWorkspaceIndex + (event.translationY < 0 ? 1 : -1);
      if (next < 0 || next >= totalWorkspaces) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      verticalPagerRef.current?.setPage(next);
    });

  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onEnd((event) => {
      if (event.scale < 0.75 && !isOverviewRef.current) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        toggleOverview(true);
      } else if (event.scale > 1.2 && isOverviewRef.current) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        toggleOverview(false);
      }
    });

  const twoFingerGesture = Gesture.Simultaneous(twoFingerPan);

  // ─── Pager registration ────────────────────────────────────────────

  const registerHorizontalPager = useCallback((wsIndex: number, ref: PagerView | null) => {
    horizontalPagerRefs.current.set(wsIndex, ref);
  }, []);

  // ─── Workspace indicator ───────────────────────────────────────────

  const handleSelectWorkspace = useCallback((index: number) => {
    actions.setActiveWorkspace(index);
    verticalPagerRef.current?.setPage(index);
  }, [actions]);

  const handleOverviewSelect = useCallback((wsIndex: number, winIndex?: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    actions.setActiveWorkspace(wsIndex);
    // Navigate after overview closes and PagerView is visible again
    isOverviewRef.current = false;
    setIsOverview(false);
    Animated.spring(overviewAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 180,
    }).start(() => {
      verticalPagerRef.current?.setPage(wsIndex);
      if (winIndex !== undefined) {
        setTimeout(() => {
          horizontalPagerRefs.current.get(wsIndex)?.setPage(winIndex);
        }, 50);
      }
    });
  }, [actions, overviewAnim]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <Screen variant="terminal">
      <GestureDetector gesture={pinchGesture}>
        <View style={{ flex: 1 }} collapsable={false}>
      {/* Normal PagerView — always mounted, hidden behind overview */}
      <GestureDetector gesture={twoFingerGesture}>
        <View style={[StyleSheet.absoluteFill, isOverview && { opacity: 0 }]} collapsable={false} pointerEvents={isOverview ? 'none' : 'auto'}>
          <PagerView
            ref={verticalPagerRef}
            style={StyleSheet.absoluteFill}
            orientation="vertical"
            scrollEnabled={false}
            initialPage={0}
            onPageSelected={(e) => {
              const pos = e.nativeEvent.position;
              actions.setActiveWorkspace(pos);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
          >
            {workspaces.map((ws, wsIndex) => (
              <View key={ws.id} style={{ flex: 1 }} collapsable={false}>
                <WorkspacePager
                  windows={ws.windows}
                  sessionMap={sessionMap}
                  isActiveWorkspace={!isOverview && actions.activeWorkspaceIndex === wsIndex}
                  workspaceIndex={wsIndex}
                  totalWindows={ws.windows.length}
                  onCloseWindow={(windowId) => actions.removeWindow(wsIndex, windowId)}
                  onOpenWindow={(route, params) => actions.addWindow(wsIndex, route, params)}
                  onNewSession={openLaunchSheet}
                  onPageSelected={actions.setActiveWindowInWorkspace}
                  pagerRefCallback={registerHorizontalPager}
                  initialPage={actions.activeWindowIndices.get(wsIndex) ?? 0}
                />
              </View>
            ))}

            {/* Empty workspace at bottom */}
            <View key="ws-empty" style={{ flex: 1 }} collapsable={false}>
              <LaunchpadPage
                totalPages={totalWorkspaces}
                currentIndex={actions.activeWorkspaceIndex}
                onOpenWindow={(route) => actions.addWindow(workspaces.length, route)}
                onNewSession={openLaunchSheet}
              />
            </View>
          </PagerView>
        </View>
      </GestureDetector>

      {/* Overview — all workspaces visible as cards in a ScrollView */}
      {isOverview && (
        <>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
            <View style={StyleSheet.absoluteFill} collapsable={false}>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingTop: 16, paddingBottom: 16, gap: 24 }}
              >
                {/* Usage rings */}
                {providerUsage.length > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, paddingBottom: 8 }}>
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

                {workspaces.map((ws, wsIndex) => {
                  const isActiveWs = actions.activeWorkspaceIndex === wsIndex;
                  const activeWinIdx = actions.activeWindowIndices.get(wsIndex) ?? 0;

                  return (
                    <View key={ws.id}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
                      >
                        {ws.windows.map((win, winIndex) => {
                          const isActiveWin = isActiveWs && activeWinIdx === winIndex;

                          return (
                            <Pressable
                              key={win.id}
                              onPress={() => handleOverviewSelect(wsIndex, winIndex)}
                              style={[
                                overviewCardStyles.card,
                                { width: CARD_WIDTH, height: CARD_HEIGHT, borderColor: colors.border },
                                isActiveWin && { borderColor: colors.accent, borderWidth: 2 },
                              ]}
                            >
                              {/* Close button */}
                              <Pressable
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  actions.removeWindow(wsIndex, win.id);
                                }}
                                hitSlop={8}
                                style={overviewCardStyles.closeButton}
                              >
                                <X size={14} color="rgba(255,255,255,0.8)" />
                              </Pressable>

                              <View style={{ width: CARD_WIDTH, height: CARD_HEIGHT, overflow: 'hidden' }} pointerEvents="none">
                                <View style={{ width: screenWidth, height: screenHeight, transform: [{ scale: OVERVIEW_SCALE }], transformOrigin: 'top left' }}>
                                  {win.route === 'terminal' && win.params ? (() => {
                                    const key = `${win.params!.hostId}/${win.params!.sessionName}`;
                                    const session = sessionMap.get(key);
                                    if (!session) return null;
                                    const wsUrl = buildSessionWsUrl(session.host, session.name);
                                    if (!wsUrl) return null;
                                    const html = buildTerminalHtml('session', wsUrl, {
                                      background: colors.terminalBackground,
                                      foreground: colors.terminalForeground,
                                      cursor: colors.terminalForeground,
                                      selection: colors.terminalSelection,
                                    }, {
                                      fontFamily: preferences.terminal.fontFamily,
                                      fontSize: preferences.terminal.fontSize,
                                    });
                                    return (
                                      <TerminalWebView
                                        source={{ html }}
                                        style={{ flex: 1, backgroundColor: colors.terminalBackground }}
                                        keyboardEnabled={false}
                                      />
                                    );
                                  })() : win.route === 'browser' && win.params?.url ? (
                                    <BrowserPage url={win.params.url} />
                                  ) : (
                                    <WindowPage window={win} />
                                  )}
                                </View>
                              </View>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  );
                })}

                {/* New workspace */}
                <Pressable
                  onPress={() => handleOverviewSelect(workspaces.length)}
                  style={[
                    overviewCardStyles.card,
                    { height: 60, marginHorizontal: 16, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
                  ]}
                >
                  <AppText style={{ color: colors.textSecondary, fontSize: 14 }}>
                    + New Workspace
                  </AppText>
                </Pressable>
              </ScrollView>
            </View>
        </>
      )}

      {/* Workspace indicator dots */}
      {!isOverview && (
        <WorkspaceIndicator
          total={totalWorkspaces}
          current={actions.activeWorkspaceIndex}
          onSelect={handleSelectWorkspace}
        />
      )}

        </View>
      </GestureDetector>
    </Screen>
  );
}

const overviewCardStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,30,30,0.8)',
  },
  closeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
