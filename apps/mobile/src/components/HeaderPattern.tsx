import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { PATTERN_SIZE, PATTERN_TILE } from '@/lib/pattern';

/**
 * The faint texture of salon tools behind a dark header (founder, 14 November 2026). Fills
 * its parent, behind the header's text; the tile is repeated to cover whatever size that is.
 */
export function HeaderPattern() {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  let xml: string | null = null;
  if (size) {
    const tiles: string[] = [];
    for (let y = 0; y < size.h; y += PATTERN_SIZE) for (let x = 0; x < size.w; x += PATTERN_SIZE) tiles.push(`<g transform="translate(${x} ${y})">${PATTERN_TILE}</g>`);
    xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}" fill="none" stroke="#fff" stroke-opacity="0.07" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${tiles.join('')}</svg>`;
  }
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        const next = { w: Math.ceil(width), h: Math.ceil(height) };
        if (!size || size.w !== next.w || size.h !== next.h) setSize(next);
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {xml && size ? <SvgXml xml={xml} width={size.w} height={size.h} /> : null}
    </View>
  );
}
