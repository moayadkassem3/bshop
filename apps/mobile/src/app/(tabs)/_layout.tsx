import { Tabs } from 'expo-router';
import { TabBar } from '@/components/TabBar';
import { useSession } from '@/lib/session';

/**
 * The bottom bar, as on the website: customers get Keşfet · Randevular ·
 * Favoriler · Profil; business mode Salonum · Randevular · Geçmiş · Profil.
 */
export default function TabsLayout() {
  const { business } = useSession();
  return (
    <Tabs
      // The bar's sliding pill and each screen's content transition (components/motion) carry the motion.
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'none' }}
    >
      <Tabs.Screen name="salonum" options={{ title: 'Salonum', href: business ? undefined : null }} />
      <Tabs.Screen name="index" options={{ title: 'Keşfet', href: business ? null : undefined }} />
      <Tabs.Screen name="randevular" options={{ title: 'Randevular' }} />
      <Tabs.Screen name="favoriler" options={{ title: 'Favoriler', href: business ? null : undefined }} />
      <Tabs.Screen name="gecmis" options={{ title: 'Geçmiş', href: business ? undefined : null }} />
      <Tabs.Screen name="profil" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
