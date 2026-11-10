import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth';
import {
  useAddresses,
  useBookings,
  useCategories,
  useCities,
  useItems,
  usePartnerProfile,
} from '../../hooks/data';
import { formatDate, initials, inr, isActiveStatus, STATUS_COPY, timeOfDay } from '../../lib/format';
import { AppText, Button, IconButton, Pill, SearchBar, SectionHeader, Skeleton, TAB_BAR_SPACE } from '../../ui/core';
import { ServiceTile } from '../../ui/ServiceTile';
import { BrandLockup } from '../../components/Brand';
import { CategoryCard } from '../../components/CategoryCard';
import { AppModeSwitch, type AppMode } from '../../components/AppModeSwitch';
import { CategoryGlyph } from '../../ui/CategoryGlyph';
import { colors, fonts, radius, shadows } from '../../theme';
import { useWorkMode } from '../../work-mode';
import { PartnerHome } from '../../features/partner/PartnerHome';

const PROMISES = [
  { icon: 'shield-checkmark-outline' as const, title: 'Verified', body: 'Reviewed pros' },
  { icon: 'pricetag-outline' as const, title: 'Upfront', body: 'Clear job price' },
  { icon: 'navigate-outline' as const, title: 'Tracked', body: 'Every step' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { mode, setMode } = useWorkMode();
  const partner = usePartnerProfile();
  const categories = useCategories();
  const items = useItems();
  const bookings = useBookings();
  const addresses = useAddresses();
  const cities = useCities();

  const isPartnerMode = mode === 'partner' && partner.data?.status === 'APPROVED';

  const activeBooking = useMemo(
    () => bookings.data?.find((booking) => isActiveStatus(booking.status)),
    [bookings.data],
  );
  const recent = useMemo(
    () => (bookings.data ?? []).filter((booking) => !isActiveStatus(booking.status)).slice(0, 2),
    [bookings.data],
  );
  const popular = useMemo(() => (items.data ?? []).slice(0, 6), [items.data]);

  const pros = useMemo(() => {
    const map = new Map<string, { name: string; jobs: number; lastBookingId: string }>();
    (bookings.data ?? [])
      .filter((booking) => booking.status === 'COMPLETED' && Boolean(booking.partnerDisplayName))
      .forEach((booking) => {
        const name = booking.partnerDisplayName!;
        const entry = map.get(name);
        map.set(name, {
          name,
          jobs: (entry?.jobs ?? 0) + 1,
          lastBookingId: entry?.lastBookingId ?? booking.id,
        });
      });
    return [...map.values()].slice(0, 4);
  }, [bookings.data]);

  const firstName = (user?.displayName ?? 'there').split(' ')[0];
  const categoryFor = (id: string) => categories.data?.find((category) => category.id === id);
  const primaryAddress = addresses.data?.[0];
  const primaryCity = cities.data?.find((city) => city.enabled);
  const cityLabel = primaryAddress
    ? `${primaryAddress.city}, ${primaryAddress.state}`
    : primaryCity
      ? `${primaryCity.name}, ${primaryCity.state}`
      : 'Set your service location';

  const switchRole = (next: AppMode) => {
    if (next === 'partner' && partner.data?.status !== 'APPROVED') {
      router.push('/become-partner');
      return;
    }
    setMode(next);
  };

  if (isPartnerMode) return <PartnerHome />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={bookings.isRefetching || categories.isRefetching}
            onRefresh={() => {
              void bookings.refetch();
              void categories.refetch();
              void items.refetch();
              void addresses.refetch();
              void cities.refetch();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroCircleLarge} />
          <View style={styles.heroCircleSmall} />

          <View style={styles.topBar}>
            <BrandLockup light />
            <View style={styles.topActions}>
              <IconButton
                icon="notifications-outline"
                accessibilityLabel="Notifications"
                onPress={() => router.push('/notifications')}
                style={styles.heroIcon}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                onPress={() => router.push('/profile')}
                style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
              >
                <AppText variant="h3" style={styles.avatarText}>
                  {firstName.slice(0, 1).toUpperCase()}
                </AppText>
              </Pressable>
            </View>
          </View>

          <View style={styles.roleWrap}>
            <AppModeSwitch
              tone="onPrimary"
              value={isPartnerMode ? 'partner' : 'customer'}
              onChange={switchRole}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Service location, ${cityLabel}`}
            onPress={() => router.push('/addresses')}
            style={({ pressed }) => [styles.location, pressed && styles.pressed]}
          >
            <View style={styles.locationPin}>
              <Ionicons name="location" size={12} color={colors.primary} />
            </View>
            <View style={styles.locationCopy}>
              <AppText variant="caption" style={styles.locationLabel}>
                SERVICE LOCATION
              </AppText>
              <AppText variant="small" style={styles.locationText} numberOfLines={1}>
                {cityLabel}
              </AppText>
            </View>
            <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.72)" />
          </Pressable>

          <View style={styles.greeting}>
            <AppText variant="small" style={styles.hello}>
              Good {timeOfDay()}, {firstName}
            </AppText>
            <AppText variant="h1" style={styles.headline}>
              What needs fixing today?
            </AppText>
          </View>

          <SearchBar
            placeholder="Search AC repair, cleaning, plumbing"
            onPress={() => router.push('/search')}
          />

          {activeBooking ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Track ${activeBooking.serviceItemName ?? 'active booking'}`}
              onPress={() =>
                router.push({ pathname: '/bookings/[bookingId]', params: { bookingId: activeBooking.id } })
              }
              style={({ pressed }) => [styles.activeCard, pressed && styles.pressed]}
            >
              <View style={styles.activeTop}>
                <View style={styles.activePill}>
                  <View style={styles.activeDot} />
                  <AppText variant="caption" style={styles.activePillText}>
                    ACTIVE BOOKING
                  </AppText>
                </View>
                <AppText variant="small" style={styles.activeStatus}>
                  {STATUS_COPY[activeBooking.status]}
                </AppText>
              </View>
              <View style={styles.activeMain}>
                <CategoryGlyph code={activeBooking.categoryCode} size={52} />
                <View style={styles.activeCopy}>
                  <AppText variant="h3" numberOfLines={1} style={styles.activeTitle}>
                    {activeBooking.serviceItemName ?? 'Home service'}
                  </AppText>
                  <AppText variant="small" numberOfLines={1} style={styles.activePartner}>
                    {activeBooking.partnerDisplayName ?? 'Matching you with a verified partner'}
                  </AppText>
                  <View style={styles.trackRow}>
                    <AppText variant="small" style={styles.trackText}>
                      Track booking
                    </AppText>
                    <Ionicons name="arrow-forward" size={14} color={colors.white} />
                  </View>
                </View>
              </View>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionHeader title="What do you need?" action="See all" onAction={() => router.push('/search')} />
          <View style={styles.categoryGrid}>
            {(categories.data ?? []).slice(0, 8).map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                width="24%"
                onPress={() =>
                  router.push({ pathname: '/category/[categoryId]', params: { categoryId: category.id } })
                }
              />
            ))}
            {categories.isLoading
              ? [1, 2, 3, 4].map((key) => (
                  <View key={key} style={styles.categorySkeleton}>
                    <Skeleton height={56} width={56} radius={16} />
                    <Skeleton height={10} width={64} />
                  </View>
                ))
              : null}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Services for your home" action="View all" onAction={() => router.push('/search')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {popular.map((item) => {
              const category = categoryFor(item.categoryId);
              return (
                <ServiceTile
                  key={item.id}
                  name={item.name}
                  price={item.basePrice}
                  categoryCode={category?.code}
                  categoryName={category?.name}
                  width={184}
                  onPress={() =>
                    router.push({ pathname: '/service/[itemId]', params: { itemId: item.id } })
                  }
                />
              );
            })}
            {items.isLoading
              ? [1, 2].map((key) => <Skeleton key={key} height={238} width={184} radius={18} />)
              : null}
          </ScrollView>
        </View>

        {pros.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Your pros" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.proRail}>
              {pros.map((pro) => (
                <Pressable
                  key={pro.name}
                  accessibilityRole="button"
                  accessibilityLabel={`${pro.name}, ${pro.jobs} previous bookings`}
                  onPress={() =>
                    router.push({ pathname: '/bookings/[bookingId]', params: { bookingId: pro.lastBookingId } })
                  }
                  style={({ pressed }) => [styles.proCard, pressed && styles.pressed]}
                >
                  <View style={styles.proAvatar}>
                    <AppText variant="h3" style={styles.proInitials}>
                      {initials(pro.name)}
                    </AppText>
                  </View>
                  <View style={styles.proCopy}>
                    <AppText variant="h3" numberOfLines={1}>
                      {pro.name}
                    </AppText>
                    <AppText variant="small" style={styles.proMeta}>
                      {pro.jobs} completed {pro.jobs === 1 ? 'visit' : 'visits'}
                    </AppText>
                  </View>
                  <View style={styles.proVerified}>
                    <Ionicons name="shield-checkmark" size={12} color={colors.success} />
                    <AppText variant="caption" style={styles.proVerifiedText}>
                      VERIFIED
                    </AppText>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.promiseCard}>
          {PROMISES.map((item, index) => (
            <View key={item.title} style={[styles.promise, index > 0 && styles.promiseBorder]}>
              <View style={styles.promiseIcon}>
                <Ionicons name={item.icon} size={18} color={colors.primary} />
              </View>
              <AppText variant="h3" style={styles.promiseTitle}>
                {item.title}
              </AppText>
              <AppText variant="small" style={styles.promiseBody}>
                {item.body}
              </AppText>
            </View>
          ))}
        </View>

        {recent.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Recent bookings" action="All bookings" onAction={() => router.push('/bookings')} />
            <View style={styles.recentList}>
              {recent.map((booking) => (
                <Pressable
                  key={booking.id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: '/bookings/[bookingId]', params: { bookingId: booking.id } })
                  }
                  style={({ pressed }) => [styles.recentCard, pressed && styles.pressed]}
                >
                  <CategoryGlyph code={booking.categoryCode} size={54} />
                  <View style={styles.recentBody}>
                    <AppText variant="h3" numberOfLines={1}>
                      {booking.serviceItemName ?? 'Home service'}
                    </AppText>
                    <AppText variant="small" style={styles.recentMeta} numberOfLines={1}>
                      {formatDate(booking.createdAt)} · {inr(booking.quotedTotal)}
                    </AppText>
                    <Pill
                      label={STATUS_COPY[booking.status].toUpperCase()}
                      tone={booking.status === 'COMPLETED' ? 'success' : 'neutral'}
                      style={{ marginTop: 5 }}
                    />
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.faint} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.providerStrip}>
          <View style={styles.providerIcon}>
            <Ionicons name="briefcase-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="h3">Earn with Fixyes</AppText>
            <AppText variant="small" style={styles.providerBody}>
              Local jobs. Your schedule. One account.
            </AppText>
          </View>
          <Button
            label="Explore"
            size="sm"
            variant="soft"
            full={false}
            onPress={() => router.push('/become-partner')}
          />
        </View>

        <View style={{ height: TAB_BAR_SPACE }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 18, paddingTop: 4 },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.xxl,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    overflow: 'hidden',
    ...shadows.float,
  },
  heroCircleLarge: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    right: -92,
    top: -108,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroCircleSmall: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    left: -46,
    bottom: -58,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroIcon: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontSize: 15 },
  pressed: { opacity: 0.72 },
  roleWrap: { marginTop: 14 },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 13,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.md,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  locationPin: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationCopy: { gap: 1, flex: 1 },
  locationLabel: { fontSize: 8.5, letterSpacing: 0.9, color: 'rgba(255,255,255,0.62)' },
  locationText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white, lineHeight: 15 },
  greeting: { marginTop: 18, marginBottom: 14 },
  headline: { fontSize: 27, lineHeight: 32, letterSpacing: -0.8, color: colors.white },
  hello: { marginBottom: 3, fontSize: 11.5, color: 'rgba(255,255,255,0.72)' },
  activeCard: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.lg,
    padding: 12,
    overflow: 'hidden',
  },
  activeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.amber },
  activePillText: { color: colors.white, fontSize: 10, letterSpacing: 0.9 },
  activeStatus: { color: 'rgba(255,255,255,0.7)', fontSize: 10.5 },
  activeMain: { flexDirection: 'row', gap: 11, alignItems: 'center', marginTop: 10 },
  activeCopy: { flex: 1, gap: 2 },
  activeTitle: { color: colors.white, fontSize: 15 },
  activePartner: { color: 'rgba(255,255,255,0.72)', fontSize: 10.5 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  trackText: { color: colors.white, fontFamily: fonts.semibold, fontSize: 10.5 },
  section: { marginTop: 24 },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
    justifyContent: 'space-between',
  },
  categorySkeleton: { width: '24%', alignItems: 'center', gap: 7 },
  rail: { gap: 12, paddingRight: 18 },
  proRail: { gap: 10, paddingRight: 18 },
  proCard: {
    width: 224,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 11,
    ...shadows.card,
  },
  proAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proInitials: { color: colors.primary, fontSize: 12 },
  proCopy: { flex: 1 },
  proMeta: { fontSize: 11, marginTop: 1 },
  proVerified: { alignItems: 'center', gap: 2 },
  proVerifiedText: { fontSize: 9, color: colors.success },
  promiseCard: {
    marginTop: 24,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
  },
  promise: { flex: 1, alignItems: 'center', paddingHorizontal: 6, gap: 3 },
  promiseBorder: { borderLeftWidth: 1, borderLeftColor: colors.line },
  promiseIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  promiseTitle: { fontSize: 12 },
  promiseBody: { fontSize: 11, textAlign: 'center', lineHeight: 13 },
  recentList: { gap: 10 },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  recentBody: { flex: 1 },
  recentMeta: { marginTop: 2, fontSize: 10.5 },
  providerStrip: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryGhost,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  providerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerBody: { marginTop: 2, fontSize: 10.5 },
});
