import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../api';
import type { BookingStatus } from '../../../api/types';
import { useBookingEvents, usePartnerJobs, qk } from '../../../hooks/data';
import { AppText, Button, EmptyState, Field, Pill } from '../../../ui/core';
import { Sheet } from '../../../ui/Sheet';
import { AppHeader } from '../../../components/AppHeader';
import { colors, fonts, radius, shadows } from '../../../theme';
import { errorMessage } from '../../../lib/errors';
import { formatDate, formatTime, inr, shortId, STATUS_COPY, STATUS_DETAIL, stepIndex, TRACK_STEPS } from '../../../lib/format';
import { isCancelled } from '../../../lib/status';

const NEXT: Partial<Record<BookingStatus, { status: BookingStatus; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }>> = {
  PARTNER_ASSIGNED: { status: 'ON_THE_WAY', label: 'Start navigation', icon: 'navigate' },
  PARTNER_ACCEPTED: { status: 'ON_THE_WAY', label: 'Start navigation', icon: 'navigate' },
  ON_THE_WAY: { status: 'ARRIVED', label: "I've arrived", icon: 'location' },
  ARRIVED: { status: 'IN_PROGRESS', label: 'Start the job', icon: 'construct' },
  IN_PROGRESS: { status: 'COMPLETION_PENDING', label: 'Request completion', icon: 'checkmark-done' },
};

const CANCEL_REASONS = ['Customer unavailable', 'Address not accessible', 'Unsafe working conditions', 'Vehicle or tool issue'];

const eventLabel = (event: { eventType: string; payload: Record<string, unknown> }) => {
  if (event.eventType === 'BOOKING_CREATED') return 'Booking placed';
  if (event.eventType === 'BOOKING_STATUS_CHANGED') {
    const to = event.payload.toStatus as keyof typeof STATUS_COPY | undefined;
    return to ? STATUS_COPY[to] : 'Status updated';
  }
  return event.eventType.replaceAll('_', ' ').toLowerCase();
};

