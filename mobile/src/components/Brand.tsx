import { StyleSheet, Image, Text, type StyleProp, type TextStyle, ImageURISource } from 'react-native';
import { colors, fonts } from '../theme';

/** 
 * The Fixyes wordmark is the only brand mark shown inside the app.
 * The supplied logo (logo.webp) is a white wordmark on transparent background,
 * rasterised into app icon/splash. Use BrandLogo for text fallback or 
 * <BrandLogo image /> when the image asset is available.
 */

/** Brand logo as Text (default, for when image is not explicitly used) */
export function BrandLogo({
  size = 24,
  light = false,
  style,
}: {
  size?: number;
  light?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="Fixyes"
      style={[
        styles.wordmark,
        {
          fontSize: size,
          lineHeight: Math.round(size * 1.1),
          letterSpacing: -size * 0.035,
          color: light ? colors.white : colors.ink,
        },
        style,
      ]}
    >
      fixyes
    </Text>
  );
}

/** Brand logo as Image (uses the transparent PNG logo) */
export function BrandLogoImage({
  size = 24,
  light = false,
  style,
}: {
  size?: number;
  light?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const source: ImageURISource = require('../assets/logo.png');
  return (
    <Image
      source={source}
      style={[
        styles.logoImage,
        {
          width: size,
          height: size,
        },
        style,
      ]}
      accessibilityRole="header"
      accessibilityLabel="Fixyes"
    />
  );
}

export function BrandLockup({
  light = false,
  size = 24,
}: {
  light?: boolean;
  size?: number;
}) {
  return <BrandLogo light={light} size={size} />;
}

const styles = StyleSheet.create({
  wordmark: {
    fontFamily: fonts.displayHeavy,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  logoImage: {
    // Image uses its own size via style, no additional needed
  },
});