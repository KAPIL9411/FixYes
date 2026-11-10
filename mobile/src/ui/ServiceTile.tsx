import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './core';
import { colors, radius, shadows } from '../theme';
import { CategoryArtwork } from './CategoryGlyph';
import { inr } from '../lib/format';

export function ServiceTile({
  name,
  price,
  categoryCode,
  categoryName,
  onPress,
  width,
  variant = 'vertical',
}: {
  name: string;
  price: string | null;
  categoryCode?: string | null;
  categoryName?: string | null;
  onPress: () => void;
  width?: number;
  variant?: 'vertical' | 'row';
}) {
  if (variant === 'row') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <CategoryArtwork code={categoryCode} height={124} style={styles.rowImage} />
        <View style={styles.rowBody}>
          <AppText variant="caption" style={styles.eyebrow} numberOfLines={1}>
            {(categoryName ?? 'SERVICE').toUpperCase()}
          </AppText>
          <AppText variant="h3" numberOfLines={2} style={styles.rowTitle}>
            {name}
          </AppText>
          <View style={styles.rowMeta}>
            <Ionicons name="shield-checkmark" size={12} color={colors.success} />
            <AppText variant="small">Verified pro</AppText>
          </View>
          <View style={styles.rowBottom}>
            <AppText variant="price" style={styles.price}>
              {inr(price)}
            </AppText>
            <Ionicons name="add-circle" size={24} color={colors.primary} />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, width ? { width } : undefined, pressed && styles.pressed]}
    >
      <CategoryArtwork code={categoryCode} height={104} style={styles.image} />
      <View style={styles.body}>
        <AppText variant="h3" numberOfLines={2} style={styles.title}>
          {name}
        </AppText>
        <View style={styles.metaRow}>
          <Ionicons name="home-outline" size={12} color={colors.muted} />
          <AppText variant="small" style={styles.meta} numberOfLines={1}>
            At-home service
          </AppText>
        </View>
        <View style={styles.bottomRow}>
          <AppText variant="price" style={styles.price}>
            {inr(price)}
          </AppText>
          <View style={styles.verified}>
            <Ionicons name="shield-checkmark" size={11} color={colors.success} />
            <AppText variant="caption" style={styles.verifiedText}>
              VERIFIED
            </AppText>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  pressed: { opacity: 0.84 },
  image: { borderRadius: 0 },
  body: { padding: 11, gap: 4 },
  title: { fontSize: 13.5, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 10, flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  price: { fontSize: 17 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  verifiedText: { color: colors.success, fontSize: 9.5, letterSpacing: 0.4 },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadows.card,
  },
  rowImage: { width: 104, borderRadius: 0 },
  rowBody: { flex: 1, padding: 11, justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, letterSpacing: 0.8, color: colors.muted },
  rowTitle: { fontSize: 14, lineHeight: 19, marginTop: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
});
