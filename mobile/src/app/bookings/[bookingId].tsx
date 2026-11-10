import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useBooking, useBookingEvents, qk } from '../../hooks/data';
import { AppText, Button, EmptyState, Field, Pill, ProgressBar } from '../../ui/core';
import { StatusBadge } from '../../components/StatusBadge';
import { Sheet } from '../../ui/Sheet';
import { AppHeader } from '../../components/AppHeader';
import { colors, radius, shadows } from '../../theme';
import { errorMessage } from '../../lib/errors';
import {
  formatDate,
  formatTime,
  inr,
  shortId,
  STATUS_COPY,
  STATUS_DETAIL,
  stepIndex,
  TRACK_STEPS,
} from '../../lib/format';
import { isCancelled } from '../../lib/status';
import { CategoryGlyph } from '../../ui/CategoryGlyph';

const CANCEL_REASONS = ['Plans changed', 'Partner is running late', 'Found another option', 'Booked by mistake'];

const eventLabel = (event: { eventType: string; payload: Record<string, unknown> }): string => {
  if (event.eventType === 'BOOKING_CREATED') return 'Booking placed';
  if (event.eventType === 'BOOKING_STATUS_CHANGED') {
    const to = event.payload.toStatus as keyof typeof STATUS_COPY | undefined;
    return to ? STATUS_COPY[to] : 'Booking updated';
  }
  if (event.eventType === 'PARTNER_ASSIGNED') return 'Partner assigned';
  if (event.eventType.includes('CANCEL')) return 'Booking cancelled';
  return event.eventType.replaceAll('_', ' ').toLowerCase();
};

