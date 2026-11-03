import { Tabs } from 'expo-router';
import { Icon, type IconName } from '@/components/Icon';
import { useSession } from '@/lib/session';
import { colors, fonts } from '@/lib/theme';

/**
 * The bottom bar, as on the website: customers get Keşfet · Randevular ·
 * Favoriler · Profil; business mode Salonum · Randevular · Geçmiş · Profil.
 */
export default function TabsLayout() {
  const { business } = useSession();
  const icon = (name: IconName) =>
    function TabIcon({ color }: { color: string }) {
      return <Icon name={name} color={color} />;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen name="salonum" options={{ title: 'Salonum', href: business ? undefined : null, tabBarIcon: icon('salonum') }} />
      <Tabs.Screen name="index" options={{ title: 'Keşfet', href: business ? null : undefined, tabBarIcon: icon('kesfet') }} />
      <Tabs.Screen name="randevular" options={{ title: 'Randevular', tabBarIcon: icon('randevular') }} />
      <Tabs.Screen name="favoriler" options={{ title: 'Favoriler', href: business ? null : undefined, tabBarIcon: icon('favoriler') }} />
      <Tabs.Screen name="gecmis" options={{ title: 'Geçmiş', href: business ? undefined : null, tabBarIcon: icon('gecmis') }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarIcon: icon('profil') }} />
    </Tabs>
  );
}
