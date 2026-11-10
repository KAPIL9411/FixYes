import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingSummary } from '../api/types';
import { AppText } from '../ui/core';
import { StatusBadge } from './StatusBadge';
import { colors, fonts, radius, shadows } from '../theme';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { formatDate, inr, shortId } from '../lib/format';

export function BookingCard({ booking, onPress }: { booking: BookingSummary; onPress: () => void }) {
  const done = booking.status === 'COMPLETED';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <CategoryGlyph code={booking.categoryCode} size={86} style={styles.image} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <StatusBadge status={booking.status} size="compact" />
          <AppText variant="small" style={styles.id}>
            #{shortId(booking.id)}
          </AppText>
        </View>
        <AppText variant="h3" numberOfLines={1} style={styles.title}>
          {booking.serviceItemName ?? 'Home service'}
        </AppText>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={12} color={colors.muted} />
          <AppText variant="small" numberOfLines={1} style={styles.meta}>
            {formatDate(booking.scheduledAt ?? booking.createdAt)}
          </AppText>
        </View>
        <View style={styles.bottomRow}>
          <AppText variant="price" style={styles.price}>
            {inr(booking.quotedTotal)}
          </AppText>
          <View style={styles.open}>
            <AppText variant="small" style={styles.openText}>
              {done ? 'Details' : booking.status === 'COMPLETION_PENDING' ? 'Confirm' : 'Track'}
            </AppText>
            <Ionicons name="chevron-forward" size={12} color={colors.primary} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 11,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  pressed: { opacity: 0.86 },
  image: { borderRadius: radius.sm },
  body: { flex: 1, gap: 4, paddingVertical: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  id: { fontSize: 10.5, letterSpacing: 0.2, color: colors.faint },
  title: { fontSize: 14.5, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 10.5 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
  price: { fontSize: 17 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  openText: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 10.5 },
});
