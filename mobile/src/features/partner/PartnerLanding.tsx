import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, EmptyState, Pill, TAB_BAR_SPACE } from '../../ui/core';
import { BrandLockup } from '../../components/Brand';
import { useOffers, usePartnerJobs, usePartnerProfile, usePartnerZones } from '../../hooks/data';
import { useWorkMode } from '../../work-mode';
import { colors, radius } from '../../theme';
import { CategoryGlyph } from '../../ui/CategoryGlyph';

const BENEFITS = [
  { icon: 'calendar-outline' as const, title: 'Own your schedule', body: 'Go online only when you want to work.' },
  { icon: 'location-outline' as const, title: 'Jobs near you', body: 'Choose the zones you want to serve.' },
  { icon: 'cash-outline' as const, title: 'Clear job value', body: 'See the amount before you accept.' },
];

export function PartnerLanding() {
  const router = useRouter();
  const profile = usePartnerProfile();
  const jobs = usePartnerJobs();
  const offers = useOffers(profile.data?.status === 'APPROVED');
  const zones = usePartnerZones();
  const { setMode } = useWorkMode();

  const enterPartnerMode = () => {
    setMode('partner');
    router.replace('/');
  };

  if (profile.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <AppText variant="body">Loading partner details…</AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (profile.data?.status === 'APPROVED') {
    const activeJobs = (jobs.data ?? []).filter(
      (job) => !job.status.startsWith('CANCELLED') && job.status !== 'COMPLETED',
    ).length;
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <BrandLockup />
            <Pill label="APPROVED" tone="success" icon="checkmark-circle" />
          </View>

          <View style={styles.approvedHero}>
            <View style={styles.approvedAvatar}>
              <AppText variant="h1" style={styles.approvedInitial}>
                {(profile.data.displayName ?? 'P').slice(0, 1).toUpperCase()}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" style={styles.approvedEyebrow}>
                PARTNER WORKSPACE
              </AppText>
              <AppText variant="h2" style={styles.approvedTitle}>
                {profile.data.displayName}
              </AppText>
              <AppText variant="small" style={styles.approvedBody}>
                {profile.data.cityName ?? 'Bareilly'} · {profile.data.skills.length} skills
              </AppText>
            </View>
          </View>

          <View style={styles.approvedStats}>
            {[
              { label: 'NEW REQUESTS', value: String(offers.data?.length ?? 0) },
              { label: 'ACTIVE JOBS', value: String(activeJobs) },
              { label: 'ZONES', value: String(zones.data?.length ?? 0) },
            ].map((stat) => (
              <View key={stat.label} style={styles.approvedStat}>
                <AppText variant="h2" style={styles.approvedStatValue}>
                  {stat.value}
                </AppText>
                <AppText variant="caption" style={styles.approvedStatLabel}>
                  {stat.label}
                </AppText>
              </View>
            ))}
          </View>

          <View style={styles.workspaceList}>
            {[
              { icon: 'briefcase-outline' as const, title: 'Jobs and requests', body: 'Accept nearby work and move each job forward.' },
              { icon: 'wallet-outline' as const, title: 'Earnings', body: 'See completed job value and transaction history.' },
              { icon: 'map-outline' as const, title: 'Service zones', body: 'Choose exactly where you want to receive jobs.' },
            ].map((row) => (
              <View key={row.title} style={styles.workspaceRow}>
                <View style={styles.workspaceIcon}>
                  <Ionicons name={row.icon} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h3">{row.title}</AppText>
                  <AppText variant="small" style={styles.workspaceBody}>
                    {row.body}
                  </AppText>
                </View>
              </View>
            ))}
          </View>

          <Button label="Open partner workspace" icon="arrow-forward" size="lg" onPress={enterPartnerMode} />
          <AppText variant="small" style={styles.finePrint}>
            You can switch back to the customer app from your partner profile at any time.
          </AppText>
          <View style={{ height: TAB_BAR_SPACE }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (profile.data?.status === 'PENDING_REVIEW' || profile.data?.status === 'DRAFT') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <BrandLockup />
            <Pill label="PENDING REVIEW" tone="amber" />
          </View>
          <View style={styles.pendingCard}>
            <View style={styles.pendingIcon}>
              <Ionicons name="hourglass-outline" size={26} color={colors.amberDeep} />
            </View>
            <AppText variant="h2" style={styles.pendingTitle}>
              Application under review
            </AppText>
            <AppText variant="small" style={styles.pendingBody}>
              Our team checks every partner before jobs are sent. You can go online as soon as your application is approved.
            </AppText>
          </View>
          <View style={styles.checklist}>
            {[
              { label: 'Profile submitted', done: true, detail: `${profile.data.skills.length} skills · ${profile.data.cityName ?? 'Bareilly'}` },
              { label: 'Identity and skills review', done: false, detail: 'Our team is checking your details' },
              { label: 'Start receiving jobs', done: false, detail: 'Go online after approval' },
            ].map((item, index) => (
              <View key={item.label} style={styles.checkRow}>
                <View style={styles.checkRail}>
                  <View style={[styles.checkDot, item.done && styles.checkDotDone]}>
                    {item.done ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
                  </View>
                  {index < 2 ? <View style={[styles.checkLine, item.done && styles.checkLineDone]} /> : null}
                </View>
                <View style={styles.checkBody}>
                  <AppText variant="h3">{item.label}</AppText>
                  <AppText variant="small">{item.detail}</AppText>
                </View>
              </View>
            ))}
          </View>
          <View style={{ height: TAB_BAR_SPACE }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (profile.data?.status === 'REJECTED' || profile.data?.status === 'SUSPENDED') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <EmptyState
            icon="alert-circle-outline"
            title={profile.data.status === 'SUSPENDED' ? 'Account suspended' : 'Application not approved'}
            body={
              profile.data.status === 'SUSPENDED'
                ? 'Contact Fixyes support to review your partner account.'
                : 'You can update your details and apply again.'
            }
            action="Review application"
            onAction={() => router.push('/partner/onboarding')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <BrandLockup />
          <View style={styles.headerIcon}>
            <Ionicons name="briefcase-outline" size={19} color={colors.primary} />
          </View>
        </View>
        <AppText variant="caption" style={styles.eyebrow}>
          PARTNER WITH FIXYES
        </AppText>
        <AppText variant="h1" style={styles.title}>
          Your skills.{'\n'}Your schedule.
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Join Bareilly’s local home-service network. Accept jobs when you are free and get paid by the customer after every completed visit.
        </AppText>

        <View style={styles.hero}>
          <View style={styles.heroOrbLarge} />
          <View style={styles.heroOrbSmall} />
          <View style={styles.heroBadge}>
            <Ionicons name="shield-checkmark" size={13} color={colors.success} />
            <AppText variant="caption" style={styles.heroBadgeText}>
              VERIFIED PARTNERS
            </AppText>
          </View>
          <View style={styles.heroTiles}>
            <CategoryGlyph code="ac-cooling" size={62} style={styles.heroTile} />
            <CategoryGlyph code="electrical" size={62} style={[styles.heroTile, styles.heroTileRaised]} />
            <CategoryGlyph code="plumbing" size={62} style={styles.heroTile} />
          </View>
          <View style={styles.heroCaption}>
            <AppText variant="caption" style={styles.heroCaptionLabel}>
              BUILT FOR LOCAL PROS
            </AppText>
            <AppText variant="h3" style={styles.heroCaptionText}>
              One account. Jobs, zones and history.
            </AppText>
          </View>
        </View>

        <View style={styles.benefits}>
          {BENEFITS.map((benefit) => (
            <View key={benefit.title} style={styles.benefit}>
              <View style={styles.benefitIcon}>
                <Ionicons name={benefit.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="h3">{benefit.title}</AppText>
                <AppText variant="small" style={styles.benefitBody}>
                  {benefit.body}
                </AppText>
              </View>
            </View>
          ))}
        </View>

        <Button label="Apply as a partner" icon="arrow-forward" size="lg" onPress={() => router.push('/partner/onboarding')} />
        <Pressable accessibilityRole="button" onPress={() => router.push('/help')} style={styles.help}>
          <Ionicons name="help-circle-outline" size={15} color={colors.muted} />
          <AppText variant="small">Questions about partnering?</AppText>
        </Pressable>
        <AppText variant="small" style={styles.finePrint}>
          Applications are reviewed before jobs are sent. You only receive jobs after approval.
        </AppText>
        <View style={{ height: TAB_BAR_SPACE }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, color: colors.primary, marginBottom: 6 },
  title: { fontSize: 31, lineHeight: 36 },
  subtitle: { marginTop: 9, lineHeight: 20, fontSize: 13 },
  hero: {
    height: 220,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginTop: 20,
    backgroundColor: colors.primary,
  },
  heroOrbLarge: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    right: -70,
    top: -86,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroOrbSmall: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    left: -40,
    top: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroTiles: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 50,
  },
  heroTile: {
    borderRadius: radius.md,
    shadowColor: '#0B2150',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heroTileRaised: { transform: [{ translateY: -12 }] },
  heroBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  heroBadgeText: { color: colors.ink, fontSize: 10 },
  heroCaption: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 13,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.md,
    padding: 11,
  },
  heroCaptionLabel: { color: colors.primary, fontSize: 10 },
  heroCaptionText: { marginTop: 2 },
  benefits: { gap: 1, marginTop: 20, marginBottom: 20, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderBottomWidth: 1, borderBottomColor: colors.line },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitBody: { marginTop: 2, fontSize: 10.5 },
  help: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 14 },
  finePrint: { textAlign: 'center', fontSize: 11, lineHeight: 14, marginTop: 12 },
  pendingCard: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: 22, alignItems: 'center', marginTop: 6 },
  pendingIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  pendingTitle: { textAlign: 'center' },
  pendingBody: { textAlign: 'center', marginTop: 7, lineHeight: 18, fontSize: 12 },
  checklist: { marginTop: 20, paddingLeft: 6 },
  checkRow: { flexDirection: 'row', gap: 11 },
  checkRail: { alignItems: 'center', width: 24 },
  checkDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  checkDotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkLine: { width: 1.5, flex: 1, minHeight: 34, backgroundColor: colors.line, marginVertical: 3 },
  checkLineDone: { backgroundColor: colors.primary },
  checkBody: { flex: 1, paddingBottom: 20, gap: 2 },
  approvedHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 15,
  },
  approvedAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvedInitial: { color: colors.primary, fontSize: 22 },
  approvedEyebrow: { color: colors.primary, fontSize: 10 },
  approvedTitle: { fontSize: 19, marginTop: 2 },
  approvedBody: { marginTop: 3, fontSize: 10.5 },
  approvedStats: {
    flexDirection: 'row',
    backgroundColor: colors.primaryDeep,
    borderRadius: radius.lg,
    paddingVertical: 15,
    marginTop: 12,
  },
  approvedStat: { flex: 1, alignItems: 'center', gap: 2 },
  approvedStatValue: { color: colors.white, fontSize: 19 },
  approvedStatLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 9, letterSpacing: 0.7 },
  workspaceList: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 12,
    marginBottom: 18,
    overflow: 'hidden',
  },
  workspaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  workspaceIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workspaceBody: { fontSize: 10, lineHeight: 14, marginTop: 1 },
});
