import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SUPPORT_EMAIL } from '../api';
import { AppText, Button, ListRow, TAB_BAR_SPACE } from '../ui/core';
import { AppHeader } from '../components/AppHeader';
import { colors, radius } from '../theme';

const FAQS = [
  {
    question: 'How does booking work?',
    answer:
      'Choose a service, select a saved address and pick a time. Fixyes assigns a verified partner and shows each status change in the booking.',
  },
  {
    question: 'When do I pay?',
    answer:
      'You pay the partner directly after the service is completed. Fixyes does not process cards, wallets or UPI in the app.',
  },
  {
    question: 'Can I cancel a booking?',
    answer:
      'Yes. Open the booking and cancel while it is active. Partner assignment and job status update automatically.',
  },
  {
    question: 'What if no partner is available?',
    answer:
      'The booking shows that no partner was found. You can book again for another slot or choose a different service.',
  },
  {
    question: 'How do I become a partner?',
    answer:
      'Open Partner from your profile, apply with your skills and service city, and wait for approval before going online.',
  },
];

export default function HelpScreen() {
  const [open, setOpen] = useState<number | null>(0);
  const supportAvailable = Boolean(SUPPORT_EMAIL);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="Help & support" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="chatbubbles-outline" size={22} color={colors.primary} />
          </View>
          <AppText variant="h2">How can we help?</AppText>
          <AppText variant="small" style={styles.heroBody}>
            Answers to common questions about bookings, payments and partner work.
          </AppText>
        </View>

        <AppText variant="caption" style={styles.sectionLabel}>
          FREQUENT QUESTIONS
        </AppText>
        <View style={styles.list}>
          {FAQS.map((faq, index) => {
            const expanded = open === index;
            return (
              <View key={faq.question} style={styles.faq}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => setOpen(expanded ? null : index)}
                  style={styles.questionRow}
                >
                  <AppText variant="h3" style={styles.question}>
                    {faq.question}
                  </AppText>
                  <Ionicons name={expanded ? 'remove' : 'add'} size={17} color={colors.muted} />
                </Pressable>
                {expanded ? (
                  <AppText variant="small" style={styles.answer}>
                    {faq.answer}
                  </AppText>
                ) : null}
              </View>
            );
          })}
        </View>

        <AppText variant="caption" style={styles.sectionLabel}>
          CONTACT
        </AppText>
        <View style={styles.list}>
          <ListRow
            icon="mail-outline"
            label="Email support"
            detail={supportAvailable ? SUPPORT_EMAIL : 'Support email is not configured in this build'}
            onPress={
              supportAvailable
                ? () => {
                    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
                  }
                : undefined
            }
            right={supportAvailable ? undefined : <View />}
            last
          />
        </View>

        <Button
          label={supportAvailable ? 'Email Fixyes support' : 'Support email unavailable'}
          icon="mail-outline"
          variant="soft"
          disabled={!supportAvailable}
          onPress={() => {
            if (supportAvailable) void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
          }}
          style={{ marginTop: 16 }}
        />
        <AppText variant="small" style={styles.finePrint}>
          Include your booking number when contacting support so the team can find the job quickly.
        </AppText>
        <View style={{ height: TAB_BAR_SPACE }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  heroBody: { marginTop: 4, lineHeight: 18, fontSize: 11 },
  sectionLabel: { marginTop: 22, marginBottom: 8, fontSize: 10 },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  faq: { borderBottomWidth: 1, borderBottomColor: colors.line },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  question: { flex: 1, fontSize: 13.5 },
  answer: { paddingHorizontal: 14, paddingBottom: 14, marginTop: -4, lineHeight: 18, fontSize: 11 },
  finePrint: { fontSize: 11, lineHeight: 14, marginTop: 12, textAlign: 'center' },
});
