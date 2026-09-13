import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import type { ColorValue } from 'react-native';
import { usePalette } from '../../src/ui/theme.ts';

/** Sekme ikonu yerine emoji: ikon paketi bağımlılığı eklemeden okunur etiket. */
const icon = (glyph: string) => ({ color }: { color: ColorValue }) =>
  <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

export default function TabsLayout() {
  const c = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Bugün', tabBarIcon: icon('🏋') }} />
      <Tabs.Screen name="progress" options={{ title: 'İlerleme', tabBarIcon: icon('📈') }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Beslenme', tabBarIcon: icon('🍽') }} />
      <Tabs.Screen name="settings" options={{ title: 'Ayarlar', tabBarIcon: icon('⚙') }} />
    </Tabs>
  );
}
