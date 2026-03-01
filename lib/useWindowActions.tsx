import React, { createContext, useContext } from 'react';

type WindowActions = {
  openWindow: (route: string, params?: Record<string, string>) => void;
  closeWindow: () => void;
  params: Record<string, string>;
  isActive: boolean;
};

const WindowActionsContext = createContext<WindowActions | null>(null);

export function useWindowActions(): WindowActions {
  const ctx = useContext(WindowActionsContext);
  if (!ctx) throw new Error('useWindowActions must be used within a WindowActionsProvider');
  return ctx;
}

export function useWindowActionsIfAvailable(): WindowActions | null {
  return useContext(WindowActionsContext);
}

export function WindowActionsProvider({
  children,
  openWindow,
  closeWindow,
  params,
  isActive,
}: {
  children: React.ReactNode;
} & WindowActions) {
  return (
    <WindowActionsContext.Provider value={{ openWindow, closeWindow, params, isActive }}>
      {children}
    </WindowActionsContext.Provider>
  );
}
