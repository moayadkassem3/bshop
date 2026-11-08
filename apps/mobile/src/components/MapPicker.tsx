import { Camera, Map, type CameraRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import navyStyle from '@/lib/mapStyleNavy.json';
import { colors, radius, themed, themeScheme } from '@/lib/theme';
import { Icon } from './Icon';
import { Alert, Button, Text } from './ui';

/** The website's map (OpenFreeMap, OpenStreetMap data): the same style in the app. */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * The map for the theme in use: OpenFreeMap's Liberty in light, and the same map in the app's
 * navy in dark (built by scripts/build-navy-map-style.mjs, bundled so it never flashes light).
 */
export function mapStyle(): string | StyleSpecification {
  return themeScheme() === 'dark' ? (navyStyle as unknown as StyleSpecification) : MAP_STYLE;
}
export type Point = { lat: number; lng: number };
export type MapFocus = Point & { zoom: number };

const TURKIYE: MapFocus = { lat: 39.0, lng: 35.2, zoom: 4.6 };

/** The salon pin, as on the website: a blue drop with a white dot. */
export function Pin({ size = 44, faded = false }: { size?: number; faded?: boolean }) {
  return (
    <View style={{ opacity: faded ? 0.5 : 1 }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M12 23s-8-7.1-8-13.2A8 8 0 0 1 20 9.8C20 15.9 12 23 12 23z" fill={colors.primary} stroke={colors.white} strokeWidth={1.4} />
        <Circle cx={12} cy={9.8} r={3} fill={colors.white} />
      </Svg>
    </View>
  );
}

/**
 * The map data's credit (OpenStreetMap's licence asks for it), as small text instead
 * of MapLibre's (i) button (founder, 8 November 2026).
 */
export function MapCredit({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[{ position: 'absolute' }, style]}>
      <Text size={9} color={colors.muted}>
        © OpenStreetMap
      </Text>
    </View>
  );
}

/** A still map with the pin: tapping it opens the full-screen picker. */
export function MapPreview(props: { point: Point | null; focus: MapFocus | null; onPress: () => void }) {
  const at = props.point ? { ...props.point, zoom: 16 } : (props.focus ?? TURKIYE);
  return (
    <Pressable onPress={props.onPress} style={styles.preview} accessibilityRole="button" accessibilityLabel="Haritada işaretle">
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Map
          key={`${at.lat},${at.lng},${at.zoom}`}
          style={StyleSheet.absoluteFill}
          mapStyle={mapStyle()}
          dragPan={false}
          touchZoom={false}
          doubleTapZoom={false}
          touchRotate={false}
          touchPitch={false}
          compass={false}
          logo={false}
          attribution={false}
        >
          <Camera initialViewState={{ center: [at.lng, at.lat], zoom: at.zoom }} />
        </Map>
        <MapCredit style={{ top: 6, right: 8 }} />
      </View>
      <View pointerEvents="none" style={styles.centerPin}>
        <Pin faded={!props.point} />
      </View>
      <View style={styles.previewBar}>
        <Icon name="pin" size={18} color={colors.primary} />
        <Text weight="bold" color={colors.primary}>
          {props.point ? 'Konumu değiştir' : 'Haritada işaretle'}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Full-screen picker: the pin stays in the middle and the map moves under it
 * (the usual way on phones); "Konumumu kullan" jumps to where the phone is.
 */
export function MapPickerModal(props: { visible: boolean; point: Point | null; focus: MapFocus | null; onClose: () => void; onPick: (point: Point) => void }) {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const start = props.point ? { ...props.point, zoom: 17 } : (props.focus ?? TURKIYE);
  const [center, setCenter] = useState<Point>({ lat: start.lat, lng: start.lng });
  const [moved, setMoved] = useState(Boolean(props.point));
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function locate() {
    setLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('denied');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      camera.current?.easeTo({ center: [p.lng, p.lat], zoom: 17, duration: 800 });
      setCenter(p);
      setMoved(true);
    } catch {
      setError('Konumunuza erişilemedi. Haritayı kaydırarak iğneyi salonunuzun yerine getirin.');
    } finally {
      setLocating(false);
    }
  }

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Map
          style={StyleSheet.absoluteFill}
          mapStyle={mapStyle()}
          touchRotate={false}
          touchPitch={false}
          compass={false}
          logo={false}
          attribution={false}
          onRegionDidChange={(e) => {
            const [lng, lat] = e.nativeEvent.center;
            setCenter({ lat, lng });
            if (e.nativeEvent.userInteraction) setMoved(true);
          }}
        >
          <Camera ref={camera} initialViewState={{ center: [start.lng, start.lat], zoom: start.zoom }} />
        </Map>
        <MapCredit style={{ bottom: 150 + insets.bottom + 6, left: 10 }} />
        {/* The pin's tip marks the spot: it sits half its height above the centre. */}
        <View pointerEvents="none" style={[styles.centerPin, { marginTop: -22 }]}>
          <Pin size={48} faded={!moved} />
        </View>

        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={props.onClose} style={styles.round} accessibilityLabel="Kapat" hitSlop={8}>
            <Icon name="back" size={22} color={colors.ink} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.hint}>
            <Text size={14} weight="semibold">
              Haritayı kaydırın; iğne salonunuzun kapısında dursun.
            </Text>
          </View>
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
          {error ? <Alert text={error} /> : null}
          <Button kind="secondary" title={locating ? 'Konum alınıyor…' : '◎  Konumumu kullan'} onPress={locate} disabled={locating} />
          <Button title="Bu konumu kullan" onPress={() => props.onPick(center)} disabled={!moved} />
        </View>
      </View>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    preview: { height: 190, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface2 },
    centerPin: { position: 'absolute', top: '50%', left: '50%', marginLeft: -22, marginTop: -40 },
    previewBar: {
      position: 'absolute',
      left: 10,
      right: 10,
      bottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 42,
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
    },
    topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
    round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    hint: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.surface },
    bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 10, padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  }),
);
