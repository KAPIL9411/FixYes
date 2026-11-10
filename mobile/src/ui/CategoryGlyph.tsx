import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CATEGORY_ICON, categoryTint } from '../lib/catalogueVisuals';
import { colors, radius } from '../theme';

type GlyphProps = {
  code?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function CategoryGlyph({ code, size = 44, style }: GlyphProps) {
  const tint = categoryTint(code);
  return (
    <View
      style={[
        styles.glyph,
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.3),
          backgroundColor: tint.bg,
        },
        style,
      ]}
    >
      <Ionicons
        name={CATEGORY_ICON[code ?? ''] ?? 'construct-outline'}
        size={Math.round(size * 0.5)}
        color={tint.fg}
      />
    </View>
  );
}

/**
 * An image-free category visual. The geometry is deliberately light so it can
 * fill a card, a list thumbnail or a page hero without waiting on a network
 * image or shifting layout.
 */
export function CategoryArtwork({
  code,
  height = 150,
  style,
}: {
  code?: string | null;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const tint = categoryTint(code);
  return (
    <View style={[styles.artwork, { height, backgroundColor: tint.bg }, style]}>
      <View
        style={[
          styles.ring,
          {
            borderColor: tint.fg,
            width: height * 0.92,
            height: height * 0.92,
            borderRadius: height,
            opacity: 0.1,
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            borderColor: tint.fg,
            width: height * 0.64,
            height: height * 0.64,
            borderRadius: height,
            opacity: 0.14,
          },
        ]}
      />
      <View
        style={[
          styles.core,
          {
            width: height * 0.46,
            height: height * 0.46,
            borderRadius: height * 0.15,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Ionicons
          name={CATEGORY_ICON[code ?? ''] ?? 'construct-outline'}
          size={Math.round(height * 0.23)}
          color={tint.fg}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: { alignItems: 'center', justifyContent: 'center' },
  artwork: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  ring: { position: 'absolute', borderWidth: 1.5 },
  core: { alignItems: 'center', justifyContent: 'center' },
});
