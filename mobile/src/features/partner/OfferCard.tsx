import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import type { PartnerOffer } from '../../api/types';
import { qk } from '../../hooks/data';
import { AppText, Pill } from '../../ui/core';
import { colors, fonts, radius } from '../../theme';
import { formatDate, inr, secondsLabel } from '../../lib/format';
import { errorMessage } from '../../lib/errors';

function useCountdown(expiresAt: string | undefined) {
  const [seconds, setSeconds] = useState(() =>
    expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)) : 0,
  );
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return seconds;
}

export function OfferCard({ offer, compact = false }: { offer: PartnerOffer; compact?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const seconds = useCountdown(offer.expiresAt);
  const [error, setError] = useState('');

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: qk.offers });
    await queryClient.invalidateQueries({ queryKey: qk.partnerJobs });
    await queryClient.invalidateQueries({ queryKey: qk.bookings });
    await queryClient.invalidateQueries({ queryKey: qk.availability });
  };

  const accept = useMutation({
    mutationFn: async () => {
      const booking = await api.acceptOffer(offer.id);
      if (booking.status === 'PARTNER_ASSIGNED') {
        try {
          await api.setPartnerJobStatus(booking.id, 'PARTNER_ACCEPTED');
        } catch {
          // The offer is already accepted; a status sync failure is non-fatal.
        }
      }
      return booking;
    },
    onSuccess: async (booking) => {
      await refresh();
      router.push({ pathname: '/partner/job/[jobId]', params: { jobId: booking.id } });
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const reject = useMutation({
    mutationFn: () => api.rejectOffer(offer.id),
    onSuccess: refresh,
    onError: (cause) => setError(errorMessage(cause)),
  });

  return (
    <View style={[styles.card, compact && styles.compact]}>
      <View style={styles.head}>
        <Pill label="NEW REQUEST" tone="violet" icon="flash" />
        <View style={[styles.timer, seconds < 15 && styles.timerUrgent]}>
          <Ionicons name="time-outline" size={12} color={seconds < 15 ? colors.danger : colors.muted} />
          <AppText variant="small" style={[styles.timerText, seconds < 15 && { color: colors.danger }]}>
            {secondsLabel(seconds * 1000)}
          </AppText>
        </View>
      </View>

      <AppText variant="h3" style={styles.title} numberOfLines={2}>
        {offer.serviceItemName}
      </AppText>
      <View style={styles.meta}>
        <Ionicons name="calendar-outline" size={12} color={colors.muted} />
        <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
          {offer.scheduledAt ? formatDate(offer.scheduledAt) : 'As soon as possible'}
        </AppText>
        <AppText variant="price" style={styles.value}>
          {inr(offer.quotedTotal)}
        </AppText>
      </View>
      <View style={styles.meta}>
        <Ionicons name="location-outline" size={12} color={colors.muted} />
        <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
          {offer.serviceCity} · exact address after accepting
        </AppText>
      </View>

      {error ? (
        <AppText variant="small" style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => reject.mutate()}
          disabled={reject.isPending || accept.isPending}
          style={({ pressed }) => [styles.decline, pressed && { opacity: 0.7 }]}
        >
          <AppText variant="h3" style={styles.declineText}>
            Decline
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => accept.mutate()}
          disabled={accept.isPending || reject.isPending}
          style={({ pressed }) => [styles.accept, pressed && { opacity: 0.85 }]}
        >
          {accept.isPending ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color={colors.white} />
              <AppText variant="h3" style={styles.acceptText}>
                Accept job
              </AppText>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 15,
  },
  compact: { padding: 13 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  timerUrgent: { backgroundColor: colors.dangerSoft },
  timerText: { fontSize: 10, fontFamily: fonts.semibold },
  title: { fontSize: 16, marginTop: 9 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  value: { fontSize: 17, marginLeft: 'auto' },
  customer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 10.5, color: colors.primary },
  customerName: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 11.5 },
  address: { fontSize: 10, marginTop: 1 },
  error: { color: colors.danger, fontSize: 10.5, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 13 },
  decline: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: { fontSize: 12.5, color: colors.inkSoft },
  accept: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  acceptText: { color: colors.white, fontSize: 12.5 },
});
