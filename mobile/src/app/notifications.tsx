import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBookings } from '../hooks/data';
import { AppText, EmptyState, ErrorState, Pill, TAB_BAR_SPACE } from '../ui/core';
import { AppHeader } from '../components/AppHeader';
import { colors, radius } from '../theme';
import { formatDate, STATUS_COPY, isActiveStatus } from '../lib/format';
import { errorMessage } from '../lib/errors';

export default function NotificationsScreen() {
  const router = useRouter();
  const bookings = useBookings();

  const updates = useMemo(
    () =>
      [...(bookings.data ?? [])]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 30),
    [bookings.data],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="Notifications" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <Ionicons name="notifications-outline" size={19} color={colors.primary} />
          </View>
          <AppText variant="small" style={styles.introText}>
            Booking updates appear here. Push notifications are not enabled in this build.
          </AppText>
        </View>

        {bookings.isError ? (
          <ErrorState message={errorMessage(bookings.error)} onRetry={() => void bookings.refetch()} />
        ) : updates.length === 0 ? (
          <EmptyState
            icon="notifications-off-outline"
            title="No updates yet"
            body="Status changes for your bookings will show up here."
            action="Browse services"
            onAction={() => router.push('/search')}
          />
        ) : (
          <View style={styles.list}>
            {updates.map((booking) => {
              const active = isActiveStatus(booking.status);
              return (
                <Pressable
                  key={booking.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/bookings/[bookingId]', params: { bookingId: booking.id } })}
                  style={({ pressed }) => [styles.item, pressed && { opacity: 0.72 }]}
                >
                  <View style={[styles.icon, active ? styles.iconActive : styles.iconDone]}>
                    <Ionicons
                      name={active ? 'radio-outline' : 'checkmark-circle-outline'}
                      size={19}
                      color={active ? colors.primary : colors.success}
                    />
                  </View>
                  <View style={styles.body}>
                    <View style={styles.titleRow}>
                      <AppText variant="h3" numberOfLines={1} style={styles.title}>
                        {booking.serviceItemName ?? 'Home service'}
                      </AppText>
                      <AppText variant="small" style={styles.time}>
                        {formatDate(booking.updatedAt)}
                      </AppText>
                    </View>
                    <AppText variant="small" numberOfLines={2} style={styles.message}>
                      {active
                        ? `Status updated: ${STATUS_COPY[booking.status]}.`
                        : `Booking ${STATUS_COPY[booking.status].toLowerCase()}.`}
                    </AppText>
                    <Pill
                      label={STATUS_COPY[booking.status].toUpperCase()}
                      tone={booking.status === 'COMPLETED' ? 'success' : active ? 'violet' : 'neutral'}
                      style={{ marginTop: 6 }}
                    />
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={colors.faint} />
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={{ height: TAB_BAR_SPACE }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.md,
    padding: 11,
    marginBottom: 14,
  },
  introIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introText: { flex: 1, fontSize: 10.5, lineHeight: 15 },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: colors.primarySoft },
  iconDone: { backgroundColor: colors.successSoft },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 13 },
  time: { fontSize: 10, color: colors.faint },
  message: { marginTop: 2, fontSize: 10.5, lineHeight: 15 },
});
