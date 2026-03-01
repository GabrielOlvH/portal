import React from 'react';
import { View } from 'react-native';

import { SessionTerminalPage } from './SessionTerminalPage';
import { BrowserPage } from './BrowserPage';
import { WindowPage } from './WindowPage';
import { WindowActionsProvider } from '@/lib/useWindowActions';
import type { Window, SessionWithHost } from '@/lib/workspace-types';

export type WindowContentProps = {
  window: Window;
  sessionMap: Map<string, SessionWithHost>;
  isActive: boolean;
  onOpenWindow: (route: string, params?: Record<string, string>) => void;
  onCloseWindow: () => void;
};

export function WindowContent({ window: win, sessionMap, isActive, onOpenWindow, onCloseWindow }: WindowContentProps) {
  const params = win.params ?? {};

  if (win.route === 'terminal' && win.params) {
    const key = `${win.params.hostId}/${win.params.sessionName}`;
    const session = sessionMap.get(key);
    if (!session) return <View style={{ flex: 1 }} collapsable={false} />;
    return (
      <View style={{ flex: 1 }} collapsable={false}>
        <SessionTerminalPage session={session} isActive={isActive} />
      </View>
    );
  }

  if (win.route === 'browser' && win.params?.url) {
    return (
      <View style={{ flex: 1 }} collapsable={false}>
        <BrowserPage url={win.params.url} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} collapsable={false}>
      <WindowActionsProvider
        openWindow={onOpenWindow}
        closeWindow={onCloseWindow}
        params={params}
        isActive={isActive}
      >
        <WindowPage window={win} />
      </WindowActionsProvider>
    </View>
  );
}
