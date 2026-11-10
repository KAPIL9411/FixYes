import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCategories, useItems } from '../../hooks/data';
import { AppText } from '../../ui/core';
import { colors, radius } from '../../theme';
import { CategoryArtwork } from '../../ui/CategoryGlyph';
import { inr } from '../../lib/format';

const FAQS = [
  {
    q: 'Who will come to my home?',
    a: 'A Fixyes partner assigned to this job. Their name and job status appear in your booking once assigned.',
  },
  {
    q: 'Are parts and materials included?',
    a: 'Parts and extra material are not included in the service price. Your partner quotes them with you before starting any additional work.',
  },
  {
    q: 'When do I pay?',
    a: 'Pay the partner directly after the service is completed. Fixyes does not collect an online payment in the app.',
  },
];

export default function ServiceDetailScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const items = useItems();
  const categories = useCategories();
  const item = items.data?.find((entry) => entry.id === itemId);
  const category = categories.data?.find((entry) => entry.id === item?.categoryId);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 132 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <CategoryArtwork code={category?.code} height={260} style={styles.heroImage} />
          <View style={[styles.heroActions, { top: insets.top + 8 }]}>
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.circleButton} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={20} color={colors.ink} />
            </Pressable>
            <View style={styles.heroRight}>
              <Pressable
                style={styles.circleButton}
                accessibilityRole="button"
                accessibilityLabel="Share service"
                onPress={() =>
                  void Share.share({
                    message: `${item?.name ?? 'Home service'} on Fixyes — ${inr(item?.basePrice)}. Book verified pros in Bareilly.`,
                  })
                }
              >
                <Ionicons name="share-social-outline" size={18} color={colors.ink} />
              </Pressable>
            </View>
          </View>
          <View style={styles.heroBadge}>
            <Ionicons name="shield-checkmark" size={13} color={colors.success} />
            <AppText variant="caption" style={styles.heroBadgeText}>
              VERIFIED PROS ONLY
            </AppText>
          </View>
        </View>

        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" style={styles.eyebrow}>
                {(category?.name ?? 'HOME SERVICE').toUpperCase()}
              </AppText>
              <AppText variant="h1" style={styles.title}>
                {item?.name ?? 'Service details'}
              </AppText>
            </View>
          </View>
          <AppText variant="body" style={styles.description}>
            {item?.description ?? 'A verified Fixyes partner will arrive at your chosen slot with the right tools.'}
          </AppText>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Ionicons name="pricetag-outline" size={18} color={colors.primary} />
              <AppText variant="h3" style={styles.statValue}>
                {inr(item?.basePrice)}
              </AppText>
              <AppText variant="small" style={styles.statLabel}>
                Upfront price
              </AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.success} />
              <AppText variant="h3" style={styles.statValue}>
                Verified
              </AppText>
              <AppText variant="small" style={styles.statLabel}>
                Reviewed pro
              </AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Ionicons name="cash-outline" size={18} color={colors.amberDeep} />
              <AppText variant="h3" style={styles.statValue}>
                After service
              </AppText>
              <AppText variant="small" style={styles.statLabel}>
                Pay the partner
              </AppText>
            </View>
          </View>

          <View style={styles.card}>
            <AppText variant="h2" style={styles.cardTitle}>
              How it works
            </AppText>
            <View style={styles.includes}>
              {[
                { icon: 'calendar-outline' as const, title: 'Choose a slot', body: 'Book now or pick a later arrival window.' },
                { icon: 'navigate-outline' as const, title: 'Track your partner', body: 'Follow the visit from assignment to arrival.' },
                { icon: 'checkmark-circle-outline' as const, title: 'Confirm and pay', body: 'Check the work, then pay the partner directly.' },
              ].map((step) => (
                <View key={step.title} style={styles.include}>
                  <View style={styles.check}>
                    <Ionicons name={step.icon} size={13} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3" style={styles.stepTitle}>
                      {step.title}
                    </AppText>
                    <AppText variant="small" style={styles.stepBody}>
                      {step.body}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.chargeNote}>
              <Ionicons name="information-circle-outline" size={15} color={colors.primary} />
              <AppText variant="small" style={styles.chargeText}>
                Parts and extra material are quoted with you before any additional work starts.
              </AppText>
            </View>
          </View>

          <View style={styles.assurance}>
            <View style={styles.assuranceIcon}>
              <Ionicons name="shield-checkmark" size={21} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h3">The Fixyes promise</AppText>
              <AppText variant="small" style={styles.assuranceBody}>
                Reviewed partners, tracked visits and support if anything goes wrong. Pay after the
                job is done.
              </AppText>
            </View>
          </View>

          <View style={styles.card}>
            <AppText variant="h2" style={styles.cardTitle}>
              Common questions
            </AppText>
            <View style={styles.faqs}>
              {FAQS.map((faq, index) => {
                const open = openFaq === index;
                return (
                  <View key={faq.q} style={styles.faq}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      onPress={() => setOpenFaq(open ? null : index)}
                      style={styles.faqQuestion}
                    >
                      <AppText variant="h3" style={styles.faqText}>
                        {faq.q}
                      </AppText>
                      <Ionicons name={open ? 'remove' : 'add'} size={17} color={colors.muted} />
                    </Pressable>
                    {open ? (
                      <AppText variant="small" style={styles.faqAnswer}>
                        {faq.a}
                      </AppText>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View>
          <AppText variant="small" style={styles.from}>
            TOTAL FROM
          </AppText>
          <AppText variant="price" style={styles.price}>
            {inr(item?.basePrice)}
          </AppText>
        </View>
        <Pressable accessibilityRole="button"
          onPress={() => router.push({ pathname: '/book/[itemId]', params: { itemId: itemId as string } })}
          style={({ pressed }) => [styles.book, pressed && { opacity: 0.88 }]}
          disabled={!item}
        >
          <AppText variant="button">Book now</AppText>
          <Ionicons name="arrow-forward" size={17} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: { height: 260, backgroundColor: colors.primarySoft },
  heroImage: { borderRadius: 0 },
  heroActions: {
    position: 'absolute',
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroRight: { flexDirection: 'row', gap: 8 },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    left: 18,
    bottom: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  heroBadgeText: { fontSize: 10, color: colors.ink, letterSpacing: 1 },
  sheet: {
    marginTop: -24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.canvas,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 16,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  eyebrow: { fontSize: 10, letterSpacing: 1.3, color: colors.primary },
  title: { fontSize: 27, lineHeight: 33, marginTop: 3 },
  description: { marginTop: 9, fontSize: 12.5, lineHeight: 19, color: colors.muted },
  stats: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 15,
    marginTop: 20,
    alignItems: 'center',
  },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 3 },
  statDivider: { width: 1, height: 34, backgroundColor: colors.line },
  statValue: { fontSize: 12.5 },
  statLabel: { fontSize: 10.5, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 18,
    marginTop: 14,
  },
  cardTitle: { fontSize: 16, marginBottom: 13 },
  includes: { gap: 11 },
  include: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  includeText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  stepTitle: { fontSize: 13.5 },
  stepBody: { fontSize: 11, lineHeight: 16, marginTop: 1 },
  assurance: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 14,
  },
  assuranceIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assuranceBody: { marginTop: 3, fontSize: 10.5, lineHeight: 15, color: colors.inkSoft },
  chargeNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: colors.line },
  chargeText: { flex: 1, fontSize: 11, lineHeight: 14 },
  faqs: { gap: 0 },
  faq: { borderTopWidth: 1, borderTopColor: colors.line },
  faqQuestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  faqText: { flex: 1, fontSize: 12.5 },
  faqAnswer: { paddingBottom: 12, marginTop: -3, lineHeight: 17, fontSize: 10.5 },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  from: { fontSize: 10, letterSpacing: 1.2 },
  price: { fontSize: 22 },
  book: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
