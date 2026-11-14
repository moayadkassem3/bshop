import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '@/lib/theme';

/**
 * A photo in a grid. Its box is measured first and the photo is then given exact pixel sizes:
 * on Android, an image that only stretches to fill (absolute fill inside a box sized by a
 * percentage width and an aspect ratio) stayed blank (founder, 5 November 2026), while photos
 * with fixed sizes (the salon page's top gallery) showed. `ratio` is height ÷ width.
 */
export function PhotoTile(props: { uri: string; ratio?: number; radius?: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const ratio = props.ratio ?? 1;
  const [width, setWidth] = useState(0);
  return (
    <View style={props.style} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      {width > 0 ? (
        <Image
          source={{ uri: props.uri }}
          style={{ width, height: Math.round(width * ratio), borderRadius: props.radius ?? 0, backgroundColor: colors.surface2 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View style={{ width: '100%', aspectRatio: 1 / ratio, borderRadius: props.radius ?? 0, backgroundColor: colors.surface2 }} />
      )}
      {props.children}
    </View>
  );
}
