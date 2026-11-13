import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { photoUrl } from './SalonCard';
import { Text } from './ui';
import { colors, themed } from '@/lib/theme';

type Photo = { id: string; width?: number; height?: number };

/** Space between two photos; the next and previous ones peek in at the sides. */
const GAP = 12;

/**
 * A salon's photos opened from its page (founder request, 7 November 2026): a
 * card in the middle of the screen, not full screen, with the neighbours peeking
 * in at the sides. Swipe left and right; the one in the middle is full size, the
 * others a little smaller and dimmed. Tapping outside the photo closes it.
 */
export function PhotoCarousel({ photos, start, onClose }: { photos: Photo[]; start: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const slide = Math.min(width * 0.8, 440);
  const step = slide + GAP;
  const side = (width - slide) / 2;
  const maxHeight = height * 0.62;
  const [index, setIndex] = useState(start);
  const x = useSharedValue(start * step);
  const scroller = useRef<Animated.ScrollView>(null);
  const placed = useRef(false);

  // The counter and dots follow the photo nearest the middle while swiping.
  const shown = useSharedValue(start);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
    const nearest = Math.max(0, Math.min(photos.length - 1, Math.round(e.contentOffset.x / step)));
    if (nearest !== shown.value) {
      shown.value = nearest;
      runOnJS(setIndex)(nearest);
    }
  });

  // Opening and closing (founder, 14 November 2026: it was slow and bounced): one short, even
  // move. The dark background fades while the photos settle from slightly smaller; closing
  // plays the same backwards. No spring, and the window's own fade is off so the two do not stack.
  const reduced = useReducedMotion();
  const open = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) open.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [open, reduced]);
  const closing = useRef(false);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (reduced) return onClose();
    open.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.cubic) }, () => runOnJS(onClose)());
  }, [onClose, open, reduced]);
  const fade = useAnimatedStyle(() => ({ opacity: open.value }));
  const settle = useAnimatedStyle(() => ({ transform: [{ scale: 0.96 + 0.04 * open.value }] }));

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[{ flex: 1 }, fade]}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Kapat">
          <View style={[styles.top, { top: insets.top + 12 }]}>
            <Text weight="bold" color={colors.white}>
              {index + 1} / {photos.length}
            </Text>
            <Pressable onPress={close} hitSlop={12} accessibilityLabel="Kapat" style={styles.close}>
              <Text size={22} color={colors.white}>
                ×
              </Text>
            </Pressable>
          </View>

          <Animated.View style={settle}>
            <Animated.ScrollView
              ref={scroller}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={step}
              decelerationRate="fast"
              disableIntervalMomentum
              contentContainerStyle={{ paddingHorizontal: side, gap: GAP, alignItems: 'center' }}
              onScroll={onScroll}
              scrollEventThrottle={16}
              onLayout={() => {
                // Open on the photo that was tapped.
                if (placed.current) return;
                placed.current = true;
                scroller.current?.scrollTo({ x: start * step, animated: false });
              }}
            >
              {photos.map((p, i) => (
                <Slide key={p.id} photo={p} i={i} x={x} step={step} width={slide} maxHeight={maxHeight} onPress={() => scroller.current?.scrollTo({ x: i * step, animated: true })} />
              ))}
            </Animated.ScrollView>
          </Animated.View>

          {photos.length > 1 ? (
            <View style={[styles.dots, { bottom: insets.bottom + 28 }]} pointerEvents="none">
              {photos.map((p, i) => (
                <View key={p.id} style={[styles.dot, i === index && styles.dotOn]} />
              ))}
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function Slide(props: { photo: Photo; i: number; x: SharedValue<number>; step: number; width: number; maxHeight: number; onPress: () => void }) {
  const { photo, i, x, step, width, maxHeight } = props;
  // The photo keeps its own shape (as uploaded), within the card's height.
  const ratio = photo.width && photo.height ? photo.height / photo.width : 1.25;
  const h = Math.min(width * ratio, maxHeight);
  const style = useAnimatedStyle(() => {
    const d = Math.abs(x.value - i * step) / step;
    return {
      opacity: interpolate(d, [0, 1], [1, 0.5], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [0, 1], [1, 0.88], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View style={style}>
      {/* A tap on the photo itself does not close; a tap on a neighbour brings it to the middle. */}
      <Pressable onPress={props.onPress} accessibilityLabel={`Fotoğraf ${i + 1}`}>
        <Image source={{ uri: photoUrl(photo.id) }} style={{ width, height: h, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' }} contentFit="cover" />
      </Pressable>
    </Animated.View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(11,17,32,0.94)' },
    top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 },
    close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
    dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
    dotOn: { width: 18, backgroundColor: colors.white },
  }),
);
