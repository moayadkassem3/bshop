import { useCallback, useState } from 'react';
import { Appear, SkeletonList } from '@/components/motion';
import { SalonCard } from '@/components/SalonCard';
import { Alert, Empty, Screen, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { usePolling } from '@/lib/usePolling';
import { SignInFirst } from './salonum';

type MyShop = {
  slug: string;
  name: string;
  district: string | null;
  city: string | null;
  audience: string;
  verified?: boolean;
  cover_photo_id: string | null;
  rating?: number | null;
  rating_count?: number;
  favorite: boolean;
  last_visit: string | null;
};

/** Favoriler (as on the website): favourite salons first, then salons visited before. */
export default function FavoritesScreen() {
  const { me } = useSession();
  const [shops, setShops] = useState<MyShop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!me) return;
    try {
      setShops(await api<MyShop[]>('/me/shops'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [me]);
  const { refreshing, refresh } = usePolling(load, 60_000);

  if (!me) return <SignInFirst />;
  const favorites = shops?.filter((s) => s.favorite) ?? [];
  const visited = shops?.filter((s) => !s.favorite) ?? [];
  return (
    <Screen title="Favoriler" onRefresh={refresh} refreshing={refreshing}>
      {error ? <Alert text={error} /> : null}
      {!shops && !error ? <SkeletonList rows={3} /> : null}
      {shops && shops.length === 0 ? (
        <Appear>
          <Empty title="Henüz favori salonunuz yok" text="Bir salonun sayfasında kalbe dokunarak favorilere ekleyebilirsiniz." />
        </Appear>
      ) : null}
      {favorites.length ? <Section title="Favorilerim" /> : null}
      {favorites.map((s, i) => (
        <Appear key={s.slug} index={i}>
          <SalonCard salon={s} />
        </Appear>
      ))}
      {visited.length ? <Section title="Daha önce gittiklerim" /> : null}
      {visited.map((s, i) => (
        <Appear key={s.slug} index={favorites.length + i}>
          <SalonCard salon={s} />
        </Appear>
      ))}
    </Screen>
  );
}

function Section({ title }: { title: string }) {
  return (
    <Text size={13} weight="bold" color={colors.muted} style={{ letterSpacing: 1, marginTop: 4 }}>
      {title.toLocaleUpperCase('tr-TR')}
    </Text>
  );
}
