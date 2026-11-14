import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { chooseAction } from './Dialogs';
import { api, API_URL, apiUpload, errorMessage } from '@/lib/api';
import { pickPhotos } from '@/lib/photos';
import { colors } from '@/lib/theme';
import { Button, Text } from './ui';

export const staffPhotoUrl = (id: string) => `${API_URL}/public/staff-photos/${id}`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('');

/**
 * A staff member's photo, or their initials until they have one (founder, 8 November 2026).
 * `style` gives the circle its colour; the photo fills it.
 */
export function StaffAvatar(props: { name: string; photoId?: string | null; size: number; style?: StyleProp<ViewStyle>; textColor?: string; letters?: string }) {
  const { size } = props;
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.night }, props.style]}>
      {props.photoId ? (
        <Image source={{ uri: staffPhotoUrl(props.photoId) }} style={{ width: size, height: size }} contentFit="cover" transition={150} />
      ) : (
        <Text size={Math.round(size / 3)} weight="heavy" color={props.textColor ?? colors.white}>
          {props.letters ?? initials(props.name)}
        </Text>
      )}
    </View>
  );
}

/**
 * Sets or removes a staff photo: the person's own (Profil, every salon they work at) or,
 * for owners, anyone's (Personel). Picked from the gallery or taken with the camera,
 * cropped square, and saved straight away.
 */
export function StaffPhotoPicker(props: { name: string; photoId: string | null; targets: { shopId: string; memberId: string }[]; onChange: (photoId: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    let last: string | null = null;
    try {
      for (const t of props.targets) last = (await apiUpload<{ photo_id: string }>(`/staff/shops/${t.shopId}/members/${t.memberId}/photo`, file)).photo_id;
    } catch (err) {
      setError(errorMessage(err));
    }
    if (last) props.onChange(last);
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      for (const t of props.targets) await api(`/staff/shops/${t.shopId}/members/${t.memberId}/photo`, { method: 'DELETE' });
      props.onChange(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  const choose = () =>
    chooseAction({
      title: 'Profil fotoğrafı',
      message: 'Müşteriler sizi bu fotoğrafla görür.',
      options: [
        { label: 'Galeriden seç', icon: 'gallery', onPress: () => void upload(false) },
        { label: 'Fotoğraf çek', icon: 'camera', onPress: () => void upload(true) },
        ...(props.photoId ? [{ label: 'Fotoğrafı kaldır', icon: 'trash' as const, danger: true, onPress: () => void remove() }] : []),
      ],
    });

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable onPress={choose} disabled={busy} accessibilityLabel="Profil fotoğrafını değiştir">
          <StaffAvatar name={props.name} photoId={props.photoId} size={64} />
        </Pressable>
        <Button small kind="secondary" title={busy ? 'Yükleniyor…' : props.photoId ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'} icon="camera" disabled={busy} onPress={choose} />
        {props.photoId ? (
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
