import { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { colors, setThemePref, subscribeTheme, themePref, type ThemePref } from '@/lib/theme';
import { Segmented, Text } from './ui';

/**
 * Profil → Görünüm (founder, 8 November 2026): Otomatik follows the phone's light or
 * dark setting (the default); Açık and Koyu keep the app light or navy dark.
 */
export function AppearanceSwitch() {
  const pref = useSyncExternalStore(subscribeTheme, themePref);
  return (
    <View style={{ gap: 8 }}>
      <Segmented<ThemePref>
        value={pref}
        onChange={setThemePref}
        options={[
          { value: 'system', label: 'Otomatik', icon: 'auto' },
          { value: 'light', label: 'Açık', icon: 'sun' },
          { value: 'dark', label: 'Koyu', icon: 'moon' },
        ]}
      />
      <Text size={13} color={colors.muted}>
        {pref === 'system' ? 'Telefonunuzun açık veya koyu ayarına uyar.' : pref === 'light' ? 'Uygulama her zaman açık renkli.' : 'Uygulama her zaman koyu lacivert.'}
      </Text>
    </View>
  );
}
