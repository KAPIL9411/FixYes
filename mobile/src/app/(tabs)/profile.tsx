import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../auth';
import { useBookings, useCategories, usePartnerJobs, usePartnerProfile, usePartnerZones } from '../../hooks/data';
import { AppText, Button, ListRow, Pill, TAB_BAR_SPACE } from '../../ui/core';
import { colors, radius, shadows } from '../../theme';
import { initials, inr } from '../../lib/format';
import { useWorkMode } from '../../work-mode';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { mode, setMode } = useWorkMode();
  const bookings = useBookings();
  const categories = useCategories();
  const partner = usePartnerProfile();
  const partnerJobs = usePartnerJobs();
  const zones = usePartnerZones();

  const isPartnerMode = mode === 'partner' && partner.data?.status === 'APPROVED';
  const isApprovedPartner = partner.data?.status === 'APPROVED';

  const customerStats = useMemo(() => {
    const all = bookings.data ?? [];
    return {
      total: all.length,
      active: all.filter(
        (booking) =>
          !booking.status.startsWith('CANCELLED') &&
          booking.status !== 'COMPLETED' &&
          booking.status !== 'NO_PARTNER_AVAILABLE',
      ).length,
      completed: all.filter((booking) => booking.status === 'COMPLETED').length,
    };
  }, [bookings.data]);

  const partnerStats = useMemo(() => {
    const all = partnerJobs.data ?? [];
    const completed = all.filter((job) => job.status === 'COMPLETED');
    return {
      completed: completed.length,
      value: completed.reduce((sum, job) => sum + Number(job.quotedTotal ?? 0), 0),
    };
  }, [partnerJobs.data]);

  if (isPartnerMode && partner.data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <View>
            <AppText variant="caption" style={styles.eyebrow}>
              PARTNER ACCOUNT
            </AppText>
            <AppText variant="h1" style={styles.title}>
              Profile
            </AppText>
          </View>
          <Pill label="VERIFIED PARTNER" tone="success" icon="checkmark-circle" />
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.avatar}>
              <AppText variant="h2" style={styles.avatarText}>
                {initials(user?.displayName ?? 'Fixyes Partner')}
              </AppText>
            </View>
            <AppText variant="h2" style={styles.name}>
              {user?.displayName ?? 'Fixyes partner'}
            </AppText>
            <AppText variant="small" style={styles.email}>
              {user?.email ?? user?.displayName ?? 'Partner account'}
            </AppText>
            <View style={styles.badges}>
              <Pill label={partner.data.cityName?.toUpperCase() ?? 'BAREILLY'} tone="violet" icon="location-outline" />
              <Pill label="APPROVED" tone="success" />
            </View>
            {partner.data.bio ? (
              <AppText variant="small" style={styles.bio}>
                {partner.data.bio}
              </AppText>
            ) : null}
            <View style={styles.skills}>
              {partner.data.skills.map((skill) => (
                <Pill
                  key={skill.categoryCode}
                  label={
                    (categories.data?.find((category) => category.code === skill.categoryCode)?.name ??
                      skill.categoryCode.replace('-', ' ')).toUpperCase()
                  }
                  tone="neutral"
                  icon={skill.verified ? 'checkmark-circle-outline' : undefined}
                />
              ))}
            </View>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <AppText variant="h2">{partnerStats.completed}</AppText>
                <AppText variant="caption" style={styles.statLabel}>
                  COMPLETED
                </AppText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <AppText variant="h2" style={styles.statValue}>
                  {inr(partnerStats.value)}
                </AppText>
                <AppText variant="caption" style={styles.statLabel}>
                  JOB VALUE
                </AppText>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <AppText variant="h2">{zones.data?.length ?? 0}</AppText>
                <AppText variant="caption" style={styles.statLabel}>
                  ZONES
                </AppText>
              </View>
            </View>
          </View>

          <AppText variant="caption" style={styles.sectionLabel}>
            WORK
          </AppText>
          <View style={styles.group}>
            <ListRow icon="briefcase-outline" label="Jobs" detail="Requests, active work and history" onPress={() => router.push('/bookings')} />
            <ListRow icon="wallet-outline" label="Earnings" detail="Completed job value" onPress={() => router.push('/partner')} />
            <ListRow icon="map-outline" label="Service zones" detail="Areas where you accept jobs" onPress={() => router.push('/partner/zones')} />
            <ListRow icon="time-outline" label="Work history" detail="Past jobs and amounts" onPress={() => router.push('/partner/history')} last />
          </View>

          <AppText variant="caption" style={styles.sectionLabel}>
            ACCOUNT
          </AppText>
          <View style={styles.group}>
            <ListRow icon="location-outline" label="Saved addresses" detail="Service and home locations" onPress={() => router.push('/addresses')} />
            <ListRow icon="notifications-outline" label="Notifications" detail="Booking updates" onPress={() => router.push('/notifications')} />
            <ListRow icon="settings-outline" label="Settings" detail="Account and app options" onPress={() => router.push('/settings')} last />
          </View>

          <Button
            label="Switch to customer app"
            icon="swap-horizontal-outline"
            variant="ghost"
            onPress={() => {
              setMode('customer');
              router.replace('/');
            }}
            style={{ marginTop: 18 }}
          />
          <Button
            label="Sign out"
            icon="log-out-outline"
            variant="danger"
            onPress={async () => {
              await signOut();
              router.replace('/welcome');
            }}
            style={{ marginTop: 9 }}
          />
          <View style={{ height: TAB_BAR_SPACE }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <AppText variant="caption" style={styles.eyebrow}>
            YOUR ACCOUNT
          </AppText>
          <AppText variant="h1" style={styles.title}>
            Profile
          </AppText>
        </View>
        <Ionicons name="person-circle-outline" size={26} color={colors.primary} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <AppText variant="h2" style={styles.avatarText}>
              {initials(user?.displayName ?? 'Fixyes User')}
            </AppText>
          </View>
          <AppText variant="h2" style={styles.name}>
            {user?.displayName ?? 'Fixyes user'}
          </AppText>
          <AppText variant="small" style={styles.email}>
            {user?.email ?? user?.displayName ?? 'User'}
          </AppText>
          <View style={styles.badges}>
            {user?.emailVerified ? <Pill label="EMAIL VERIFIED" tone="success" icon="checkmark-circle" /> : null}
            <Pill label="CUSTOMER" tone="violet" icon="person-outline" />
            {isApprovedPartner ? <Pill label="PARTNER" tone="neutral" icon="briefcase-outline" /> : null}
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <AppText variant="h2">{customerStats.total}</AppText>
              <AppText variant="caption" style={styles.statLabel}>
                BOOKINGS
              </AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <AppText variant="h2">{customerStats.active}</AppText>
              <AppText variant="caption" style={styles.statLabel}>
                ACTIVE
              </AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <AppText variant="h2">{customerStats.completed}</AppText>
              <AppText variant="caption" style={styles.statLabel}>
                COMPLETED
              </AppText>
            </View>
          </View>
        </View>

        {isApprovedPartner ? (
          <View style={styles.partnerBanner}>
            <View style={styles.partnerBannerIcon}>
              <Ionicons name="briefcase-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h3">Partner mode</AppText>
              <AppText variant="small" style={styles.partnerBannerBody}>
                Manage availability, jobs and earnings.
              </AppText>
            </View>
            <Button
              label="Open"
              size="sm"
              full={false}
              onPress={() => {
                setMode('partner');
                router.replace('/');
              }}
            />
          </View>
        ) : null}

        <AppText variant="caption" style={styles.sectionLabel}>
          YOUR ACTIVITY
        </AppText>
        <View style={styles.group}>
          <ListRow icon="location-outline" label="Saved addresses" detail="Home, work and other locations" onPress={() => router.push('/addresses')} />
          <ListRow icon="calendar-outline" label="My bookings" detail="Active jobs and service history" onPress={() => router.push('/bookings')} />
          <ListRow icon="wallet-outline" label="Payments" detail="Completed service amounts" onPress={() => router.push('/payments')} />
          <ListRow icon="notifications-outline" label="Notifications" detail="Booking updates" onPress={() => router.push('/notifications')} last />
        </View>

        <AppText variant="caption" style={styles.sectionLabel}>
          SUPPORT
        </AppText>
        <View style={styles.group}>
          <ListRow icon="help-circle-outline" label="Help & support" detail="FAQs and contact" onPress={() => router.push('/help')} />
          <ListRow icon="settings-outline" label="Settings" detail="Account and app options" onPress={() => router.push('/settings')} last />
        </View>

        <AppText variant="caption" style={styles.sectionLabel}>
          PARTNER
        </AppText>
        <View style={styles.group}>
          <ListRow
            icon="briefcase-outline"
            label={isApprovedPartner ? 'Partner dashboard' : (partner.data?.status === 'PENDING_REVIEW' ? 'Application status' : 'Earn with Fixyes')}
            detail={isApprovedPartner ? 'Jobs, zones and earnings' : 'Application under review'}
            onPress={() => {
              if (isApprovedPartner) {
                setMode('partner');
                router.replace('/');
              } else {
                router.push('/become-partner');
              }
            }}
            last
          />
        </View>

        <Button
          label="Sign out"
          icon="log-out-outline"
          variant="danger"
          onPress={async () => {
            await signOut();
            router.replace('/welcome');
          }}
          style={{ marginTop: 20 }}
        />
        <AppText variant="small" style={styles.footer}>
          Fixyes 1.0 · Made for Bareilly
        </AppText>
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
    paddingBottom: 12,
  },
  eyebrow: { fontSize: 10 },
  title: { fontSize: 28, marginTop: 2 },
  content: { paddingHorizontal: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    padding: 20,
    ...shadows.card,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },
  avatarText: { color: colors.white, fontSize: 21 },
  name: { fontSize: 19 },
  email: { marginTop: 2, fontSize: 10.5 },
  badges: { flexDirection: 'row', gap: 5, marginTop: 9, flexWrap: 'wrap', justifyContent: 'center' },
  bio: { textAlign: 'center', marginTop: 10, fontSize: 10.5, lineHeight: 15 },
  skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center', marginTop: 10 },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    alignSelf: 'stretch',
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 16 },
  statLabel: { fontSize: 9.5, letterSpacing: 0.8 },
  statDivider: { width: 1, height: 26, backgroundColor: colors.line },
  partnerBanner: {
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
  partnerBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerBannerBody: { fontSize: 10, marginTop: 2 },
  sectionLabel: { marginTop: 20, marginBottom: 7, fontSize: 10 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  footer: { textAlign: 'center', marginTop: 18, fontSize: 11, color: colors.faint },
});