export default function PartnerJobScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const jobs = usePartnerJobs();
  const events = useBookingEvents(jobId as string);
  const job = jobs.data?.find((entry) => entry.id === jobId);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]!);
  const [note, setNote] = useState('');

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: qk.partnerJobs });
    await queryClient.invalidateQueries({ queryKey: qk.events(jobId as string) });
    await queryClient.invalidateQueries({ queryKey: qk.bookings });
    await queryClient.invalidateQueries({ queryKey: qk.availability });
  };

  const update = useMutation({
    mutationFn: (status: BookingStatus) => api.setPartnerJobStatus(jobId as string, status),
    onSuccess: refresh,
    onError: (cause) => setError(errorMessage(cause)),
  });

  const cancel = useMutation({
    mutationFn: () =>
      api.setPartnerJobStatus(jobId as string, 'CANCELLED_BY_PARTNER', [reason, note.trim()].filter(Boolean).join(': ')),
    onSuccess: async () => {
      setCancelOpen(false);
      await refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const timeline = useMemo(() => {
    const seen = new Set<string>();
    return (events.data ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .filter((event) => {
        const key = event.eventType === 'BOOKING_STATUS_CHANGED' ? String(event.payload.toStatus) : event.eventType;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(-7);
  }, [events.data]);

  if (!jobs.isLoading && !job) {
    return (
      <View style={styles.root}>
        <AppHeader title="Job" />
        <EmptyState
          icon="briefcase-outline"
          title="Job not found"
          body="This job may have been reassigned or is no longer active."
          action="Back to dashboard"
          onAction={() => router.replace('/')}
        />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.root}>
        <AppHeader title="Job" />
        <View style={styles.loading}>
          <AppText variant="body">Loading job…</AppText>
        </View>
      </View>
    );
  }

  const cancelled = isCancelled(job.status);
  const next = NEXT[job.status];
  const address = `${job.serviceAddressLine}${job.serviceLocality ? `, ${job.serviceLocality}` : ''}, ${job.serviceCity} ${job.serviceState} ${job.servicePostalCode ?? ''}`;
  const openMaps = () =>
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);

  return (
    <View style={styles.root}>
      <AppHeader
        title={shortId(job.id)}
        subtitle={job.serviceItemName ?? 'Partner job'}
        right={
          <Pill
            label={job.status === 'COMPLETED' ? 'DONE' : cancelled ? 'CLOSED' : 'ACTIVE'}
            tone={job.status === 'COMPLETED' || cancelled ? 'neutral' : 'success'}
          />
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 130 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Pill label={STATUS_COPY[job.status].toUpperCase()} tone={cancelled ? 'neutral' : 'violet'} />
            <AppText variant="caption" style={styles.stepText}>
              STEP {Math.min(stepIndex(job.status) + 1, TRACK_STEPS.length)} / {TRACK_STEPS.length}
            </AppText>
          </View>
          <AppText variant="h2" style={styles.heroTitle}>
            {STATUS_COPY[job.status]}
          </AppText>
          <AppText variant="small" style={styles.heroBody}>
            {STATUS_DETAIL[job.status]}
          </AppText>
          <View style={styles.valueRow}>
            <View>
              <AppText variant="caption" style={styles.valueLabel}>
                JOB VALUE
              </AppText>
              <AppText variant="h2" style={styles.value}>
                {inr(job.quotedTotal)}
              </AppText>
            </View>
            <View style={styles.window}>
              <Ionicons name="calendar-outline" size={13} color={colors.primary} />
              <AppText variant="small" style={styles.windowText}>
                {job.scheduledAt ? formatDate(job.scheduledAt) : 'As soon as possible'}
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.customerCard}>
            <View style={styles.customerIcon}>
              <Ionicons name="person-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" style={styles.eyebrow}>
SERVICE & ADDRESS
              </AppText>
              <AppText variant="h3">{job.serviceItemName}</AppText>
              <AppText variant="small" style={styles.address}>
                {address}
              </AppText>
            </View>
            <Pressable accessibilityRole="button" onPress={openMaps} style={styles.mapButton} accessibilityLabel="Open directions">
              <Ionicons name="navigate" size={18} color={colors.white} />
            </Pressable>
          </View>

          <Pressable accessibilityRole="button" style={styles.navCard} onPress={openMaps}>
            <View style={styles.navIcon}>
              <Ionicons name="navigate-outline" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h3">Navigate to the job</AppText>
              <AppText variant="small" numberOfLines={1} style={styles.navBody}>
                {job.serviceLocality ?? job.serviceCity} · opens Google Maps
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.faint} />
          </Pressable>

          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <AppText variant="small" style={styles.detailKey}>
                Booking
              </AppText>
              <AppText variant="bodyMedium" style={styles.detailValue}>
                {shortId(job.id)}
              </AppText>
            </View>
            <View style={styles.detailLine} />
            <View style={styles.detailRow}>
              <AppText variant="small" style={styles.detailKey}>
                Service city
              </AppText>
              <AppText variant="bodyMedium" style={styles.detailValue}>
                {job.serviceCity}
              </AppText>
            </View>
            <View style={styles.detailLine} />
            <View style={styles.detailRow}>
              <AppText variant="small" style={styles.detailKey}>
                Payment
              </AppText>
              <AppText variant="bodyMedium" style={styles.detailValue}>
                Collected after service
              </AppText>
            </View>
          </View>

          <View style={styles.timelineCard}>
            <AppText variant="h2" style={styles.timelineTitle}>
              Job timeline
            </AppText>
            {timeline.length === 0 ? (
              <AppText variant="small">Updates appear as you move the job forward.</AppText>
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

          {job.status === 'COMPLETION_PENDING' ? (
            <View style={styles.waiting}>
              <View style={styles.waitingIcon}>
                <Ionicons name="hourglass-outline" size={20} color={colors.amberDeep} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="h3">Waiting for the customer</AppText>
                <AppText variant="small" style={styles.waitingBody}>
                  They’ll confirm the work is finished. The job closes once they confirm.
                </AppText>
              </View>
            </View>
          ) : null}

          {error ? <AppText variant="small" style={styles.error}>{error}</AppText> : null}

          {!cancelled && job.status !== 'COMPLETED' && job.status !== 'COMPLETION_PENDING' ? (
            <Pressable accessibilityRole="button"
              onPress={() => {
                setError('');
                setCancelOpen(true);
              }}
              style={styles.cancelLink}
            >
              <AppText variant="small" style={styles.cancelText}>
                Cancel this job
              </AppText>
            </Pressable>
          ) : null}
          {cancelled || job.status === 'COMPLETED' ? (
            <Button label="Back to dashboard" variant="soft" onPress={() => router.replace('/')} />
          ) : null}
        </View>
      </ScrollView>

      {!cancelled && job.status !== 'COMPLETED' ? (
        <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {next ? (
            <Button
              label={next.label}
              icon={next.icon}
              onPress={() => update.mutate(next.status)}
              loading={update.isPending}
              size="lg"
            />
          ) : (
            <View style={styles.completeNote}>
              <Ionicons name="checkmark-done-circle" size={20} color={colors.success} />
              <AppText variant="small" style={styles.completeText}>
                Completion requested. Waiting for the customer to confirm.
              </AppText>
            </View>
          )}
        </View>
      ) : null}

      <Sheet
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this job?"
        subtitle="Cancellations are recorded on the job and shared with the customer and support."
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
        <Field label="DETAILS" value={note} onChangeText={setNote} placeholder="Add a short note for support" multiline />
        {error ? <AppText variant="small" style={styles.error}>{error}</AppText> : null}
        <Button label="Keep job" variant="soft" onPress={() => setCancelOpen(false)} />
        <Button
          label="Cancel job"
          variant="danger"
          loading={cancel.isPending}
          onPress={() => cancel.mutate()}
          style={{ marginTop: 8 }}
        />
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
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  stepText: { color: colors.muted, fontSize: 10, letterSpacing: 0.7 },
  heroTitle: { fontSize: 21, lineHeight: 26 },
  heroBody: { color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 4, maxWidth: '94%' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 16 },
  valueLabel: { color: colors.muted, fontSize: 10, letterSpacing: 0.9 },
  value: { color: colors.primary, fontSize: 24, marginTop: 2 },
  window: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  windowText: { color: colors.inkSoft, fontSize: 10.5 },
  body: { paddingHorizontal: 18, paddingTop: 14, gap: 12 },
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    ...shadows.card,
  },
  customerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { fontSize: 9.5, letterSpacing: 1.1 },
  address: { fontSize: 10, lineHeight: 15, marginTop: 2 },
  mapButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    marginTop: 12,
  },
  navIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBody: { fontSize: 10.5, marginTop: 2 },
  detailCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 15 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailKey: { fontSize: 10.5 },
  detailValue: { fontSize: 11.5 },
  detailLine: { height: 1, backgroundColor: colors.line, marginVertical: 10 },
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
  waiting: {
    flexDirection: 'row',
    gap: 11,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.lg,
    padding: 14,
    alignItems: 'center',
  },
  waitingIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingBody: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  error: { color: colors.danger, fontSize: 10.5 },
  cancelLink: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: colors.danger, fontFamily: fonts.semibold, fontSize: 11 },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 20,
    paddingTop: 12,
    ...shadows.float,
  },
  completeNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: 12,
  },
  completeText: { flex: 1, fontSize: 10, lineHeight: 14, color: colors.inkSoft },
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
  reasonText: { flex: 1, fontSize: 12 },
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
});
