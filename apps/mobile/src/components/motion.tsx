import { useEffect, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';
import { colors, radius } from '@/lib/theme';

/**
 * Motion (as on the website, v1.7): short and calm. Layout animations follow
 * the phone's "reduce motion" setting (Reanimated's default).
 */

/** A list item fading up into place; the first few follow one another. */
export function Appear({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(240)
        .delay(Math.min(index, 6) * 45)
        .easing(Easing.out(Easing.cubic))}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** A small celebration: the booking tick, a saved state. */
export function PopIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <Animated.View entering={ZoomIn.springify().damping(12).delay(delay)}>{children}</Animated.View>;
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
