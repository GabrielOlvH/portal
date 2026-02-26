import { Tabs } from 'expo-router';
import { Terminal, Server, Folder, MoreHorizontal } from 'lucide-react-native';
import { useTheme } from '@/lib/useTheme';

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.blue, headerShown: false, tabBarStyle: { display: 'none' } }}>
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
