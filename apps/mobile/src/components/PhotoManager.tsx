import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, apiUpload, errorMessage } from '@/lib/api';
import { pickPhotos } from '@/lib/photos';
import { colors, radius } from '@/lib/theme';
import { Appear, PopIn } from './motion';
import { PhotoTile } from './PhotoTile';
import { photoUrl } from './SalonCard';
import { Alert, Button, Text } from './ui';

const MAX = 12;

/**
 * The salon's photos (as on the website): a grid where the first is the cover.
 * Tap a photo to see it large and make it the cover, move it, or remove it; add
 * more from the gallery or the camera.
 */
export function PhotoManager({ shopId, onCountChange }: { shopId: string; onCountChange?: (n: number) => void }) {
  const [photos, setPhotos] = useState<{ id: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api<{ id: string }[]>(`/staff/shops/${shopId}/photos`);
      setPhotos(list);
      onCountChange?.(list.length);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [shopId, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(camera: boolean) {
    setError(null);
    let files: string[];
    try {
      files = await pickPhotos({ camera, multiple: !camera, limit: MAX - (photos?.length ?? 0) });
    } catch (err) {
      setError(err instanceof Error && !(err as { code?: string }).code ? err.message : 'Fotoğraf seçilemedi. Tekrar deneyin.');
      return;
    }
    if (!files.length) return;
    for (let i = 0; i < files.length; i++) {
      setBusy(files.length > 1 ? `Yükleniyor ${i + 1}/${files.length}…` : 'Yükleniyor…');
      try {
        await apiUpload(`/staff/shops/${shopId}/photos`, files[i]!);
      } catch (err) {
        setError(errorMessage(err));
        break;
      }
    }
    setBusy(null);
    await load();
  }

  async function reorder(order: string[]) {
    setPhotos(order.map((id) => ({ id })));
    try {
      await api(`/staff/shops/${shopId}/photos/order`, { method: 'PUT', body: order });
    } catch (err) {
      setError(errorMessage(err));
    }
    await load();
  }

  function move(index: number, to: number) {
    if (!photos || to < 0 || to >= photos.length) return;
    const ids = photos.map((p) => p.id);
    const [id] = ids.splice(index, 1);
    ids.splice(to, 0, id!);
    setViewing(to);
    void reorder(ids);
  }

  async function remove(index: number) {
    if (!photos) return;
    const id = photos[index]!.id;
    setViewing(null);
    setBusy('Kaldırılıyor…');
    try {
      await api(`/staff/shops/${shopId}/photos/${id}`, { method: 'DELETE' });
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(null);
    await load();
  }

  const count = photos?.length ?? 0;
  const current = viewing !== null && photos ? photos[viewing] : null;

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.grid}>
        {(photos ?? []).map((p, i) => (
          <Appear key={p.id} index={i} style={styles.cell}>
            <Pressable onPress={() => setViewing(i)} style={({ pressed }) => [styles.photo, pressed && { opacity: 0.85 }]} accessibilityLabel={`Fotoğraf ${i + 1}`}>
              <PhotoTile uri={photoUrl(p.id)} radius={radius.sm} />
              {i === 0 ? (
                <View style={styles.cover}>
                  <Text size={12} weight="bold" color={colors.white}>
                    Kapak
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </Appear>
        ))}
      </View>
      {photos && count === 0 ? (
        <Text size={14} color={colors.muted}>
          Henüz fotoğraf yok.
        </Text>
      ) : null}
      {count > 1 ? (
        <Text size={13} color={colors.muted}>
          Bir fotoğrafa dokunarak büyütün, kapak yapın, sırasını değiştirin veya kaldırın.
        </Text>
      ) : null}
      {count < MAX ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="secondary" title={busy ?? 'Galeriden seç'} onPress={() => void add(false)} disabled={Boolean(busy)} style={{ flex: 1 }} />
          <Button kind="secondary" title="Fotoğraf çek" onPress={() => void add(true)} disabled={Boolean(busy)} style={{ flex: 1 }} />
        </View>
      ) : (
        <Text size={13} color={colors.muted}>
          En fazla {MAX} fotoğraf eklenebilir.
        </Text>
      )}
      {error ? <Alert text={error} /> : null}

      {current && viewing !== null ? (
        <Viewer
          id={current.id}
          index={viewing}
          count={count}
          onClose={() => setViewing(null)}
          onCover={() => move(viewing, 0)}
          onLeft={() => move(viewing, viewing - 1)}
          onRight={() => move(viewing, viewing + 1)}
          onRemove={() => void remove(viewing)}
        />
      ) : null}
    </View>
  );
}

function Viewer(props: { id: string; index: number; count: number; onClose: () => void; onCover: () => void; onLeft: () => void; onRight: () => void; onRemove: () => void }) {
  const insets = useSafeAreaInsets();
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={props.onClose} statusBarTranslucent>
      <View style={[styles.viewer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.viewerTop}>
          <Text weight="bold" color={colors.white}>
            {props.index === 0 ? 'Kapak fotoğrafı' : `Fotoğraf ${props.index + 1} / ${props.count}`}
          </Text>
          <Pressable onPress={props.onClose} hitSlop={12} accessibilityLabel="Kapat" style={styles.closeButton}>
            <Text size={22} color={colors.white}>
              ×
            </Text>
          </Pressable>
        </View>
        <PopIn key={props.id}>
          <Image source={{ uri: photoUrl(props.id) }} style={styles.big} contentFit="contain" transition={150} />
        </PopIn>
        <View style={{ gap: 10, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button kind="secondary" title="‹ Sola" onPress={props.onLeft} disabled={props.index === 0} style={{ flex: 1 }} />
            <Button title="Kapak yap" onPress={props.onCover} disabled={props.index === 0} style={{ flex: 1.3 }} />
            <Button kind="secondary" title="Sağa ›" onPress={props.onRight} disabled={props.index === props.count - 1} style={{ flex: 1 }} />
          </View>
          {confirm ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button kind="secondary" title="Vazgeç" onPress={() => setConfirm(false)} style={{ flex: 1 }} />
              <Button kind="danger" title="Evet, kaldır" onPress={props.onRemove} style={{ flex: 1 }} />
            </View>
          ) : (
            <Button kind="dangerOutline" title="Fotoğrafı kaldır" onPress={() => setConfirm(true)} />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31.5%' },
  photo: {},
  cover: { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: 'rgba(14,16,19,0.75)' },
  viewer: { flex: 1, justifyContent: 'space-between', backgroundColor: '#08090b' },
  viewerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  big: { width: '100%', aspectRatio: 3 / 4 },
});
