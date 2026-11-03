import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ShopAppointmentCard } from '@/components/ShopAppointmentCard';
import { ShopPicker } from '@/components/ShopPicker';
import { Alert, Chip, Empty, Loading, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import type { ShopAppointment } from '@/lib/types';
import { usePolling } from '@/lib/usePolling';
import { SignInFirst } from './salonum';
import { useSession } from '@/lib/session';

type Filter = 'all' | 'completed' | 'no_show' | 'cancelled';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'completed', label: 'Geldi' },
  { key: 'no_show', label: 'Gelmedi' },
  { key: 'cancelled', label: 'İptal' },
];

/** Geçmiş (business, as on the website): the last 30 days' finished and cancelled appointments. */
export default function HistoryScreen() {
  const { me } = useSession();
  const { shops, shop, selectShop, error: shopsError } = useBusinessShops();
  const [items, setItems] = useState<ShopAppointment[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shop) return;
    const now = new Date();
    try {
      const list = await api<ShopAppointment[]>(`/staff/shops/${shop.id}/appointments?from=${new Date(now.getTime() - 30 * 86_400_000).toISOString()}&to=${now.toISOString()}`);
      setItems(list.filter((a) => ['completed', 'no_show', 'cancelled', 'declined'].includes(a.status)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shop]);
  const { refreshing, refresh } = usePolling(load, 60_000);

  if (!me) return <SignInFirst />;
  const shown = (items ?? []).filter((a) => filter === 'all' || a.status === filter || (filter === 'cancelled' && a.status === 'declined'));
  return (
    <Screen title="Geçmiş" header={<ShopPicker shops={shops} shop={shop} onSelect={selectShop} />} onRefresh={refresh} refreshing={refreshing}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} on={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>
      {shopsError || error ? <Alert text={(shopsError || error)!} /> : null}
      {shop && !items && !error ? <Loading /> : null}
      {items && shown.length === 0 ? <Empty title="Kayıt yok" text="Son 30 günde bu durumda randevu bulunmuyor." /> : null}
      {shop ? shown.map((a) => <ShopAppointmentCard key={a.id} shopId={shop.id} appointment={a} showDate showStaff={shop.role === 'owner'} onChanged={load} />) : null}
    </Screen>
  );
}
