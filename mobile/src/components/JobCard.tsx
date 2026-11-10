import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BookingSummary } from '../api/types';
import { CategoryGlyph } from '../ui/CategoryGlyph';
import { formatDate, inr } from '../lib/format';
import { colors, fonts, radius, shadows } from '../theme';
import { AppText } from '../ui/core';
import { StatusBadge } from './StatusBadge';

export function JobCard({
  job,
  onPress,
}: {
  job: BookingSummary;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.serviceItemName ?? 'Job'} in ${job.serviceLocality ?? job.serviceCity}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <CategoryGlyph code={job.categoryCode} size={76} style={styles.image} />
      <View style={styles.body}>
        <View style={styles.top}>
          <StatusBadge status={job.status} size="compact" />
          <AppText variant="h3" style={styles.value}>
            {inr(job.quotedTotal)}
          </AppText>
        </View>
        <AppText variant="h3" numberOfLines={1} style={styles.title}>
          {job.serviceItemName ?? 'Home service'}
        </AppText>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={colors.muted} />
          <AppText variant="small" numberOfLines={1} style={styles.meta}>
            {job.serviceLocality ?? job.serviceCity}
          </AppText>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.muted} />
          <AppText variant="small" numberOfLines={1} style={styles.meta}>
            {formatDate(job.scheduledAt ?? job.createdAt)}
          </AppText>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    ...shadows.card,
  },
  pressed: { opacity: 0.82 },
  image: {
    borderRadius: radius.sm,
  },
  body: { flex: 1, gap: 4 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontFamily: fonts.bold, fontSize: 14.5 },
  value: { fontSize: 14, fontFamily: fonts.bold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { flex: 1, fontSize: 11 },
});
