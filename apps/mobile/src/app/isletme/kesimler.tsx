import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert as NativeAlert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { BackLink } from '@/components/BackLink';
import { Icon } from '@/components/Icon';
import { Appear, SkeletonList } from '@/components/motion';
import { SelectField } from '@/components/SelectField';
import { PhotoTile } from '@/components/PhotoTile';
import { ShopPicker } from '@/components/ShopPicker';
import { Alert, Button, Card, Empty, Screen, Text } from '@/components/ui';
import { api, API_URL, apiUpload, errorMessage } from '@/lib/api';
import { useBusinessShops } from '@/lib/business';
import { pickPhotos } from '@/lib/photos';
import { colors, fonts, radius } from '@/lib/theme';
import type { HaircutPost, HaircutStyle } from '@/lib/types';

const haircutPhotoUrl = (id: string) => `${API_URL}/public/haircut-photos/${id}`;

/**
 * Kesim fotoğrafı paylaş (as the website's Çalışmalarımız): photos of the
 * salon's work, shown in Popüler kesimler and on the salon's page. Owners
 * remove any post, staff their own.
 */
export default function MyWorkScreen() {
  const { shops, shop, selectShop, error: shopsError } = useBusinessShops();
  const [styleList, setStyleList] = useState<HaircutStyle[]>([]);
  const [posts, setPosts] = useState<HaircutPost[] | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the styles of the salon's own customers: a men's salon sees men's styles.
  const choices = useMemo(() => {
    const groups = shop?.audience === 'men' ? ['men'] : shop?.audience === 'women' ? ['women'] : ['men', 'women'];
    return styleList.filter((s) => groups.includes(s.audience)).map((s) => ({ ...s, label: groups.length > 1 ? `${s.name} (${s.audience === 'men' ? 'Erkek' : 'Kadın'})` : s.name }));
  }, [styleList, shop?.audience]);

  useEffect(() => {
    api<HaircutStyle[]>('/public/haircut-styles')
      .then(setStyleList)
      .catch(() => setStyleList([]));
  }, []);

  const load = useCallback(async () => {
    if (!shop) return;
    try {
      setPosts(await api<HaircutPost[]>(`/staff/shops/${shop.id}/posts`));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shop]);

  useEffect(() => {
    setPosts(null);
    load();
  }, [load]);

  async function choose(camera: boolean) {
    const [uri] = await pickPhotos({ camera }).catch(() => []);
    if (uri) setFile(uri);
  }

  async function share() {
    if (!file || !style || !shop) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ style });
      if (caption.trim()) params.set('caption', caption.trim());
      await apiUpload(`/staff/shops/${shop.id}/posts?${params}`, file);
      setFile(null);
      setCaption('');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function remove(post: HaircutPost) {
    if (!shop) return;
    NativeAlert.alert('Paylaşımı kaldır', `${post.style_name} fotoğrafı kaldırılsın mı?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: () =>
          void api(`/staff/shops/${shop.id}/posts/${post.id}`, { method: 'DELETE' })
            .then(load)
            .catch((err) => setError(errorMessage(err))),
      },
    ]);
  }

  return (
    <Screen
      title="Kesim fotoğrafı paylaş"
      subtitle="Popüler kesimler’de ve salon sayfanızda görünür."
      back={<BackLink label="Salonum" />}
      header={<ShopPicker shops={shops} shop={shop} onSelect={selectShop} />}
    >
      {shopsError || error ? <Alert text={(shopsError || error)!} /> : null}
      {shop ? (
        <Appear>
          <Card style={{ gap: 12 }}>
            {file ? (
              <Pressable onPress={() => void choose(false)} style={styles.preview}>
                <PhotoTile uri={file} ratio={0.8} radius={radius.md} />
                <View style={styles.change}>
                  <Text size={13} weight="bold" color={colors.white}>
                    Değiştir
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => void choose(false)} style={styles.pick}>
                  <Icon name="search" size={22} color={colors.primary} />
                  <Text weight="bold" color={colors.primary}>
                    Galeriden seç
                  </Text>
                </Pressable>
                <Pressable onPress={() => void choose(true)} style={styles.pick}>
                  <Icon name="camera" size={22} color={colors.primary} />
                  <Text weight="bold" color={colors.primary}>
                    Fotoğraf çek
                  </Text>
                </Pressable>
              </View>
            )}
            <SelectField
              label="Kesim"
              value={choices.find((c) => c.key === style)?.label ?? ''}
              options={choices.map((c) => c.label)}
              searchable
              placeholder="Seçin"
              onChange={(label) => setStyle(choices.find((c) => c.label === label)?.key ?? null)}
            />
            <View style={{ gap: 6 }}>
              <Text size={14} weight="semibold" color={colors.ink2}>
                Açıklama (isteğe bağlı)
              </Text>
              <TextInput value={caption} onChangeText={setCaption} maxLength={200} placeholder="Örn. Yan taraflar 0 numara" placeholderTextColor={colors.muted} style={styles.input} />
            </View>
            <Button title={busy ? 'Paylaşılıyor…' : 'Paylaş'} onPress={share} disabled={busy || !file || !style} busy={busy} />
          </Card>
        </Appear>
      ) : null}
      {!posts && !error ? <SkeletonList rows={1} /> : null}
      {posts && posts.length === 0 ? <Empty title="Henüz paylaşım yok" text="İlk kesim fotoğrafınızı yukarıdan paylaşın." /> : null}
      {posts && posts.length > 0 ? (
        <>
          <Text size={18} weight="heavy" style={{ marginTop: 6 }}>
            Paylaşımlarınız ({posts.length})
          </Text>
          <View style={styles.grid}>
            {posts.map((p, i) => (
              <Appear key={p.id} index={i} style={styles.cell}>
                <View style={styles.photoWrap}>
                  <PhotoTile uri={haircutPhotoUrl(p.id)} ratio={5 / 4} />
                  <View style={styles.styleTag}>
                    <Text size={12} weight="bold" color={colors.white} numberOfLines={1}>
                      {p.style_name}
                    </Text>
                  </View>
                </View>
                <View style={styles.cellFooter}>
                  <Text size={14} weight="semibold" color={colors.ink2}>
                    ♥ {p.like_count}
                  </Text>
                  <Pressable onPress={() => remove(p)} hitSlop={8}>
                    <Text size={14} weight="bold" color={colors.danger}>
                      Kaldır
                    </Text>
                  </Pressable>
                </View>
              </Appear>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pick: {
    flex: 1,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryLight,
    backgroundColor: colors.surface2,
  },
  preview: { borderRadius: radius.md, overflow: 'hidden' },
  change: { position: 'absolute', right: 10, bottom: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(11,17,32,0.7)' },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48.5%', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  photoWrap: {},
  styleTag: { position: 'absolute', left: 8, bottom: 8, maxWidth: '85%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(11,17,32,0.7)' },
  cellFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8 },
});
