import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { SplashScreen, Stack } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** The app: fonts and the stored session load behind the splash screen, then the tabs open. */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <Navigation fontsLoaded={fontsLoaded} />
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

function Navigation({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { ready } = useSession();
  useEffect(() => {
    if (fontsLoaded && ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, ready]);
  if (!fontsLoaded || !ready) return null;
  // iOS-style pushes on both platforms (the new page slides over, the old one drifts back), with
  // swipe-back from anywhere on iOS: the feel of Airbnb and other polished apps.
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'ios_from_right', fullScreenGestureEnabled: true }} />;
}
