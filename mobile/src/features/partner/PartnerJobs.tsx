import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOffers, usePartnerJobs, usePartnerProfile } from '../../hooks/data';
import { AppText, EmptyState, ErrorState, Pill, Skeleton, TAB_BAR_SPACE } from '../../ui/core';
import { colors, fonts, radius } from '../../theme';
import { isActiveStatus } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { JobCard } from '../../components/JobCard';
import { OfferCard } from './OfferCard';

type Tab = 'active' | 'requests' | 'completed';

export function PartnerJobs() {
  const router = useRouter();
  const profile = usePartnerProfile();
  const jobs = usePartnerJobs();
  const offers = useOffers(profile.data?.status === 'APPROVED');
  const [tab, setTab] = useState<Tab>('active');

  const active = useMemo(() => (jobs.data ?? []).filter((job) => isActiveStatus(job.status)), [jobs.data]);
  const completed = useMemo(() => (jobs.data ?? []).filter((job) => job.status === 'COMPLETED'), [jobs.data]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'active', label: 'Active', count: active.length },
    { id: 'requests', label: 'Requests', count: offers.data?.length ?? 0 },
    { id: 'completed', label: 'Completed', count: completed.length },
  ];

  const data = tab === 'active' ? active : tab === 'completed' ? completed : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <AppText variant="caption" style={styles.eyebrow}>
            PARTNER WORK
          </AppText>
          <AppText variant="h1" style={styles.title}>
            Jobs
          </AppText>
        </View>
        <Pill label={`${active.length} ACTIVE`} tone={active.length ? 'violet' : 'neutral'} />
      </View>

      <View style={styles.tabs}>
        {tabs.map((item) => {
          const selected = tab === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => setTab(item.id)}
              style={[styles.tab, selected && styles.tabActive]}
            >
              <AppText variant="small" style={[styles.tabLabel, selected && styles.tabLabelActive]}>
                {item.label}
              </AppText>
              <View style={[styles.count, selected && styles.countActive]}>
                <AppText variant="small" style={[styles.countText, selected && styles.countTextActive]}>
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
            refreshing={jobs.isRefetching || offers.isRefetching}
            onRefresh={() => {
              void jobs.refetch();
              void offers.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        {tab === 'requests' ? (
          offers.isError ? (
            <ErrorState message={errorMessage(offers.error)} onRetry={() => void offers.refetch()} />
          ) : (offers.data ?? []).length === 0 ? (
            <EmptyState
              icon="notifications-outline"
              title="No open requests"
              body="New nearby jobs will appear here while you are online."
            />
          ) : (
            <View style={styles.list}>
              {(offers.data ?? []).map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </View>
          )
        ) : jobs.isLoading ? (
          <View style={styles.list}>
            {[1, 2, 3].map((key) => (
              <Skeleton key={key} height={104} radius={16} />
            ))}
          </View>
        ) : jobs.isError ? (
          <ErrorState message={errorMessage(jobs.error)} onRetry={() => void jobs.refetch()} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={tab === 'active' ? 'briefcase-outline' : 'checkmark-done-outline'}
            title={tab === 'active' ? 'No active jobs' : 'No completed jobs yet'}
            body={
              tab === 'active'
                ? 'Accepted jobs appear here with their latest status.'
                : 'Completed visits will build your work history.'
            }
            action="View requests"
            onAction={() => setTab('requests')}
          />
        ) : (
          <View style={styles.list}>
            {data.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onPress={() =>
                  router.push({ pathname: '/partner/job/[jobId]', params: { jobId: job.id } })
                }
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
    gap: 5,
  },
  tabActive: { backgroundColor: colors.primarySoft },
  tabLabel: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 11.5 },
  tabLabelActive: { color: colors.primary },
  count: {
    minWidth: 17,
    height: 17,
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
