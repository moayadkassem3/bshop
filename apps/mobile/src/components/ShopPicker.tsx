import { ScrollView } from 'react-native';
import type { BusinessShop } from '@/lib/types';
import { colors } from '@/lib/theme';
import { Chip, Text } from './ui';

/** The salon name under a business title; a row of chips when the account has several salons. */
export function ShopPicker({ shops, shop, onSelect }: { shops: BusinessShop[] | null; shop: BusinessShop | null; onSelect: (id: string) => void }) {
  if (!shops || shops.length <= 1) {
    return shop ? (
      <Text size={15} color={colors.darkMuted}>
        {shop.name}
      </Text>
    ) : null;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6 }}>
      {shops.map((s) => (
        <Chip dark key={s.id} label={s.name} on={s.id === shop?.id} onPress={() => onSelect(s.id)} />
      ))}
    </ScrollView>
  );
}
