import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useCities, usePartnerZones, useZones, qk } from '../../hooks/data';
import { AppText, Button, IconButton, Pill } from '../../ui/core';
import { AppHeader } from '../../components/AppHeader';
import { colors, fonts, radius, shadows } from '../../theme';
import { errorMessage } from '../../lib/errors';

export default function PartnerZonesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const cities = useCities();
  const partnerZones = usePartnerZones();
  const city = cities.data?.[0];
  const zones = useZones(city?.id);
  const [editedZones, setEditedZones] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = editedZones ?? partnerZones.data ?? [];

  const toggle = (id: string) => {
    setEditedZones(
      selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id],
    );
  };

  const save = async () => {
    setError('');
    if (selected.length === 0) {
      setError('Choose at least one zone to receive jobs.');
      return;
    }
    setBusy(true);
    try {
      await api.setPartnerZones(selected);
      await queryClient.invalidateQueries({ queryKey: qk.partnerZones });
      await queryClient.invalidateQueries({ queryKey: qk.availability });
      router.back();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader
        title="Service zones"
        right={
          <IconButton
            icon="checkmark"
            variant="violet"
            size={38}
            onPress={save}
            accessibilityLabel="Save zones"
          />
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="map" size={22} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="h2" style={styles.heroTitle}>
              Where do you work?
            </AppText>
            <AppText variant="small" style={styles.heroBody}>
              You’ll only get job offers inside the zones you select.
            </AppText>
          </View>
          <Pill label={`${selected.length} SELECTED`} tone="amber" />
        </View>

        <View style={styles.cityCard}>
          <View style={styles.cityIcon}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" style={styles.cityLabel}>
              SERVICE CITY
            </AppText>
            <AppText variant="h3">{city ? `${city.name}, ${city.state}` : 'Bareilly'}</AppText>
          </View>
          <Pill label="CITY FIXED" tone="neutral" />
        </View>

        <View style={styles.listHead}>
          <AppText variant="h2">Choose your zones</AppText>
          <AppText variant="small">Tap to add or remove</AppText>
        </View>

        <View style={styles.list}>
          {(zones.data ?? []).map((zone) => {
            const active = selected.includes(zone.id);
            return (
              <Pressable accessibilityRole="button"
                key={zone.id}
                onPress={() => toggle(zone.id)}
                style={({ pressed }) => [styles.zone, active && styles.zoneActive, pressed && { opacity: 0.8 }]}
              >
                <View style={[styles.zoneIcon, active && styles.zoneIconActive]}>
                  <Ionicons
                    name={active ? 'checkmark' : 'navigate-outline'}
                    size={17}
                    color={active ? colors.white : colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h3">{zone.name}</AppText>
                  <AppText variant="small" style={styles.zoneBody}>
                    {active ? 'Receiving job offers here' : 'Not receiving jobs here'}
                  </AppText>
                </View>
                <View style={[styles.switch, active && styles.switchActive]}>
                  <View style={[styles.thumb, active && styles.thumbActive]} />
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <AppText variant="small" style={styles.noteText}>
            More zones means more requests. You can change this at any time, even while online.
          </AppText>
        </View>
        {error ? <AppText variant="small" style={styles.error}>{error}</AppText> : null}
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button
          label={`Save ${selected.length} zone${selected.length === 1 ? '' : 's'}`}
          icon="checkmark-circle-outline"
          onPress={save}
          loading={busy}
          disabled={selected.length === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: {
    marginHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: 17,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { color: colors.white, fontSize: 17 },
  heroBody: { color: 'rgba(255,255,255,0.55)', fontSize: 11, lineHeight: 13, marginTop: 2, maxWidth: '92%' },
  cityCard: {
    marginHorizontal: 18,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 13,
  },
  cityIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityLabel: { fontSize: 9.5, letterSpacing: 1 },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginTop: 22,
    marginBottom: 11,
  },
  list: { paddingHorizontal: 18, gap: 9 },
  zone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 13,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.card,
  },
  zoneActive: { borderColor: colors.primary, backgroundColor: colors.primaryGhost },
  zoneIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneIconActive: { backgroundColor: colors.primary },
  zoneBody: { marginTop: 2, fontSize: 11 },
  switch: {
    width: 42,
    height: 25,
    borderRadius: 13,
    backgroundColor: colors.line,
    padding: 3,
    justifyContent: 'center',
  },
  switchActive: { backgroundColor: colors.primary },
  thumb: { width: 19, height: 19, borderRadius: 10, backgroundColor: colors.white },
  thumbActive: { alignSelf: 'flex-end' },
  note: {
    margin: 18,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 12,
  },
  noteText: { flex: 1, fontSize: 10, lineHeight: 14, color: colors.inkSoft },
  error: { color: colors.danger, fontFamily: fonts.medium, fontSize: 10.5, paddingHorizontal: 18 },
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
