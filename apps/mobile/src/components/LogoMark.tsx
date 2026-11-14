import Svg, { Ellipse, G, Path } from 'react-native-svg';

/** The app logo's scissors (viewBox 156 × 220), in one colour: map pins, the story image, the new-appointment screen. */
export function LogoMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={Math.round((size * 156) / 220)} height={size} viewBox="0 0 156 220">
      <G fill={color}>
        <Path d="M28 2C18 36 49 94 75 130L89 120C67 84 42 30 28 2Z" />
        <Path d="M128 2C138 36 107 94 81 130L67 120C89 84 114 30 128 2Z" />
        <Ellipse cx={78} cy={127} rx={15} ry={13} />
      </G>
      <Path d="M72 132 58 152M84 132l14 20" stroke={color} strokeWidth={12} strokeLinecap="round" />
      <G fill="none" stroke={color} strokeWidth={14}>
        <Ellipse cx={35} cy={181} rx={30} ry={24} transform="rotate(-33 35 181)" />
        <Ellipse cx={121} cy={181} rx={30} ry={24} transform="rotate(33 121 181)" />
      </G>
    </Svg>
  );
}
