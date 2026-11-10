import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useAvailability, useOffers, usePartnerJobs, usePartnerProfile, usePartnerZones, qk } from '../../hooks/data';
import { AppText, Pill, TAB_BAR_SPACE } from '../../ui/core';
import { BrandLockup } from '../../components/Brand';
import { AppModeSwitch } from '../../components/AppModeSwitch';
import { colors, fonts, radius } from '../../theme';
import { formatDate, inr, isActiveStatus, STATUS_COPY, timeOfDay } from '../../lib/format';
import { CategoryGlyph } from '../../ui/CategoryGlyph';
import { useWorkMode } from '../../work-mode';
import { OfferCard } from './OfferCard';

export function PartnerHome() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { setMode } = useWorkMode();
  const profile = usePartnerProfile();
  const availability = useAvailability();
  const offers = useOffers(profile.data?.status === 'APPROVED');
  const jobs = usePartnerJobs();
  const zones = usePartnerZones();

  const activeJobs = useMemo(
    () =>
      (jobs.data ?? []).filter(
        (job) => isActiveStatus(job.status) && job.status !== 'DISPATCHING' && job.status !== 'REQUESTED',
      ),
    [jobs.data],
  );
  const completed = useMemo(() => (jobs.data ?? []).filter((job) => job.status === 'COMPLETED'), [jobs.data]);
  const now = new Date();
  const monthValue = completed
    .filter((job) => {
      const date = new Date(job.updatedAt);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((sum, job) => sum + Number(job.quotedTotal ?? 0), 0);

  const profileChecks = [
    Boolean(profile.data?.cityName),
    Boolean(profile.data?.bio),
    Boolean(profile.data?.skills.length),
    Boolean(zones.data?.length),
  ];
  const completion = Math.round((profileChecks.filter(Boolean).length / profileChecks.length) * 100);

  const toggleOnline = useMutation({
    mutationFn: (isOnline: boolean) => api.setAvailability({ isOnline }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.availability });
      await queryClient.invalidateQueries({ queryKey: qk.offers });
    },
  });

  const online = availability.data?.isOnline ?? false;
  const firstName = (user?.displayName ?? 'Partner').split(' ')[0];
  const primaryOffer = offers.data?.[0];
  const activeJob = activeJobs[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={profile.isRefetching || offers.isRefetching}
            onRefresh={() => {
              void profile.refetch();
              void offers.refetch();
              void jobs.refetch();
              void availability.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.topBar}>
          <BrandLockup />
          <View style={styles.topActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              onPress={() => router.push('/notifications')}
              style={styles.iconButton}
            >
              <Ionicons name="notifications-outline" size={20} color={colors.ink} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Partner profile"
              onPress={() => router.push('/profile')}
              style={styles.avatar}
            >
              <AppText variant="h3" style={styles.avatarText}>
                {firstName.slice(0, 1).toUpperCase()}
              </AppText>
            </Pressable>
          </View>
        </View>

        <View style={styles.modeSwitch}>
          <AppModeSwitch
            tone="surface"
            value="partner"
            onChange={(next) => {
              if (next === 'customer') setMode('customer');
            }}
          />
        </View>

        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="small" style={styles.hello}>
              Good {timeOfDay()}, {firstName}
            </AppText>
            <AppText variant="h1" style={styles.title}>
              {activeJob ? 'On a job' : online ? 'Ready for work' : 'Partner dashboard'}
            </AppText>
          </View>
          <Pill label="APPROVED" tone="success" icon="checkmark-circle" />
        </View>

        <View
          style={[
            styles.availability,
            online && styles.availabilityOnline,
            activeJob && styles.availabilityBusy,
          ]}
        >
          <View style={styles.availabilityTop}>
            <View style={{ flex: 1 }}>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    online && styles.statusDotOn,
                    activeJob && styles.statusDotBusy,
                  ]}
                />
                <AppText variant="caption" style={styles.availabilityLabel}>
                  {activeJob ? 'BUSY · ACTIVE JOB' : online ? 'ONLINE · ACCEPTING JOBS' : 'OFFLINE'}
                </AppText>
              </View>
              <AppText variant="h2" style={styles.availabilityTitle}>
                {activeJob
                  ? activeJob.serviceItemName ?? 'Your active job'
                  : online
                    ? "You're visible to customers"
                    : 'Go online to receive jobs'}
              </AppText>
              <AppText variant="small" style={styles.availabilityBody}>
                {activeJob
                  ? `${activeJob.serviceLocality ?? activeJob.serviceCity} · ${formatDate(
                      activeJob.scheduledAt ?? activeJob.createdAt,
                    )}`
                  : online
                    ? `${zones.data?.length ?? 0} service zones · ${activeJobs.length} active ${
                        activeJobs.length === 1 ? 'job' : 'jobs'
                      }`
                    : 'New requests pause while you are offline. Go online when you are ready to work.'}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: online }}
              accessibilityLabel="Toggle availability"
              onPress={() => toggleOnline.mutate(!online)}
              disabled={toggleOnline.isPending}
              style={[styles.toggle, online && styles.toggleOn]}
            >
              <View style={[styles.thumb, online && styles.thumbOn]} />
            </Pressable>
          </View>
          {activeJob ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/partner/job/[jobId]', params: { jobId: activeJob.id } })
              }
              style={({ pressed }) => [styles.busyAction, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.busyCopy}>
                <AppText variant="small" style={styles.busyLabel}>
                  {STATUS_COPY[activeJob.status]}
                </AppText>
                <AppText variant="h3" style={styles.busyValue}>
                  {inr(activeJob.quotedTotal)}
                </AppText>
              </View>
              <View style={styles.busyButton}>
                <AppText variant="small" style={styles.busyButtonText}>
                  Continue job
                </AppText>
                <Ionicons name="arrow-forward" size={14} color={colors.white} />
              </View>
            </Pressable>
          ) : null}
          <View style={styles.availabilityStats}>
            <View style={styles.stat}>
              <AppText variant="h2" style={styles.statValue}>
                {completed.length}
              </AppText>
              <AppText variant="caption" style={styles.statLabel}>
                COMPLETED
              </AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <AppText variant="h2" style={styles.statValue}>
                {inr(monthValue)}
              </AppText>
              <AppText variant="caption" style={styles.statLabel}>
                THIS MONTH
              </AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <AppText variant="h2" style={styles.statValue}>
                {zones.data?.length ?? 0}
              </AppText>
              <AppText variant="caption" style={styles.statLabel}>
                ZONES
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.quickGrid}>
          {[
            { icon: 'briefcase-outline' as const, label: 'Jobs', detail: 'Offers & work', onPress: () => router.push('/bookings') },
            { icon: 'wallet-outline' as const, label: 'Earnings', detail: 'Completed work', onPress: () => router.push('/partner') },
            { icon: 'map-outline' as const, label: 'Zones', detail: 'Service area', onPress: () => router.push('/partner/zones') },
            { icon: 'time-outline' as const, label: 'History', detail: 'Past jobs', onPress: () => router.push('/partner/history') },
          ].map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={item.onPress}
              style={({ pressed }) => [styles.quick, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.quickIcon}>
                <Ionicons name={item.icon} size={19} color={colors.primary} />
              </View>
              <AppText variant="h3" style={styles.quickLabel}>
                {item.label}
              </AppText>
              <AppText variant="small" style={styles.quickDetail}>
                {item.detail}
              </AppText>
            </Pressable>
          ))}
        </View>

        {online && primaryOffer ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View>
                <AppText variant="h2">Nearby jobs</AppText>
                <AppText variant="small" style={styles.sectionSub}>
                  {offers.data?.length} request{(offers.data?.length ?? 0) === 1 ? '' : 's'} in your zones
                </AppText>
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push('/bookings')}>
                <AppText variant="small" style={styles.link}>
                  View all
                </AppText>
              </Pressable>
            </View>
            <OfferCard key={primaryOffer.id} offer={primaryOffer} compact />
          </View>
        ) : null}

        {online && !primaryOffer ? (
          <View style={styles.listening}>
            <View style={styles.listeningIcon}>
              <Ionicons name="radio-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h3">{activeJob ? 'Finish your active job' : 'Listening for jobs'}</AppText>
              <AppText variant="small" style={styles.listeningBody}>
                {activeJob
                  ? 'New requests arrive once your current job is complete.'
                  : `We will alert you when a job appears in your ${zones.data?.length ?? 0} zones.`}
              </AppText>
            </View>
          </View>
        ) : null}

        {!online ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => toggleOnline.mutate(true)}
            style={({ pressed }) => [styles.offlineCard, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.offlineIcon}>
              <Ionicons name="flash-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h3">Ready to work?</AppText>
              <AppText variant="small" style={styles.offlineBody}>
                Go online and start receiving nearby requests.
              </AppText>
            </View>
            <Ionicons name="arrow-forward" size={17} color={colors.primary} />
          </Pressable>
        ) : null}

        {activeJob ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <AppText variant="h2">Active job</AppText>
              <Pill label={STATUS_COPY[activeJob.status].toUpperCase()} tone="violet" />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/partner/job/[jobId]', params: { jobId: activeJob.id } })}
              style={({ pressed }) => [styles.activeJob, pressed && { opacity: 0.85 }]}
            >
              <CategoryGlyph code={activeJob.categoryCode} size={66} style={styles.activeImage} />
              <View style={{ flex: 1 }}>
                <AppText variant="h3" numberOfLines={1}>
                  {activeJob.serviceItemName}
                </AppText>
                <AppText variant="small" style={styles.activeMeta} numberOfLines={1}>
                  {activeJob.serviceLocality ?? activeJob.serviceCity} · {formatDate(activeJob.scheduledAt ?? activeJob.createdAt)}
                </AppText>
                <View style={styles.activeBottom}>
                  <AppText variant="price" style={styles.activeValue}>
                    {inr(activeJob.quotedTotal)}
                  </AppText>
                  <View style={styles.openJob}>
                    <AppText variant="small" style={styles.openJobText}>
                      Open job
                    </AppText>
                    <Ionicons name="arrow-forward" size={13} color={colors.white} />
                  </View>
                </View>
              </View>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="h2">Earnings</AppText>
            <Pressable accessibilityRole="button" onPress={() => router.push('/partner')}>
              <AppText variant="small" style={styles.link}>
                Details
              </AppText>
            </Pressable>
          </View>
          <View style={styles.earningsCard}>
            <View style={styles.earningsTop}>
              <View>
                <AppText variant="caption" style={styles.earningsLabel}>
                  THIS MONTH
                </AppText>
                <AppText variant="display" style={styles.earningsValue}>
                  {inr(monthValue)}
                </AppText>
              </View>
              <View style={styles.earningsIcon}>
                <Ionicons name="trending-up-outline" size={21} color={colors.success} />
              </View>
            </View>
            <View style={styles.earningsFoot}>
              <AppText variant="small">{completed.length} completed jobs</AppText>
              <AppText variant="small">Customer-paid</AppText>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="h2">Service area</AppText>
            <Pressable accessibilityRole="button" onPress={() => router.push('/partner/zones')}>
              <AppText variant="small" style={styles.link}>
                Manage
              </AppText>
            </Pressable>
          </View>
          <View style={styles.zoneCard}>
            <View style={styles.zoneIcon}>
              <Ionicons name="location-outline" size={19} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h3">
                {profile.data?.cityName ?? 'Bareilly'} · {zones.data?.length ?? 0} zones
              </AppText>
              <AppText variant="small" style={styles.zoneBody}>
                Jobs are sent only inside your selected areas.
              </AppText>
            </View>
          </View>
        </View>

        {completion < 100 ? (
          <View style={styles.completion}>
            <View style={styles.completionTop}>
              <View style={styles.completionIcon}>
                <Ionicons name="person-circle-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="h3">Complete your partner profile</AppText>
                <AppText variant="small" style={styles.completionBody}>
                  Add your skills, bio and service zones.
                </AppText>
              </View>
              <AppText variant="h3" style={styles.completionValue}>
                {completion}%
              </AppText>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressValue, { width: `${completion}%` }]} />
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={styles.completionLink}>
              <AppText variant="small" style={styles.link}>
                Review profile
              </AppText>
              <Ionicons name="arrow-forward" size={13} color={colors.primary} />
            </Pressable>
          </View>
        ) : null}

        <View style={{ height: TAB_BAR_SPACE }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 6 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeSwitch: { marginTop: 14 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 15 },
  greetingRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 19, marginBottom: 16 },
  hello: { color: colors.muted },
  title: { fontSize: 26, marginTop: 2 },
  availability: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  availabilityOnline: { borderColor: colors.primarySoft, backgroundColor: colors.primaryFaint },
  availabilityBusy: { borderColor: colors.amber, backgroundColor: colors.amberSoft },
  availabilityTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.faint },
  statusDotOn: { backgroundColor: colors.success },
  statusDotBusy: { backgroundColor: colors.amber },
  availabilityLabel: { fontSize: 10, color: colors.muted },
  availabilityTitle: { fontSize: 17, lineHeight: 22 },
  availabilityBody: { fontSize: 10.5, lineHeight: 15, marginTop: 4 },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.line, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.primary },
  thumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
  thumbOn: { alignSelf: 'flex-end' },
  availabilityStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  busyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 13,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(242,169,59,0.25)',
  },
  busyCopy: { gap: 1 },
  busyLabel: { fontSize: 10, color: colors.amberDeep },
  busyValue: { fontSize: 16 },
  busyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  busyButtonText: { color: colors.white, fontSize: 10, fontFamily: fonts.semibold },
  stat: { flex: 1, alignItems: 'center', gap: 1 },
  statValue: { fontSize: 18 },
  statLabel: { fontSize: 9.5, letterSpacing: 0.8 },
  statDivider: { width: 1, height: 26, backgroundColor: colors.line },
  quickGrid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  quick: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 11,
    paddingHorizontal: 8,
    gap: 2,
  },
  quickIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  quickLabel: { fontSize: 11.5 },
  quickDetail: { fontSize: 10, lineHeight: 11 },
  section: { marginTop: 24 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 11 },
  sectionSub: { marginTop: 2, fontSize: 10.5 },
  link: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 11.5 },
  listening: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.md,
    padding: 13,
    marginTop: 12,
  },
  listeningIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listeningBody: { marginTop: 2, fontSize: 10.5, lineHeight: 14 },
  offlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    padding: 12,
    marginTop: 12,
  },
  offlineIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBody: { marginTop: 1, fontSize: 10 },
  activeJob: {
    flexDirection: 'row',
    gap: 11,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
  },
  activeImage: { borderRadius: 11 },
  activeMeta: { marginTop: 3, fontSize: 10 },
  activeBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  activeValue: { fontSize: 15 },
  openJob: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  openJobText: { color: colors.white, fontFamily: fonts.semibold, fontSize: 10.5 },
  earningsCard: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: 17,
  },
  earningsTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  earningsLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
  earningsValue: { color: colors.white, fontSize: 31, marginTop: 5, fontFamily: fonts.displayHeavy },
  earningsIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  zoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
  },
  zoneIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneBody: { marginTop: 2, fontSize: 10.5 },
  completion: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginTop: 24,
  },
  completionTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  completionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionBody: { marginTop: 2, fontSize: 10 },
  completionValue: { fontFamily: fonts.extra, color: colors.primary },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: colors.primarySoft, marginTop: 11, overflow: 'hidden' },
  progressValue: { height: 5, borderRadius: 3, backgroundColor: colors.primary },
  completionLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, alignSelf: 'flex-end' },
  switchMode: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, paddingVertical: 12 },
});
