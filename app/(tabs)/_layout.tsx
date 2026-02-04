import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { Terminal, Server, Folder, MoreHorizontal } from 'lucide-react-native';
import { useTheme } from '@/lib/useTheme';

function IOSTabLayout() {
  const { colors } = useTheme();

  return (
    <NativeTabs tintColor={colors.blue} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'terminal', selected: 'terminal.fill' }} />
        <Label>Sessions</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="hosts">
        <Icon sf={{ default: 'server.rack', selected: 'server.rack' }} />
        <Label>Hosts</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="projects">
        <Icon sf={{ default: 'folder', selected: 'folder.fill' }} />
        <Label>Projects</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <Icon sf={{ default: 'ellipsis', selected: 'ellipsis' }} />
        <Label>More</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function AndroidTabLayout() {
  const { colors } = useTheme();

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.blue, headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color, size }) => <Terminal size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="hosts"
        options={{
          title: 'Hosts',
          tabBarIcon: ({ color, size }) => <Server size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarIcon: ({ color, size }) => <Folder size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <MoreHorizontal size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return Platform.OS === 'ios' ? <IOSTabLayout /> : <AndroidTabLayout />;
}
