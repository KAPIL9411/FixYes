import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../ui/core';
import { colors, fonts } from '../theme';

export function AppHeader({
  title,
  subtitle,
  right,
  transparent,
  onBack,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  transparent?: boolean;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <View style={[styles.wrap, transparent && styles.transparent]}>
      <Pressable
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={styles.back}
      >
        <Ionicons name="arrow-back" size={20} color={colors.ink} />
      </Pressable>
      <View style={styles.center}>
        {title ? (
          <AppText variant="h3" numberOfLines={1} style={styles.title}>
            {title}
          </AppText>
        ) : null}
        {subtitle ? (
          <AppText variant="small" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    gap: 11,
    backgroundColor: colors.canvas,
    zIndex: 20,
  },
  transparent: { backgroundColor: 'transparent' },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'flex-start' },
  title: { fontSize: 17.5 },
  subtitle: { fontFamily: fonts.medium, fontSize: 10.5, marginTop: 1 },
  right: { minWidth: 40, alignItems: 'flex-end' },

});