export default function BookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const bookingQuery = useBooking(bookingId as string);
  const eventsQuery = useBookingEvents(bookingId as string);
  const booking = bookingQuery.data;

  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]!);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: qk.bookings });
    await queryClient.invalidateQueries({ queryKey: qk.booking(bookingId as string) });
    await queryClient.invalidateQueries({ queryKey: qk.events(bookingId as string) });
  };

  const cancel = useMutation({
    mutationFn: () =>
      api.cancelBooking(bookingId as string, [reason, note.trim()].filter(Boolean).join(': '), booking?.version),
    onSuccess: async () => {
      setCancelOpen(false);
      await refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const complete = useMutation({
    mutationFn: () => api.completeBooking(bookingId as string, booking?.version),
    onSuccess: async () => {
      setCompleteOpen(false);
      await refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const timeline = useMemo(() => {
    const seen = new Set<string>();
    return (eventsQuery.data ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .filter((event) => {
        const key =
          event.eventType === 'BOOKING_STATUS_CHANGED'
            ? String(event.payload.toStatus ?? event.eventType)
            : event.eventType;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(-7);
  }, [eventsQuery.data]);

  if (bookingQuery.isLoading) {
    return (
      <View style={styles.root}>
        <AppHeader title="Booking" />
        <View style={styles.loading}>
          <AppText variant="body" style={{ color: colors.muted }}>
            Loading your booking…
          </AppText>
        </View>
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={styles.root}>
        <AppHeader title="Booking" />
        <EmptyState
          icon="alert-circle-outline"
          title="Booking not found"
          body="This booking may have been removed. Check your bookings list."
          action="Back to bookings"
          onAction={() => router.replace('/bookings')}
        />
      </View>
    );
  }

  const cancelled = isCancelled(booking.status);
  const finished = booking.status === 'COMPLETED';
  const progress = stepIndex(booking.status) / (TRACK_STEPS.length - 1);
  const canCancel = !cancelled && booking.status !== 'COMPLETED' && booking.status !== 'COMPLETION_PENDING';
  const partnerInitials = (booking.partnerDisplayName ?? 'FX')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  return (
    <View style={styles.root}>
      <AppHeader title={shortId(booking.id)} subtitle={formatDate(booking.createdAt)} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <StatusBadge status={booking.status} />
            <AppText variant="caption" style={styles.bookingId}>
              {shortId(booking.id)}
            </AppText>
          </View>
          <View style={styles.statusMain}>
            <View
              style={[
                styles.statusIcon,
                cancelled && { backgroundColor: colors.dangerSoft },
                finished && { backgroundColor: colors.successSoft },
              ]}
            >
              <Ionicons
                name={
                  cancelled
                    ? 'close'
                    : finished
                      ? 'checkmark'
                      : booking.status === 'COMPLETION_PENDING'
                        ? 'checkmark-done'
                        : booking.status === 'IN_PROGRESS'
                          ? 'construct'
                          : booking.status === 'ARRIVED'
                            ? 'location'
                            : booking.status === 'REQUESTED' || booking.status === 'DISPATCHING'
                              ? 'search'
                              : 'navigate'
                }
                size={22}
                color={cancelled ? colors.danger : finished ? colors.success : colors.primary}
              />
            </View>
            <View style={styles.statusCopy}>
              <AppText variant="h2" style={styles.heroTitle}>
                {STATUS_COPY[booking.status]}
              </AppText>
              <AppText variant="small" style={styles.heroBody}>
                {STATUS_DETAIL[booking.status]}
              </AppText>
            </View>
          </View>
          {!cancelled && !finished ? (
            <View style={styles.progressWrap}>
              <ProgressBar value={progress} />
              <View style={styles.progressLabels}>
                <AppText variant="caption" style={styles.progressText}>
                  STEP {stepIndex(booking.status) + 1} OF {TRACK_STEPS.length}
                </AppText>
                <AppText variant="caption" style={styles.progressText}>
                  {Math.round(progress * 100)}%
                </AppText>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          {booking.partnerDisplayName && !cancelled ? (
            <View style={styles.partnerCard}>
              <View style={styles.partnerAvatar}>
                <AppText variant="h3" style={styles.partnerInitials}>
                  {partnerInitials}
                </AppText>
                <View style={styles.partnerOnline} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" style={styles.partnerEyebrow}>
                  YOUR FIXYES PARTNER
                </AppText>
                <AppText variant="h3">{booking.partnerDisplayName}</AppText>
                <View style={styles.partnerMeta}>
                  <Ionicons name="shield-checkmark" size={12} color={colors.success} />
                  <AppText variant="small" style={styles.partnerMetaText}>
                    Verified · assigned to this job
                  </AppText>
                </View>
              </View>
              <View style={styles.partnerBadge}>
                <Ionicons name="construct-outline" size={18} color={colors.primary} />
              </View>
            </View>
          ) : null}

          <View style={styles.serviceCard}>
            <CategoryGlyph code={booking.categoryCode} size={50} />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" style={styles.serviceEyebrow}>
                {(booking.categoryName ?? 'SERVICE').toUpperCase()}
              </AppText>
              <AppText variant="h3">{booking.serviceItemName ?? 'Home service'}</AppText>
              <AppText variant="small" style={styles.serviceDate}>
                {formatDate(booking.createdAt)} · {inr(booking.quotedTotal)}
              </AppText>
            </View>
            <Pill label={shortId(booking.id)} tone="neutral" />
          </View>

          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="location-outline" size={17} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" style={styles.detailLabel}>
                  SERVICE ADDRESS
                </AppText>
                <AppText variant="body" style={styles.detailValue}>
                  {booking.serviceAddressLine}
                  {booking.serviceLocality ? `, ${booking.serviceLocality}` : ''}
                  {'\n'}
                  {booking.serviceCity}, {booking.serviceState} {booking.servicePostalCode ?? ''}
                </AppText>
              </View>
            </View>
            <View style={styles.detailLine} />
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="time-outline" size={17} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" style={styles.detailLabel}>
                  ARRIVAL WINDOW
                </AppText>
                <AppText variant="body" style={styles.detailValue}>
                  {booking.scheduledAt ? formatDate(booking.scheduledAt) : 'As soon as possible'}
                </AppText>
              </View>
            </View>
            <View style={styles.detailLine} />
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="cash-outline" size={17} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" style={styles.detailLabel}>
                  TOTAL
                </AppText>
                <AppText variant="body" style={styles.detailValue}>
                  {cancelled
                    ? 'No payment due'
                    : booking.status === 'COMPLETED'
                      ? `${inr(booking.quotedTotal)} · service complete`
                      : `${inr(booking.quotedTotal)} · pay after service`}
                </AppText>
              </View>
            </View>
          </View>

          {booking.status === 'COMPLETION_PENDING' ? (
            <View style={styles.confirmCard}>
              <View style={styles.confirmIcon}>
                <Ionicons name="checkmark-done" size={20} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="h3">Is the work finished?</AppText>
                <AppText variant="small" style={styles.confirmBody}>
                  Your partner marked this job complete. Confirm to close the booking.
                </AppText>
              </View>
            </View>
          ) : null}

          <View style={styles.timelineCard}>
            <AppText variant="h2" style={styles.timelineTitle}>
              Booking timeline
            </AppText>
            {timeline.length === 0 ? (
              <AppText variant="small">Updates will appear here as your booking progresses.</AppText>
            ) : (
              timeline.map((event, index) => {
                const latest = index === timeline.length - 1;
                return (
                  <View key={event.id} style={styles.timelineRow}>
                    <View style={styles.timelineRail}>
                      <View style={[styles.timelineDot, latest && styles.timelineDotActive]} />
                      {index < timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
                    </View>
                    <View style={styles.timelineBody}>
                      <AppText variant="bodyMedium" style={styles.timelineLabel}>
                        {eventLabel(event)}
                      </AppText>
                      <AppText variant="small" style={styles.timelineTime}>
                        {formatTime(event.createdAt)}
                      </AppText>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {error ? <AppText variant="small" style={styles.error}>{error}</AppText> : null}

          <View style={styles.actions}>
            {booking.status === 'COMPLETION_PENDING' ? (
              <Button label="Confirm completion" icon="checkmark-circle" onPress={() => setCompleteOpen(true)} />
            ) : null}
            {booking.status === 'COMPLETED' ? (
              <Button
                label="Book this service again"
                icon="repeat"
                onPress={() =>
                  router.push({ pathname: '/service/[itemId]', params: { itemId: booking.serviceItemId } })
                }
              />
            ) : null}
            {canCancel ? (
              <Button
                label="Cancel booking"
                variant="ghost"
                icon="close-circle-outline"
                onPress={() => {
                  setError('');
                  setCancelOpen(true);
                }}
              />
            ) : null}
            <Button label="Back to bookings" variant="soft" onPress={() => router.replace('/bookings')} />
          </View>
        </View>
      </ScrollView>

      <Sheet
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this booking?"
        subtitle="Your partner may already be on the way."
      >
        <View style={styles.reasons}>
          {CANCEL_REASONS.map((item) => (
            <Pressable accessibilityRole="button"
              key={item}
              onPress={() => setReason(item)}
              style={[styles.reason, reason === item && styles.reasonActive]}
            >
              <View style={[styles.radio, reason === item && styles.radioActive]}>
                {reason === item ? <View style={styles.radioInner} /> : null}
              </View>
              <AppText variant="bodyMedium" style={styles.reasonText}>
                {item}
              </AppText>
            </Pressable>
          ))}
        </View>
        <Field label="ANYTHING ELSE? (OPTIONAL)" value={note} onChangeText={setNote} placeholder="Tell us what happened" multiline />
        {error ? <AppText variant="small" style={styles.error}>{error}</AppText> : null}
        <Button label="Keep my booking" variant="soft" onPress={() => setCancelOpen(false)} />
        <Button
          label="Cancel booking"
          variant="danger"
          loading={cancel.isPending}
          onPress={() => cancel.mutate()}
          style={{ marginTop: 8 }}
        />
      </Sheet>

      <Sheet
        visible={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title="Confirm the work is done"
        subtitle="This closes the booking. Only confirm once you're satisfied."
      >
        <View style={styles.completeSummary}>
          <View style={styles.completeIcon}>
            <Ionicons name="sparkles" size={22} color={colors.amberDeep} />
          </View>
          <AppText variant="body" style={styles.completeText}>
            {booking.serviceItemName} with {booking.partnerDisplayName ?? 'your Fixyes partner'}
          </AppText>
          <AppText variant="price">{inr(booking.quotedTotal)}</AppText>
        </View>
        {error ? <AppText variant="small" style={styles.error}>{error}</AppText> : null}
        <Button
          label="Yes, work is complete"
          icon="checkmark-circle"
          loading={complete.isPending}
          onPress={() => complete.mutate()}
        />
        <Button label="Not yet" variant="soft" onPress={() => setCompleteOpen(false)} style={{ marginTop: 8 }} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: {
    marginHorizontal: 18,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bookingId: { fontSize: 10.5, letterSpacing: 0.5 },
  statusMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 16 },
  statusIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCopy: { flex: 1 },
  heroTitle: { fontSize: 21, lineHeight: 26 },
  heroBody: { marginTop: 4, fontSize: 11.5, lineHeight: 17 },
  progressWrap: { marginTop: 18, gap: 7 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { color: colors.muted, fontSize: 10, letterSpacing: 0.7 },
  body: { paddingHorizontal: 18, paddingTop: 14, gap: 12 },
  partnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    ...shadows.card,
  },
  partnerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerInitials: { color: colors.white, fontSize: 15 },
  partnerOnline: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.white,
  },
  partnerEyebrow: { fontSize: 9.5, letterSpacing: 1.1 },
  partnerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  partnerMetaText: { fontSize: 11 },
  partnerBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 11,
  },
  serviceEyebrow: { fontSize: 9.5 },
  serviceDate: { marginTop: 2, fontSize: 11 },
  detailsCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 15 },
  detailRow: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  detailIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: { fontSize: 9.5, letterSpacing: 1 },
  detailValue: { marginTop: 2, fontSize: 11.5, lineHeight: 17 },
  detailLine: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  confirmCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.successSoft,
    borderRadius: radius.lg,
    padding: 15,
    alignItems: 'center',
  },
  confirmIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBody: { marginTop: 3, fontSize: 10, lineHeight: 14, color: colors.inkSoft },
  timelineCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16 },
  timelineTitle: { fontSize: 16, marginBottom: 14 },
  timelineRow: { flexDirection: 'row', gap: 11 },
  timelineRail: { width: 12, alignItems: 'center' },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line, marginTop: 5 },
  timelineDotActive: { backgroundColor: colors.primary, width: 10, height: 10, borderRadius: 5 },
  timelineLine: { flex: 1, width: 1, backgroundColor: colors.line, marginVertical: 3 },
  timelineBody: { flex: 1, paddingBottom: 14 },
  timelineLabel: { fontSize: 12, textTransform: 'capitalize' },
  timelineTime: { fontSize: 11, marginTop: 1 },
  error: { color: colors.danger, fontSize: 11 },
  actions: { gap: 9, marginTop: 6 },
  reasons: { gap: 8, marginBottom: 16 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  reasonActive: { borderColor: colors.primary },
  reasonText: { flex: 1, fontSize: 12.5 },
  radio: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  completeSummary: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 16,
  },
  completeIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  completeText: { textAlign: 'center', fontSize: 12, lineHeight: 17 },
});
