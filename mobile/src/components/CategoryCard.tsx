import { Pressable, StyleSheet, View, type DimensionValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Category } from '../api/types';
import { CATEGORY_ICON, categoryTint } from '../lib/catalogueVisuals';
import { colors, fonts, radius } from '../theme';
import { AppText } from '../ui/core';

export function CategoryCard({
  category,
  onPress,
  width,
}: {
  category: Category;
  onPress: () => void;
  width?: DimensionValue;
}) {
  const tint = categoryTint(category.code);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.name} services`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, width ? { width } : undefined, pressed && styles.pressed]}
    >
      <View style={[styles.icon, { backgroundColor: tint.bg }]}>
        <Ionicons
          name={CATEGORY_ICON[category.code] ?? 'construct-outline'}
          size={24}
          color={tint.fg}
        />
      </View>
      <AppText variant="small" numberOfLines={2} style={styles.label}>
        {category.name}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 0,
    alignItems: 'center',
    gap: 7,
  },
  pressed: { opacity: 0.68 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    lineHeight: 15,
    textAlign: 'center',
    color: colors.inkSoft,
  },
});
