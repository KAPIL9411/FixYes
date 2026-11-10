import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCategories, useItems } from '../../hooks/data';
import { CATEGORY_BLURB } from '../../data/catalogue';
import { AppText, EmptyState, ErrorState, Pill, Skeleton, TAB_BAR_SPACE } from '../../ui/core';
import { ServiceTile } from '../../ui/ServiceTile';
import { AppHeader } from '../../components/AppHeader';
import { CATEGORY_ICON, categoryTint } from '../../lib/catalogueVisuals';
import { CategoryArtwork } from '../../ui/CategoryGlyph';
import { colors, fonts, radius } from '../../theme';
import { errorMessage } from '../../lib/errors';

export default function CategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const router = useRouter();
  const categories = useCategories();
  const items = useItems(categoryId);
  const category = categories.data?.find((entry) => entry.id === categoryId);
  const tint = categoryTint(category?.code);
  const blurb = category ? CATEGORY_BLURB[category.code] : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <AppHeader title={category?.name ?? 'Services'} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <CategoryArtwork code={category?.code} height={116} style={styles.introImage} />
          <View style={styles.introCopy}>
            <View style={[styles.icon, { backgroundColor: tint.bg }]}>
              <Ionicons
                name={CATEGORY_ICON[category?.code ?? ''] ?? 'construct-outline'}
                size={21}
                color={tint.fg}
              />
            </View>
            <AppText variant="h2" style={styles.title}>
              {category?.name ?? 'Home services'}
            </AppText>
            <AppText variant="small" style={styles.blurb} numberOfLines={2}>
              {blurb ?? 'Verified home services with clear, upfront prices.'}
            </AppText>
            <View style={styles.introMeta}>
              <Ionicons name="shield-checkmark" size={13} color={colors.success} />
              <AppText variant="small" style={styles.introMetaText} numberOfLines={1}>
                {items.data?.length ?? 0} services available
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.assurance}>
          {[
            { icon: 'pricetag-outline' as const, label: 'Upfront price' },
            { icon: 'time-outline' as const, label: 'Flexible slot' },
            { icon: 'cash-outline' as const, label: 'Pay after service' },
          ].map((item) => (
            <View key={item.label} style={styles.assuranceItem}>
              <Ionicons name={item.icon} size={16} color={colors.primary} />
              <AppText variant="small" style={styles.assuranceText}>
                {item.label}
              </AppText>
            </View>
          ))}
        </View>

        <View style={styles.listHead}>
          <AppText variant="h2">Choose a service</AppText>
          <Pill label={`${items.data?.length ?? 0} OPTIONS`} tone="violet" />
        </View>

        <View style={styles.list}>
          {items.isError ? (
            <ErrorState message={errorMessage(items.error)} onRetry={() => void items.refetch()} />
          ) : null}
          {(items.data ?? []).map((item) => (
            <ServiceTile
              key={item.id}
              variant="row"
              name={item.name}
              price={item.basePrice}
              categoryCode={category?.code}
              categoryName={category?.name}
              onPress={() =>
                router.push({ pathname: '/service/[itemId]', params: { itemId: item.id } })
              }
            />
          ))}
          {items.isLoading
            ? [1, 2, 3].map((key) => <Skeleton key={key} height={126} radius={16} />)
            : null}
          {!items.isLoading && !items.isError && items.data?.length === 0 ? (
            <EmptyState
              icon="construct-outline"
              title="No services here yet"
              body="This category does not have any bookable services right now."
              action="Browse all services"
              onAction={() => router.push('/search')}
            />
          ) : null}
        </View>
        <View style={{ height: TAB_BAR_SPACE }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 18, paddingTop: 4 },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  introImage: { width: 104, borderRadius: radius.md },
  introCopy: { flex: 1, gap: 3 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  title: { fontSize: 18 },
  blurb: { fontSize: 11, lineHeight: 16 },
  introMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  introMetaText: { flexShrink: 1, fontSize: 10, fontFamily: fonts.semibold },
  assurance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.primaryGhost,
  },
  assuranceItem: { flex: 1, alignItems: 'center', gap: 4 },
  assuranceText: { fontSize: 10.5, textAlign: 'center', lineHeight: 12 },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 12,
  },
  list: { gap: 10 },
});
