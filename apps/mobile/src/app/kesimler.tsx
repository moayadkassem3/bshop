import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { BackLink } from '@/components/BackLink';
import { HaircutCard } from '@/components/HaircutCard';
import { Appear, SkeletonList } from '@/components/motion';
import { Chip, Empty, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useLikes } from '@/lib/likes';
import { useSession } from '@/lib/session';
import type { HaircutStyle, PopularPost } from '@/lib/types';

type Audience = 'all' | 'men' | 'women';

/**
 * Popüler kesimler (as on the website): salons' work from across Türkiye, most
 * liked and newest first, by salon type and haircut style. Every photo leads to
 * the salon that made it; a heart likes it.
 */
export default function PopularHaircutsScreen() {
  const { me } = useSession();
  const [audience, setAudience] = useState<Audience>(me?.gender === 'female' ? 'women' : me?.gender === 'male' ? 'men' : 'all');
  const [style, setStyle] = useState<string | null>(null);
  const [styles, setStyles] = useState<HaircutStyle[]>([]);
  const [posts, setPosts] = useState<PopularPost[] | null>(null);
  const { liked, toggle } = useLikes();

  useEffect(() => {
    api<HaircutStyle[]>('/public/haircut-styles')
      .then(setStyles)
      .catch(() => setStyles([]));
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '60' });
    if (style) params.set('style', style);
    else if (audience !== 'all') params.set('audience', audience);
    setPosts(await api<PopularPost[]>(`/public/haircuts?${params}`).catch(() => []));
  }, [audience, style]);
  useEffect(() => {
    setPosts(null);
    void load();
  }, [load]);

  const choices = styles.filter((s) => audience === 'all' || s.audience === audience);

  return (
    <Screen title="Popüler kesimler" subtitle="Salonların son çalışmaları. Beğendiğiniz kesime dokunun, salonundan randevu alın." back={<BackLink label="Geri" />} onRefresh={load} refreshing={false}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            ['all', 'Tümü'],
            ['men', 'Erkek'],
            ['women', 'Kadın'],
          ] as const
        ).map(([value, label]) => (
          <Chip
            key={value}
            label={label}
            on={audience === value}
            onPress={() => {
              setAudience(value);
              setStyle(null);
            }}
          />
        ))}
      </View>
      {choices.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel="Kesim">
          {choices.map((s) => (
            <Chip key={s.key} label={s.name} on={style === s.key} onPress={() => setStyle(style === s.key ? null : s.key)} />
          ))}
        </ScrollView>
      ) : null}
      {!posts ? <SkeletonList rows={2} /> : null}
      {posts && posts.length === 0 ? <Empty title="Henüz paylaşım yok" text="Salonlar çalışmalarını paylaştıkça burada görünecek." /> : null}
      {posts?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
          {posts.map((p, i) => (
            <Appear key={p.id} index={i} style={{ width: '48.5%' }}>
              <HaircutCard post={p} liked={liked.has(p.id)} onToggleLike={toggle} onPress={() => router.push(`/salon/${p.shop_slug}`)} />
            </Appear>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
