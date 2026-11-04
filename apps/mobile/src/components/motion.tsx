import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '@/lib/theme';

/**
 * Motion (as on the website, v1.7): short and calm, and nothing at all when the
 * phone asks for reduced motion. Everything here animates shared values on the
 * UI thread when it mounts or gains focus; Reanimated's layout animations
 * ("entering") are avoided because they misbehave inside scroll views on
 * Android's new architecture.
 */

const EASE = Easing.out(Easing.cubic);

/** A list item fading up into place; the first few follow one another. */
export function Appear({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    progress.value = withDelay(Math.min(index, 6) * 50, withTiming(1, { duration: 320, easing: EASE }));
  }, [index, progress, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 16 }] }));
  // One layer while it fades (Android): its parts fade together instead of showing through each other.
  return (
    <Animated.View renderToHardwareTextureAndroid style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

/** A small celebration: the booking tick, a saved state. */
export function PopIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : 0.4);
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    scale.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 180 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 180 }));
  }, [delay, opacity, reduced, scale]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return <Animated.View style={animated}>{children}</Animated.View>;
}

/**
 * A tab's content each time the tab is opened: it settles up into place while
 * the header stays still (the way Airbnb and Instagram switch tabs). The first
 * opening is left to the items' own Appear.
 */
export function FocusIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(1);
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current || reduced) {
        first.current = false;
        return;
      }
      progress.value = 0;
      progress.value = withTiming(1, { duration: 200, easing: EASE });
    }, [progress, reduced]),
  );
  // Light and quick, as in Airbnb's tabs: a slight rise and fade-in, never a blank page.
  const animated = useAnimatedStyle(() => ({ opacity: 0.6 + progress.value * 0.4, transform: [{ translateY: (1 - progress.value) * 10 }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** Grey placeholder bars with a soft pulse, in the shape of what is loading. */
export function Skeleton({ width = '100%', height = 14, style }: { width?: number | `${number}%`; height?: number; style?: StyleProp<ViewStyle> }) {
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ width, height, borderRadius: 8, backgroundColor: colors.line }, animated, style]} />;
}

/** Placeholder cards for a loading list. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Yükleniyor">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ gap: 10, padding: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
          <Skeleton width="40%" height={12} />
          <Skeleton width="75%" height={18} />
          <Skeleton width="55%" height={12} />
        </View>
      ))}
    </View>
  );
}

/** A whole page loading: the dark header band, then placeholder cards. */
export function PageSkeleton({ photo = false }: { photo?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ height: photo ? 260 : insets.top + 96, backgroundColor: colors.ink }} />
      <View style={{ padding: 16, gap: 14 }}>
        <Skeleton width="35%" height={12} />
        <Skeleton width="70%" height={26} />
        <SkeletonList rows={2} />
      </View>
    </View>
  );
}

/** A step of a flow sliding in from the side it comes from (forward: from the right). */
export function SlideIn({ from, children, style }: { from: 'right' | 'left'; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) progress.value = withTiming(1, { duration: 280, easing: EASE });
  }, [progress, reduced]);
  const sign = from === 'right' ? 1 : -1;
  const animated = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateX: (1 - progress.value) * 28 * sign }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
