import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePartnerJobs } from '../../hooks/data';
import { AppText, EmptyState, Pill, TAB_BAR_SPACE } from '../../ui/core';
import { colors, fonts, radius } from '../../theme';
import { formatDate, inr } from '../../lib/format';

type Period = 'today' | 'week' | 'month' | 'all';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
];

export function PartnerEarnings() {
  const router = useRouter();
  const jobs = usePartnerJobs();
  const [period, setPeriod] = useState<Period>('month');

  const completed = useMemo(() => (jobs.data ?? []).filter((job) => job.status === 'COMPLETED'), [jobs.data]);

  const fromDate = useMemo(() => {
    const now = new Date();
    if (period === 'today') {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      return date;
    }
    if (period === 'week') {
      const date = new Date(now);
      date.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      date.setHours(0, 0, 0, 0);
      return date;
    }
    if (period === 'month') {
      const date = new Date(now);
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date;
    }
    return null;
  }, [period]);

  const filtered = useMemo(
    () =>
      completed
        .filter((job) => !fromDate || new Date(job.updatedAt).getTime() >= fromDate.getTime())
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [completed, fromDate],
  );

  const total = filtered.reduce((sum, job) => sum + Number(job.quotedTotal ?? 0), 0);
  const average = filtered.length ? Math.round(total / filtered.length) : 0;
  const latest = completed[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <AppText variant="caption" style={styles.eyebrow}>
            PARTNER EARNINGS
          </AppText>
          <AppText variant="h1" style={styles.title}>
            Earnings
          </AppText>
        </View>
        <Pill label="CUSTOMER-PAID" tone="neutral" />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()} tintColor={colors.primary} />
        }
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods}>
          {PERIODS.map((item) => {
            const selected = period === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => setPeriod(item.id)}
                style={[styles.period, selected && styles.periodActive]}
              >
                <AppText variant="small" style={[styles.periodText, selected && styles.periodTextActive]}>
                  {item.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <AppText variant="caption" style={styles.heroLabel}>
              {PERIODS.find((item) => item.id === period)?.label.toUpperCase()} · COMPLETED VALUE
            </AppText>
            <View style={styles.heroIcon}>
              <Ionicons name="wallet-outline" size={19} color={colors.white} />
            </View>
          </View>
          <AppText variant="display" style={styles.heroValue}>
            {inr(total)}
          </AppText>
          <View style={styles.heroMeta}>
            <View style={styles.heroMetaItem}>
              <AppText variant="h3" style={styles.heroMetaValue}>
                {filtered.length}
              </AppText>
              <AppText variant="small" style={styles.heroMetaLabel}>
                completed jobs
              </AppText>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroMetaItem}>
              <AppText variant="h3" style={styles.heroMetaValue}>
                {inr(average)}
              </AppText>
              <AppText variant="small" style={styles.heroMetaLabel}>
                average job value
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <AppText variant="small" style={styles.noteText}>
            Customers pay you directly after a completed visit. Fixyes does not hold this money or provide an online payout account.
          </AppText>
        </View>

        <View style={styles.sectionHead}>
          <AppText variant="h2">Transactions</AppText>
          <AppText variant="small">{filtered.length} jobs</AppText>
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title="Nothing completed in this period"
            body="Completed jobs and their job value will appear here."
            action="View jobs"
            onAction={() => router.push('/bookings')}
          />
        ) : (
          <View style={styles.list}>
            {filtered.map((job) => (
              <Pressable
                key={job.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/partner/job/[jobId]', params: { jobId: job.id } })}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="checkmark" size={16} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h3" numberOfLines={1}>
                    {job.serviceItemName ?? 'Home service'}
                  </AppText>
                  <AppText variant="small" style={styles.rowMeta} numberOfLines={1}>
                    {formatDate(job.updatedAt)} · {job.serviceLocality ?? job.serviceCity}
                  </AppText>
                </View>
                <View style={styles.rowRight}>
                  <AppText variant="h3" style={styles.rowValue}>
                    {inr(job.quotedTotal)}
                  </AppText>
                  <AppText variant="small" style={styles.rowStatus}>
                    Completed
                  </AppText>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {latest ? (
          <View style={styles.latest}>
            <AppText variant="caption" style={styles.latestLabel}>
              LATEST COMPLETED JOB
            </AppText>
            <AppText variant="h3" style={styles.latestTitle}>
              {latest.serviceItemName}
            </AppText>
            <View style={styles.latestMeta}>
              <AppText variant="small">{formatDate(latest.updatedAt)}</AppText>
              <AppText variant="price" style={styles.latestValue}>
                {inr(latest.quotedTotal)}
              </AppText>
            </View>
          </View>
        ) : null}

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
  periods: { gap: 7, paddingBottom: 13 },
  period: {
    paddingHorizontal: 13,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { color: colors.inkSoft, fontSize: 11.5 },
  periodTextActive: { color: colors.white, fontFamily: fonts.semibold },
  hero: { backgroundColor: colors.ink, borderRadius: radius.xl, padding: 18 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, letterSpacing: 0.7 },
  heroIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  heroValue: { color: colors.white, fontSize: 38, lineHeight: 44, marginTop: 8, fontFamily: fonts.displayHeavy },
  heroMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)' },
  heroMetaItem: { flex: 1 },
  heroMetaValue: { color: colors.white, fontSize: 15 },
  heroMetaLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10, marginTop: 1 },
  heroDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.14)', marginHorizontal: 14 },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 12,
  },
  noteText: { flex: 1, fontSize: 10.5, lineHeight: 15 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.successSoft, alignItems: 'center', justifyContent: 'center' },
  rowMeta: { fontSize: 11, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowValue: { fontSize: 13.5 },
  rowStatus: { color: colors.success, fontSize: 10.5, marginTop: 1 },
  latest: { marginTop: 20, padding: 14, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  latestLabel: { fontSize: 10 },
  latestTitle: { marginTop: 3 },
  latestMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  latestValue: { fontSize: 16 },
});
