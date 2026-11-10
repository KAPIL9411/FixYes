import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePartnerJobs } from '../../hooks/data';
import { AppText, EmptyState, Pill } from '../../ui/core';
import { AppHeader } from '../../components/AppHeader';
import { colors, fonts, radius, shadows } from '../../theme';
import { formatDate, inr, shortId } from '../../lib/format';
import { CategoryGlyph } from '../../ui/CategoryGlyph';

type Filter = 'completed' | 'cancelled';

export default function PartnerHistoryScreen() {
  const jobs = usePartnerJobs();
  const [filter, setFilter] = useState<Filter>('completed');

  const all = useMemo(() => jobs.data ?? [], [jobs.data]);
  const completed = useMemo(() => all.filter((job) => job.status === 'COMPLETED'), [all]);
  const cancelled = useMemo(() => all.filter((job) => job.status.startsWith('CANCELLED')), [all]);
  const list = filter === 'completed' ? completed : cancelled;
  const completedValue = completed.reduce((sum, job) => sum + Number(job.quotedTotal ?? 0), 0);

  return (
    <View style={styles.root}>
      <AppHeader title="Work history" />
      <ScrollView contentContainerStyle={{ paddingBottom: 34 }} showsVerticalScrollIndicator={false}>
        <View style={styles.summary}>
          <View style={styles.summaryTop}>
            <View>
              <AppText variant="caption" style={styles.summaryEyebrow}>
                TOTAL JOB VALUE
              </AppText>
              <AppText variant="display" style={styles.summaryValue}>
                {inr(completedValue)}
              </AppText>
              <AppText variant="small" style={styles.summaryHint}>
                Across {completed.length} completed job{completed.length === 1 ? '' : 's'}
              </AppText>
            </View>
            <View style={styles.summaryIcon}>
              <Ionicons name="trending-up" size={24} color={colors.white} />
            </View>
          </View>
          <View style={styles.summaryStats}>
            <View>
              <AppText variant="h3" style={styles.statValue}>
                {completed.length}
              </AppText>
              <AppText variant="caption" style={styles.statLabel}>
                COMPLETED
              </AppText>
            </View>
            <View style={styles.summaryDivider} />
            <View>
              <AppText variant="h3" style={styles.statValue}>
                {cancelled.length}
              </AppText>
              <AppText variant="caption" style={styles.statLabel}>
                CANCELLED
              </AppText>
            </View>
            <View style={styles.summaryDivider} />
            <View>
              <AppText variant="h3" style={styles.statValue}>
                {completedValue > 0 ? inr(completedValue / Math.max(completed.length, 1)) : inr(0)}
              </AppText>
              <AppText variant="caption" style={styles.statLabel}>
                AVG. JOB VALUE
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.tabs}>
          {(['completed', 'cancelled'] as Filter[]).map((tab) => (
            <Pressable accessibilityRole="button"
              key={tab}
              onPress={() => setFilter(tab)}
              style={[styles.tab, filter === tab && styles.tabActive]}
            >
              <AppText variant="h3" style={[styles.tabText, filter === tab && styles.tabTextActive]}>
                {tab === 'completed' ? 'Completed' : 'Cancelled'}
              </AppText>
            </Pressable>
          ))}
        </View>

        <View style={styles.list}>
          {list.map((job) => (
            <View key={job.id} style={styles.card}>
              <CategoryGlyph code={job.categoryCode} size={58} style={styles.thumb} />
              <View style={{ flex: 1 }}>
                <View style={styles.cardTop}>
                  <AppText variant="h3" numberOfLines={1} style={{ flex: 1 }}>
                    {job.serviceItemName}
                  </AppText>
                  <Pill
                    label={job.status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED'}
                    tone={job.status === 'COMPLETED' ? 'success' : 'danger'}
                  />
                </View>
                <AppText variant="small" style={styles.meta} numberOfLines={1}>
                  {formatDate(job.updatedAt)} · {job.serviceLocality ?? job.serviceCity}
                </AppText>
                <View style={styles.cardBottom}>
                  <AppText variant="small" style={styles.id}>
                    {shortId(job.id)}
                  </AppText>
                  <AppText variant="h3" style={styles.value}>
                    {inr(job.quotedTotal)}
                  </AppText>
                </View>
              </View>
            </View>
          ))}
          {list.length === 0 ? (
            <EmptyState
              icon="time-outline"
              title={filter === 'completed' ? 'No completed jobs yet' : 'No cancelled jobs'}
              body={
                filter === 'completed'
                  ? 'Finish a job from your dashboard and it will appear here.'
                  : 'Cancelled jobs will be listed here for your records.'
              }
            />
          ) : null}
        </View>

        {completed.length > 0 ? (
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={15} color={colors.primary} />
            <AppText variant="small" style={styles.noteText}>
              Job value is the quoted price of each completed service, not a payout statement.
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  summary: {
    marginHorizontal: 18,
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: 20,
    overflow: 'hidden',
  },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  summaryEyebrow: { color: colors.amber, fontSize: 10, letterSpacing: 1.2 },
  summaryValue: { color: colors.white, fontSize: 32, marginTop: 3 },
  summaryHint: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: 'rgba(36,87,230,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  summaryDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.1)' },
  statValue: { color: colors.white, fontSize: 14 },
  statLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, letterSpacing: 0.8, marginTop: 1 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginTop: 18,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  tab: { flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.ink },
  tabText: { fontSize: 11.5, color: colors.muted, fontFamily: fonts.semibold },
  tabTextActive: { color: colors.white },
  list: { paddingHorizontal: 18, paddingTop: 14, gap: 10 },
  card: {
    flexDirection: 'row',
    gap: 11,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 10,
    ...shadows.card,
  },
  thumb: { borderRadius: radius.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  meta: { fontSize: 10.5, marginTop: 2 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  id: { fontSize: 10, letterSpacing: 0.5 },
  value: { fontSize: 13.5 },
  note: { flexDirection: 'row', gap: 7, marginHorizontal: 18, marginTop: 16, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: 10.5, lineHeight: 13, color: colors.muted },
});
