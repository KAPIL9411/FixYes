import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button } from '../ui/core';
import { colors, radius, shadows } from '../theme';
import { BrandLogoImage } from '../components/Brand';
import { CategoryGlyph } from '../ui/CategoryGlyph';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const heroHeight = Math.max(340, Math.min(540, height * 0.54));

  const start = () => router.push('/signin');

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={[styles.hero, { height: heroHeight }]}>
          <LinearGradient
            colors={[colors.primaryDeep, colors.primary]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroOrbLarge} />
          <View style={styles.heroOrbSmall} />

          <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
            <BrandLogoImage size={27} light />
            <Pressable accessibilityRole="button" style={styles.skip} onPress={start} hitSlop={8}>
              <AppText variant="small" style={styles.skipText}>
                Sign in
              </AppText>
            </Pressable>
          </View>

          <View style={styles.heroArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.artTile}><CategoryGlyph code="ac-cooling" size={52} /></View>
            <View style={[styles.artTile, styles.artTileRaised]}><CategoryGlyph code="electrical" size={52} /></View>
            <View style={styles.artTile}><CategoryGlyph code="plumbing" size={52} /></View>
          </View>

          <View style={styles.heroCopy}>
            <View style={styles.heroPill}>
              <Ionicons name="shield-checkmark" size={12} color={colors.amber} />
              <AppText variant="caption" style={styles.heroPillText}>
                VERIFIED HOME PROS
              </AppText>
            </View>
            <AppText variant="display" style={styles.heroTitle}>
              Your home,{'\n'}handled.
            </AppText>
            <AppText variant="body" style={styles.heroBody}>
              AC, plumbing, cleaning and more — booked in a few taps.
            </AppText>
          </View>
        </View>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 22) }]}>
          <View style={styles.handle} />
          <AppText variant="h1" style={styles.title}>
            Home fixes, sorted.
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            One app for every home service in Bareilly. Upfront prices, verified partners and live
            tracking from booking to done.
          </AppText>

          <View style={styles.features}>
            {[
              { icon: 'pricetag-outline', label: 'Upfront pricing' },
              { icon: 'navigate-outline', label: 'Live tracking' },
              { icon: 'shield-checkmark-outline', label: 'Verified pros' },
            ].map((feature) => (
              <View key={feature.label} style={styles.feature}>
                <Ionicons
                  name={feature.icon as keyof typeof Ionicons.glyphMap}
                  size={14}
                  color={colors.primary}
                />
                <AppText variant="small" style={styles.featureText}>
                  {feature.label}
                </AppText>
              </View>
            ))}
          </View>

          <Button
            label="Continue with Google"
            icon="logo-google"
            onPress={start}
            size="lg"
          />
          <AppText variant="small" style={styles.terms}>
            By continuing you agree to Fixyes’ service terms and privacy policy.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flexGrow: 1, backgroundColor: colors.canvas },
  hero: { minHeight: 340, backgroundColor: colors.primaryDeep, overflow: 'hidden' },
  heroOrbLarge: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    right: -120,
    top: -90,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroOrbSmall: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    left: -68,
    bottom: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skip: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { color: colors.white, fontSize: 11 },
  heroArt: {
    position: 'absolute',
    top: '31%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  artTile: { opacity: 0.96 },
  artTileRaised: { transform: [{ translateY: -14 }] },
  heroCopy: { position: 'absolute', left: 22, right: 22, bottom: 54 },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(11,33,80,0.32)',
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 10,
  },
  heroPillText: { color: colors.amber, fontSize: 10, letterSpacing: 1.1 },
  heroTitle: { color: colors.white, fontSize: 38, lineHeight: 42, letterSpacing: -1.6 },
  heroBody: { color: 'rgba(255,255,255,0.78)', fontSize: 12.5, lineHeight: 18, marginTop: 8, maxWidth: 280 },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -30,
    paddingHorizontal: 22,
    paddingTop: 12,
    ...shadows.float,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 16,
  },
  title: { fontSize: 27, letterSpacing: -0.9 },
  subtitle: { marginTop: 7, fontSize: 12.5, lineHeight: 19, color: colors.muted },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, marginBottom: 18 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.line,
  },
  featureText: { fontSize: 10, color: colors.inkSoft },
  terms: { textAlign: 'center', fontSize: 10.5, lineHeight: 13, color: colors.faint, marginTop: 12 },
});
