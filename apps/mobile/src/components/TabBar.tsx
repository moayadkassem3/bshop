import * as Haptics from 'expo-haptics';
import type { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, themed } from '@/lib/theme';
import { Icon, type IconName } from './Icon';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, IconName> = { salonum: 'salonum', index: 'kesfet', randevular: 'randevular', favoriler: 'favoriler', gecmis: 'gecmis', profil: 'profil' };
const PILL = 64;

/**
 * The bottom bar, as on the website: a soft blue pill behind the current tab's
 * icon. Here the pill slides to the tab you tap and the icon gives a small
 * bounce, with a light haptic tick.
 */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  // Tabs hidden in this mode (href: null) are laid out with display: none.
  const routes = state.routes.filter((r) => (descriptors[r.key]?.options.tabBarItemStyle as { display?: string } | undefined)?.display !== 'none');
  const active = Math.max(
    0,
    routes.findIndex((r) => r.key === state.routes[state.index]?.key),
  );
  const tab = routes.length ? width / routes.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = active * tab + (tab - PILL) / 2;
    x.value = reduced || !x.value ? target : withSpring(target, { damping: 18, stiffness: 220, mass: 0.7 });
  }, [active, tab, reduced, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {tab > 0 ? <Animated.View style={[styles.pill, pill]} /> : null}
      {routes.map((route, i) => {
        const options = descriptors[route.key]!.options;
        const focused = i === active;
        const label = typeof options.title === 'string' ? options.title : route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                Haptics.selectionAsync().catch(() => undefined);
                navigation.navigate(route.name, route.params);
              }
            }}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={styles.tab}
          >
            <TabIcon name={ICONS[route.name] ?? 'kesfet'} focused={focused} reduced={reduced} />
            <Animated.Text style={[styles.label, { color: focused ? colors.primary : colors.muted, fontFamily: focused ? fonts.bold : fonts.semibold }]} numberOfLines={1}>
              {label}
            </Animated.Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabIcon({ name, focused, reduced }: { name: IconName; focused: boolean; reduced: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (focused && !reduced) scale.value = withSequence(withTiming(0.82, { duration: 90 }), withSpring(1, { damping: 7, stiffness: 260 }));
  }, [focused, reduced, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.icon, animated]}>
      <Icon name={name} size={24} color={focused ? colors.primary : colors.muted} strokeWidth={focused ? 2.1 : 1.8} />
    </Animated.View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    bar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8 },
    pill: { position: 'absolute', top: 8, left: 0, width: PILL, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft },
    tab: { flex: 1, alignItems: 'center', gap: 3 },
    icon: { height: 34, justifyContent: 'center' },
    label: { fontSize: 12 },
  }),
);
