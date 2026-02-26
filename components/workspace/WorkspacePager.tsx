import React, { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import PagerView from 'react-native-pager-view';
import type { PagerViewOnPageScrollEvent } from 'react-native-pager-view';
import * as Haptics from 'expo-haptics';

import { SessionTerminalPage } from './SessionTerminalPage';
import { BrowserPage } from './BrowserPage';
import { LaunchpadPage } from './LaunchpadPage';
import { WindowPage } from './WindowPage';
import type { Window, SessionWithHost } from '@/lib/workspace-types';

export type WorkspacePagerProps = {
  windows: Window[];
  sessionMap: Map<string, SessionWithHost>;
  isActiveWorkspace: boolean;
  workspaceIndex: number;
  totalWindows: number;
  onCloseWindow: (windowId: string) => void;
  onOpenWindow: (route: string, params?: Record<string, string>) => void;
  onNewSession: () => void;
  onPageSelected: (wsIndex: number, pageIndex: number) => void;
  pagerRefCallback: (wsIndex: number, ref: PagerView | null) => void;
  initialPage?: number;
};

export function WorkspacePager({
  windows,
  sessionMap,
  isActiveWorkspace,
  workspaceIndex,
  totalWindows,
  onCloseWindow,
  onOpenWindow,
  onNewSession,
  onPageSelected,
  pagerRefCallback,
  initialPage = 0,
}: WorkspacePagerProps) {
  const pagerRef = useRef<PagerView | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const prevWindowCountRef = useRef(windows.length);

  // Navigate to newly added window
  React.useEffect(() => {
    if (windows.length > prevWindowCountRef.current) {
      const newIndex = windows.length - 1;
      pagerRef.current?.setPage(newIndex);
    }
    prevWindowCountRef.current = windows.length;
  }, [windows.length]);

  const lastSnappedIndexRef = useRef<number | null>(null);
  const handlePageScroll = useCallback((e: PagerViewOnPageScrollEvent) => {
    const { position, offset } = e.nativeEvent;
    const approachingIndex = offset > 0.5 ? position + 1 : position;
    if (lastSnappedIndexRef.current !== null && approachingIndex !== lastSnappedIndexRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      lastSnappedIndexRef.current = approachingIndex;
    }
  }, []);

  return (
    <PagerView
      ref={(ref) => {
        pagerRef.current = ref;
        pagerRefCallback(workspaceIndex, ref);
      }}
      style={{ flex: 1 }}
      initialPage={initialPage}
      onPageSelected={(e) => {
        const pos = e.nativeEvent.position;
        setCurrentPage(pos);
        onPageSelected(workspaceIndex, pos);
      }}
      onPageScroll={handlePageScroll}
    >
      {windows.map((window, index) => {
        if (window.route === 'terminal' && window.params) {
          const key = `${window.params.hostId}/${window.params.sessionName}`;
          const session = sessionMap.get(key);
          if (!session) return <View key={window.id} style={{ flex: 1 }} collapsable={false} />;

          return (
            <View key={window.id} style={{ flex: 1 }} collapsable={false}>
              <SessionTerminalPage
                session={session}
                isActive={isActiveWorkspace && currentPage === index}
              />
            </View>
          );
        }

        if (window.route === 'browser' && window.params?.url) {
          return (
            <View key={window.id} style={{ flex: 1 }} collapsable={false}>
              <BrowserPage url={window.params.url} />
            </View>
          );
        }

        return (
          <View key={window.id} style={{ flex: 1 }} collapsable={false}>
            <WindowPage window={window} />
          </View>
        );
      })}

      {/* Launchpad always last */}
      <View key="launchpad" style={{ flex: 1 }} collapsable={false}>
        <LaunchpadPage
          totalPages={totalWindows + 1}
          currentIndex={currentPage}
          onOpenWindow={onOpenWindow}
          onNewSession={onNewSession}
        />
      </View>
    </PagerView>
  );
}
