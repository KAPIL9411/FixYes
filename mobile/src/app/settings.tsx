import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth';
import { usePartnerProfile } from '../hooks/data';
import { useWorkMode } from '../work-mode';
import { AppText, Button, ListRow, Pill, TAB_BAR_SPACE } from '../ui/core';
import { AppHeader } from '../components/AppHeader';
import { colors, radius } from '../theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { mode, setMode } = useWorkMode();
  const partner = usePartnerProfile();
  const isApprovedPartner = partner.data?.status === 'APPROVED';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="caption" style={styles.sectionLabel}>
          ACCOUNT
        </AppText>
        <View style={styles.list}>
          <ListRow icon="person-outline" label="Signed in as" detail={user?.email ?? 'Signed in'} />
          <ListRow
            icon="shield-checkmark-outline"
            label="Account roles"
            detail={(user?.roles ?? ['CUSTOMER']).join(' · ')}
            right={<Pill label={mode === 'partner' ? 'PARTNER MODE' : 'CUSTOMER MODE'} tone="violet" />}
            last
          />
        </View>

        {isApprovedPartner ? (
          <>
            <AppText variant="caption" style={styles.sectionLabel}>
              WORK MODE
            </AppText>
            <View style={styles.modeCard}>
              <View style={styles.modeIcon}>
                <Ionicons name="swap-horizontal-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="h3">{mode === 'partner' ? 'Partner app' : 'Customer app'}</AppText>
                <AppText variant="small" style={styles.modeBody}>
                  {mode === 'partner'
                    ? 'Bottom navigation shows jobs and earnings.'
                    : 'Bottom navigation shows bookings and services.'}
                </AppText>
              </View>
              <Button
                label={mode === 'partner' ? 'Customer' : 'Partner'}
                size="sm"
                variant="soft"
                full={false}
                onPress={() => {
                  setMode(mode === 'partner' ? 'customer' : 'partner');
                  router.replace('/');
                }}
              />
            </View>
          </>
        ) : null}

        <AppText variant="caption" style={styles.sectionLabel}>
          APP
        </AppText>
        <View style={styles.list}>
          <ListRow
            icon="notifications-outline"
            label="Booking updates"
            detail="See status changes in the notification centre"
            onPress={() => router.push('/notifications')}
          />
          <ListRow
            icon="wallet-outline"
            label="Payment records"
            detail="Completed service amounts"
            onPress={() => router.push('/payments')}
          />
          <ListRow
            icon="help-circle-outline"
            label="Help & support"
            detail="FAQs and contact"
            onPress={() => router.push('/help')}
          />
          <ListRow
            icon="shield-checkmark-outline"
            label="Connection"
            detail="Encrypted connection to the Fixyes API"
            right={<Pill label="SECURE" tone="success" />}
            last
          />
        </View>

        <AppText variant="caption" style={styles.sectionLabel}>
          SESSION
        </AppText>
        <View style={styles.list}>
          <ListRow
            icon="log-out-outline"
            label="Sign out"
            detail="Sign back in with Google"
            danger
            last
            onPress={async () => {
              await signOut();
              router.replace('/welcome');
            }}
          />
        </View>

        <AppText variant="small" style={styles.version}>
          Fixyes 1.0 · Bareilly, Uttar Pradesh
        </AppText>
        <View style={{ height: TAB_BAR_SPACE }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  sectionLabel: { marginTop: 18, marginBottom: 8, fontSize: 10 },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
  },
  modeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBody: { fontSize: 10, marginTop: 2 },
  version: { textAlign: 'center', fontSize: 11, color: colors.faint, marginTop: 22 },
});
