import { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useCategories, useCities, usePartnerProfile, qk } from '../../hooks/data';
import { AppText, Button, Field, Pill } from '../../ui/core';
import { AppHeader } from '../../components/AppHeader';
import { colors, radius, shadows } from '../../theme';
import { errorMessage } from '../../lib/errors';
import { CATEGORY_ICON, categoryTint } from '../../lib/catalogueVisuals';

export default function PartnerOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const categories = useCategories();
  const cities = useCities();
  const partner = usePartnerProfile();
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (partner.data && partner.data.status !== 'DRAFT' && partner.data.status !== 'REJECTED') {
      router.replace('/become-partner');
    }
  }, [partner.data, router]);

  const city = cities.data?.[0];

  const toggle = (code: string) => {
    setSkills((current) =>
      current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code].slice(0, 10),
    );
  };

  const submit = async () => {
    setError('');
    if (!city) {
      setError('Service city is not available right now.');
      return;
    }
    if (skills.length === 0) {
      setError('Choose at least one skill.');
      return;
    }
    setBusy(true);
    try {
      await api.onboardPartner({ serviceCityId: city.id, bio: bio.trim() || undefined, skills });
      await queryClient.invalidateQueries({ queryKey: qk.partner });
      await refresh();
      router.replace('/become-partner');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Become a partner" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#2457E6', '#1745C8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroRing} />
          <Pill label="EARN WITH FIXYES" tone="amber" icon="briefcase-outline" />
          <AppText variant="h1" style={styles.heroTitle}>
            Put your skills{'\n'}to work.
          </AppText>
          <AppText variant="small" style={styles.heroBody}>
            Get local jobs, keep your own schedule and get paid after every completed service.
          </AppText>
          <View style={styles.heroStats}>
            <View>
              <AppText variant="h3" style={styles.heroStatValue}>
                {city?.name ?? 'Bareilly'}
              </AppText>
              <AppText variant="caption" style={styles.heroStatLabel}>
                SERVICE CITY
              </AppText>
            </View>
            <View style={styles.heroDivider} />
            <View>
              <AppText variant="h3" style={styles.heroStatValue}>
                Own schedule
              </AppText>
              <AppText variant="caption" style={styles.heroStatLabel}>
                GO ONLINE WHEN YOU WANT
              </AppText>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.stepHead}>
            <View style={styles.stepDot}>
              <AppText variant="caption" style={styles.stepNumber}>
                1
              </AppText>
            </View>
            <View>
              <AppText variant="h2">What can you fix?</AppText>
              <AppText variant="small">Choose every service you are qualified for.</AppText>
            </View>
          </View>

          <View style={styles.skillGrid}>
            {(categories.data ?? []).map((category) => {
              const active = skills.includes(category.code);
              const tint = categoryTint(category.code);
              return (
                <Pressable accessibilityRole="button"
                  key={category.id}
                  onPress={() => toggle(category.code)}
                  style={[styles.skill, active && styles.skillActive]}
                >
                  <View style={[styles.skillIcon, { backgroundColor: active ? colors.primary : tint.bg }]}>
                    <Ionicons
                      name={CATEGORY_ICON[category.code] ?? 'construct-outline'}
                      size={20}
                      color={active ? colors.white : tint.fg}
                    />
                  </View>
                  <AppText variant="small" style={[styles.skillLabel, active && { color: colors.ink }]}>
                    {category.name}
                  </AppText>
                  <View style={[styles.check, active && styles.checkActive]}>
                    {active ? <Ionicons name="checkmark" size={11} color={colors.white} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.stepHead}>
            <View style={styles.stepDot}>
              <AppText variant="caption" style={styles.stepNumber}>
                2
              </AppText>
            </View>
            <View>
              <AppText variant="h2">About you</AppText>
              <AppText variant="small">Optional, but customers like to know who is coming.</AppText>
            </View>
          </View>
          <Field
            label="SHORT BIO (OPTIONAL)"
            value={bio}
            onChangeText={setBio}
            placeholder="e.g. 6 years of AC and appliance repair experience in Bareilly."
            multiline
            maxLength={1000}
          />

          <View style={styles.note}>
            <Ionicons name="shield-checkmark-outline" size={17} color={colors.primary} />
            <AppText variant="small" style={styles.noteText}>
              Our team reviews every application. You will get job offers only after approval.
            </AppText>
          </View>

          {error ? <AppText variant="small" style={styles.error}>{error}</AppText> : null}
        </View>
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button
          label={skills.length ? `Apply with ${skills.length} skill${skills.length > 1 ? 's' : ''}` : 'Apply to partner'}
          icon="arrow-forward"
          onPress={submit}
          loading={busy}
          disabled={skills.length === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: {
    marginHorizontal: 18,
    borderRadius: radius.xl,
    padding: 20,
    overflow: 'hidden',
  },
  heroRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    right: -80,
    top: -70,
  },
  heroTitle: { color: colors.white, fontSize: 28, lineHeight: 33, marginTop: 12 },
  heroBody: { color: 'rgba(255,255,255,0.74)', fontSize: 11, lineHeight: 16, marginTop: 6 },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 20 },
  heroStatValue: { color: colors.white, fontSize: 13 },
  heroStatLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 9, letterSpacing: 0.9, marginTop: 2 },
  heroDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.18)' },
  body: { paddingHorizontal: 18, paddingTop: 24 },
  stepHead: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 14 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { color: colors.white, fontSize: 10.5 },
  skillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 26 },
  skill: {
    width: '48.2%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  skillActive: { borderColor: colors.primary, backgroundColor: colors.primaryGhost },
  skillIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillLabel: { flex: 1, fontSize: 10.5, color: colors.muted },
  check: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  note: {
    flexDirection: 'row',
    gap: 9,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 13,
    alignItems: 'flex-start',
  },
  noteText: { flex: 1, fontSize: 10, lineHeight: 15, color: colors.inkSoft },
  error: { color: colors.danger, marginTop: 12 },
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
    ...shadows.float,
  },
});
