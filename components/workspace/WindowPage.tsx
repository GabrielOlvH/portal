import React from 'react';
import { View } from 'react-native';

import HostsTabScreen from '@/app/(tabs)/hosts';
import ProjectsTabScreen from '@/app/(tabs)/projects';
import MoreTabScreen from '@/app/(tabs)/more';
import type { Window } from '@/lib/workspace-types';

const routeComponents: Record<string, React.ComponentType> = {
  hosts: HostsTabScreen,
  projects: ProjectsTabScreen,
  settings: MoreTabScreen,
};

export function WindowPage({
  window,
}: {
  window: Window;
}) {
  const Component = routeComponents[window.route];
  if (!Component) return null;

  return (
    <View style={{ flex: 1 }}>
      <Component />
    </View>
  );
}
