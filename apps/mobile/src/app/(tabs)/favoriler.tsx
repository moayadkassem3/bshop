import { useCallback, useState } from 'react';
import { Appear, SkeletonList } from '@/components/motion';
import { SalonCard } from '@/components/SalonCard';
import { router } from 'expo-router';
import { PopularStrip } from '@/components/PopularStrip';
import { Alert, Button, Empty, Screen, Text } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { usePolling } from '@/lib/usePolling';

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

  const audience = me?.gender === 'female' ? 'women' : me?.gender === 'male' ? 'men' : 'all';
  // Signed out: the sign-in prompt, with Popüler kesimler still below it (as on the website).
  if (!me)
    return (
      <Screen title="Favoriler" subtitle="Kuaförünüz bir dokunuş uzağınızda.">
        <Empty icon="favoriler" title="Favorileriniz için giriş yapın" text="Telefon numaranızla Profil’den giriş yapabilirsiniz.">
          <Button title="Giriş yap" onPress={() => router.push('/profil')} style={{ alignSelf: 'stretch', marginTop: 8 }} />
        </Empty>
        <PopularStrip audience={audience} />
      </Screen>
    );
  const favorites = shops?.filter((s) => s.favorite) ?? [];
  const visited = shops?.filter((s) => !s.favorite) ?? [];
  return (
    <Screen title="Favoriler" subtitle="Kuaförünüz bir dokunuş uzağınızda." onRefresh={refresh} refreshing={refreshing}>
      {error ? <Alert text={error} /> : null}
      {!shops && !error ? <SkeletonList rows={3} /> : null}
      {shops && shops.length === 0 ? (
        <Appear>
          <Empty icon="favoriler" title="Henüz favori kuaförünüz yok" text="Bir kuaförün sayfasındaki kalbe dokunun; burada hep elinizin altında olsun.">
            <Button title="Kuaför keşfet" onPress={() => router.push('/')} style={{ alignSelf: 'center', paddingHorizontal: 28, marginTop: 8 }} />
          </Empty>
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
      <PopularStrip audience={audience} />
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
