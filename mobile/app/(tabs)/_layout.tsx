import { Tabs } from 'expo-router';

import TabBar from '@/components/ui/TabBar';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'List' }} />
      <Tabs.Screen name="browse" options={{ title: 'Browse' }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
      <Tabs.Screen name="receipts" options={{ title: 'Receipts' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
