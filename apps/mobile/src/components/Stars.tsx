import Svg, { Path } from 'react-native-svg';
import { View } from 'react-native';
import { colors } from '@/lib/theme';

const STAR = 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z';

/** Five stars, the first `value` filled (as on the website). */
export function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={`${value} yıldız`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Svg key={n} width={size} height={size} viewBox="0 0 24 24">
          <Path d={STAR} fill={n <= value ? colors.star : 'none'} stroke={n <= value ? colors.star : colors.line} strokeWidth={1.8} strokeLinejoin="round" />
        </Svg>
      ))}
    </View>
  );
}

/** "4,7". */
export const formatRating = (value: number) => value.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
