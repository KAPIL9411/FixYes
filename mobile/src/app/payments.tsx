import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBookings } from '../hooks/data';
import { AppText, EmptyState, Pill, TAB_BAR_SPACE } from '../ui/core';
import { AppHeader } from '../components/AppHeader';
import { colors, radius } from '../theme';
import { formatDate, inr, isActiveStatus } from '../lib/format';

export default function PaymentsScreen() {
  const router = useRouter();
  const bookings = useBookings();

  const completed = useMemo(
    () => (bookings.data ?? []).filter((booking) => booking.status === 'COMPLETED'),
    [bookings.data],
  );
  const active = useMemo(() => (bookings.data ?? []).filter((booking) => isActiveStatus(booking.status)), [bookings.data]);
  const paidTotal = completed.reduce((sum, booking) => sum + Number(booking.quotedTotal ?? 0), 0);
  const dueTotal = active.reduce((sum, booking) => sum + Number(booking.quotedTotal ?? 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="Payments" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={19} color={colors.primary} />
          <AppText variant="small" style={styles.noteText}>
            Fixyes does not process online payments. You pay the partner directly after the service.
          </AppText>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryCol}>
            <AppText variant="caption" style={styles.summaryLabel}>
              PAID AFTER SERVICE
            </AppText>
            <AppText variant="h1" style={styles.summaryValue}>
              {inr(paidTotal)}
            </AppText>
            <AppText variant="small" style={styles.summaryMeta}>
              {completed.length} completed booking{completed.length === 1 ? '' : 's'}
            </AppText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCol}>
            <AppText variant="caption" style={styles.summaryLabel}>
              DUE ON ACTIVE JOBS
            </AppText>
            <AppText variant="h1" style={styles.summaryDue}>
              {inr(dueTotal)}
            </AppText>
            <AppText variant="small" style={styles.summaryMeta}>
              {active.length} active booking{active.length === 1 ? '' : 's'}
            </AppText>
          </View>
        </View>

        <View style={styles.sectionHead}>
          <AppText variant="h2">Completed services</AppText>
        </View>

        {completed.length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title="No completed payments"
            body="Once a booking is completed, its job value appears here for your records."
            action="Book a service"
            onAction={() => router.push('/search')}
          />
        ) : (
          <View style={styles.list}>
            {completed.map((booking) => (
              <Pressable
                key={booking.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/bookings/[bookingId]', params: { bookingId: booking.id } })}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="checkmark" size={16} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h3" numberOfLines={1}>
                    {booking.serviceItemName ?? 'Home service'}
                  </AppText>
                  <AppText variant="small" style={styles.rowMeta} numberOfLines={1}>
                    {formatDate(booking.updatedAt)} · Paid to partner
                  </AppText>
                </View>
                <AppText variant="price" style={styles.rowValue}>
                  {inr(booking.quotedTotal)}
                </AppText>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.footerNote}>
          <Pill label="NO PAYMENT GATEWAY" tone="neutral" icon="shield-checkmark-outline" />
          <AppText variant="small" style={styles.footerText}>
            Refunds and disputes are handled by Fixyes support. No card, wallet or UPI details are stored in the app.
          </AppText>
        </View>
        <View style={{ height: TAB_BAR_SPACE }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.md,
    padding: 12,
  },
  noteText: { flex: 1, fontSize: 10.5, lineHeight: 15 },
  summary: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginTop: 14,
  },
  summaryCol: { flex: 1 },
  summaryLabel: { fontSize: 9.5, letterSpacing: 0.7 },
  summaryValue: { fontSize: 24, marginTop: 4 },
  summaryDue: { fontSize: 24, marginTop: 4, color: colors.primary },
  summaryMeta: { fontSize: 11, marginTop: 3 },
  summaryDivider: { width: 1, backgroundColor: colors.line, marginHorizontal: 14 },
  sectionHead: { marginTop: 22, marginBottom: 9 },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  rowMeta: { fontSize: 11, marginTop: 2 },
  rowValue: { fontSize: 14 },
  footerNote: { marginTop: 22, alignItems: 'flex-start', gap: 7 },
  footerText: { fontSize: 11, lineHeight: 14 },
});
