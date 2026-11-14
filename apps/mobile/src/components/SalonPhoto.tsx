import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, apiUpload, errorMessage } from '@/lib/api';
import { pickPhotos } from '@/lib/photos';
import { colors, radius } from '@/lib/theme';
import { chooseAction } from './Dialogs';
import { photoUrl } from './SalonCard';
import { Button, Text } from './ui';

/**
 * Salon bilgileri → "Salon fotoğrafı" (founder, 14 November 2026; as on the website): the
 * salon's profile photo, shown wherever the salon appears small (lists, the map card,
 * Favoriler, search). Until one is set, the first gallery photo stands in, then the initial.
 * Picked from the gallery or taken with the camera, cropped square, saved straight away.
 */
export function SalonPhoto({ shopId, name }: { shopId: string; name: string }) {
  const [logoId, setLogoId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ logo_id: string | null }>(`/staff/shops/${shopId}/settings`)
      .then((s) => setLogoId(s.logo_id ?? null))
      .catch(() => setLogoId(null));
  }, [shopId]);

  async function upload(camera: boolean) {
    setError(null);
    let file: string | undefined;
    try {
      [file] = await pickPhotos({ camera, square: true });
    } catch (err) {
      setError(err instanceof Error && !(err as { code?: string }).code ? err.message : 'Fotoğraf seçilemedi. Tekrar deneyin.');
      return;
    }
    if (!file) return;
    setBusy(true);
    try {
      setLogoId((await apiUpload<{ logo_id: string }>(`/staff/shops/${shopId}/logo`, file)).logo_id);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/staff/shops/${shopId}/logo`, { method: 'DELETE' });
      setLogoId(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  const choose = () =>
    chooseAction({
      title: 'Salon fotoğrafı',
      message: 'Müşteriler salonunuzu listelerde ve haritada bu fotoğrafla görür.',
      options: [
        { label: 'Galeriden seç', icon: 'gallery', onPress: () => void upload(false) },
        { label: 'Fotoğraf çek', icon: 'camera', onPress: () => void upload(true) },
        ...(logoId ? [{ label: 'Fotoğrafı kaldır', icon: 'trash' as const, danger: true, onPress: () => void remove() }] : []),
      ],
    });

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable onPress={choose} disabled={busy || logoId === undefined} accessibilityLabel="Salon fotoğrafını değiştir">
          <View style={{ width: 72, height: 72, borderRadius: radius.sm + 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }}>
            {logoId ? (
              <Image source={{ uri: photoUrl(logoId) }} style={{ width: 72, height: 72 }} contentFit="cover" transition={150} />
            ) : (
              <Text size={28} weight="heavy" color={colors.primary}>
                {(name.trim()[0] ?? '').toLocaleUpperCase('tr-TR')}
              </Text>
            )}
          </View>
        </Pressable>
        <Button small kind="secondary" title={busy ? 'Yükleniyor…' : logoId ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'} icon="camera" disabled={busy || logoId === undefined} onPress={choose} />
        {logoId ? (
          <Pressable onPress={() => void remove()} disabled={busy} hitSlop={8}>
            <Text weight="bold" color={colors.danger}>
              Kaldır
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text size={13} color={colors.danger}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
