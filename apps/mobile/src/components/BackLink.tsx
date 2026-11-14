import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { colors } from '@/lib/theme';
import { Icon } from './Icon';
import { Text } from './ui';

/** "← Salonum" above a screen title, as on the website. */
export function BackLink({ label }: { label: string }) {
  return (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, alignSelf: 'flex-start' }}>
      <Icon name="back" size={20} color={colors.primaryLight} strokeWidth={2.4} />
      <Text weight="bold" color={colors.primaryLight}>
        {label}
      </Text>
    </Pressable>
  );
}
