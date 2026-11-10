import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { splitBookings, useBookings } from '../../hooks/data';
import { AppText, EmptyState, ErrorState, IconButton, TAB_BAR_SPACE } from '../../ui/core';
import { BookingCard } from '../../components/BookingCard';
import { colors, fonts, radius } from '../../theme';
import { useWorkMode } from '../../work-mode';
import { PartnerJobs } from '../../features/partner/PartnerJobs';
import { errorMessage } from '../../lib/errors';

export default function BookingsScreen() {
  const router = useRouter();
  const { mode } = useWorkMode();
  const bookings = useBookings();
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const groups = useMemo(() => splitBookings(bookings.data ?? []), [bookings.data]);
  const list = tab === 'active' ? groups.active : groups.past;

  if (mode === 'partner') return <PartnerJobs />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <AppText variant="caption" style={styles.eyebrow}>
            SERVICE HISTORY
          </AppText>
          <AppText variant="h1" style={styles.title}>
            My bookings
          </AppText>
        </View>
        <IconButton
          icon="search-outline"
          variant="light"
          onPress={() => router.push('/search')}
          accessibilityLabel="Find a service"
        />
      </View>

      <View style={styles.tabs}>
        {[
          { id: 'active' as const, label: 'Active', count: groups.active.length },
          { id: 'past' as const, label: 'Past', count: groups.past.length },
        ].map((item) => {
          const active = tab === item.id;
          return (
            <Pressable
              accessibilityRole="button"
              key={item.id}
              onPress={() => setTab(item.id)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <AppText variant="small" style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {item.label}
              </AppText>
              <View style={[styles.count, active && styles.countActive]}>
                <AppText variant="small" style={[styles.countText, active && styles.countTextActive]}>
                  {item.count}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={bookings.isRefetching}
            onRefresh={() => void bookings.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {bookings.isError ? (
          <ErrorState message={errorMessage(bookings.error)} onRetry={() => void bookings.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={tab === 'active' ? 'calendar-outline' : 'checkmark-done-outline'}
            title={tab === 'active' ? 'No active bookings' : 'No past bookings'}
            body={
              tab === 'active'
                ? 'Book a verified pro and follow the visit from start to finish.'
                : 'Completed and cancelled bookings will appear here.'
            }
            action="Browse services"
            onAction={() => router.push('/search')}
          />
        ) : (
          <View style={styles.list}>
            {list.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onPress={() => router.push({ pathname: '/bookings/[bookingId]', params: { bookingId: booking.id } })}
              />
            ))}
          </View>
        )}
        <View style={{ height: TAB_BAR_SPACE }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  eyebrow: { fontSize: 10 },
  title: { fontSize: 28, marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 3,
    gap: 2,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  tabActive: { backgroundColor: colors.primarySoft },
  tabLabel: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
  tabLabelActive: { color: colors.primary },
  count: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countActive: { backgroundColor: colors.primary },
  countText: { fontSize: 10, color: colors.muted, fontFamily: fonts.semibold },
  countTextActive: { color: colors.white },
  content: { paddingHorizontal: 20, paddingTop: 2 },
  list: { gap: 10 },
});
