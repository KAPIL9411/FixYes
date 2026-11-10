import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { api } from '../../api';
import type { Address } from '../../api/types';
import { useAddresses, useCategories, useItems, qk } from '../../hooks/data';
import { AppText, Button, Field, Pill } from '../../ui/core';
import { CategoryGlyph } from '../../ui/CategoryGlyph';
import { Sheet } from '../../ui/Sheet';
import { AppHeader } from '../../components/AppHeader';
import { colors, fonts, radius, shadows } from '../../theme';
import { errorMessage } from '../../lib/errors';
import { inr } from '../../lib/format';

const STEPS = ['Address', 'Time', 'Review'];

function slotOptions() {
  const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  return [
    { id: 'soon', title: 'As soon as possible', detail: 'We start finding a partner right away', value: undefined as string | undefined },
    { id: 'later', title: 'In about 2 hours', detail: 'A two-hour arrival window today', value: inTwoHours.toISOString() },
    { id: 'tomorrow', title: 'Tomorrow, 10:00 AM', detail: 'Morning arrival window', value: tomorrow.toISOString() },
  ];
}

export default function BookingFlowScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const items = useItems();
  const categories = useCategories();
  const addresses = useAddresses();
  const item = items.data?.find((entry) => entry.id === itemId);
  const category = categories.data?.find((entry) => entry.id === item?.categoryId);
  const slots = useMemo(() => slotOptions(), []);

  const [step, setStep] = useState(0);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [slotId, setSlotId] = useState('soon');
  const [addressSheet, setAddressSheet] = useState(false);
  const [addressForm, setAddressForm] = useState({
    label: 'Home',
    addressLine: '',
    locality: '',
    city: 'Bareilly',
    state: 'Uttar Pradesh',
    postalCode: '',
  });
  const [addressError, setAddressError] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  const [bookingError, setBookingError] = useState('');

  const selectedAddress: Address | undefined =
    addresses.data?.find((address) => address.id === addressId) ?? addresses.data?.[0];
  const selectedSlot = slots.find((slot) => slot.id === slotId) ?? slots[0]!;

  const create = useMutation({
    mutationFn: () =>
      api.createBooking(
        {
          serviceItemId: itemId as string,
          addressId: selectedAddress!.id,
          scheduledAt: selectedSlot.value,
        },
        randomUUID(),
      ),
    onSuccess: (booking) => {
      void queryClient.invalidateQueries({ queryKey: qk.bookings });
      router.replace({ pathname: '/bookings/[bookingId]', params: { bookingId: booking.id } });
    },
    onError: (error) => setBookingError(errorMessage(error)),
  });

  const addAddress = async () => {
    setAddressError('');
    if (addressForm.addressLine.trim().length < 5) {
      setAddressError('Add a house or street detail (at least 5 characters).');
      return;
    }
    if (!/^[1-9][0-9]{5}$/.test(addressForm.postalCode.trim())) {
      setAddressError('Enter a valid 6-digit PIN code.');
      return;
    }
    setSavingAddress(true);
    try {
      const address = await api.createAddress({
        label: addressForm.label.trim() || 'Home',
        addressLine: addressForm.addressLine.trim(),
        locality: addressForm.locality.trim() || null,
        city: addressForm.city.trim(),
        state: addressForm.state.trim(),
        postalCode: addressForm.postalCode.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: qk.addresses });
      setAddressId(address.id);
      setAddressSheet(false);
      setAddressForm((current) => ({ ...current, addressLine: '', locality: '', postalCode: '' }));
    } catch (error) {
      setAddressError(errorMessage(error));
    } finally {
      setSavingAddress(false);
    }
  };

  const next = () => {
    if (step === 0 && !selectedAddress) {
      setAddressSheet(true);
      return;
    }
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setBookingError('');
    create.mutate();
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
    else router.back();
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Book a service" onBack={back} />

      <View style={styles.progress}>
        {STEPS.map((label, index) => (
          <View key={label} style={styles.progressItem}>
            <View style={styles.progressTop}>
              <View style={[styles.stepDot, index <= step && styles.stepDotActive]}>
                {index < step ? (
                  <Ionicons name="checkmark" size={11} color={colors.white} />
                ) : (
                  <AppText variant="caption" style={[styles.stepNumber, index <= step && styles.stepNumberActive]}>
                    {index + 1}
                  </AppText>
                )}
              </View>
              <AppText variant="small" style={[styles.stepLabel, index <= step && styles.stepLabelActive]}>
                {label}
              </AppText>
            </View>
            {index < STEPS.length - 1 ? (
              <View style={[styles.stepLine, index < step && styles.stepLineActive]} />
            ) : null}
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step === 0 ? (
          <>
            <AppText variant="h1" style={styles.title}>
              Where should we come?
            </AppText>
            <AppText variant="body" style={styles.subtitle}>
              Your partner will use this address for the visit.
            </AppText>
            <View style={styles.bookingFor}>
              <CategoryGlyph code={category?.code} size={48} />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" style={styles.bookingForLabel}>
                  YOU’RE BOOKING
                </AppText>
                <AppText variant="h3" numberOfLines={1}>
                  {item?.name ?? 'Home service'}
                </AppText>
                <AppText variant="small" style={styles.bookingForMeta}>
                  {inr(item?.basePrice)} · Verified partner
                </AppText>
              </View>
              <Ionicons name="shield-checkmark" size={18} color={colors.success} />
            </View>
            <View style={styles.list}>
              {(addresses.data ?? []).map((address) => {
                const active = selectedAddress?.id === address.id;
                return (
                  <Pressable accessibilityRole="button"
                    key={address.id}
                    onPress={() => setAddressId(address.id)}
                    style={[styles.address, active && styles.addressActive]}
                  >
                    <View style={[styles.addressIcon, active && styles.addressIconActive]}>
                      <Ionicons
                        name={address.label?.toLowerCase() === 'work' ? 'briefcase-outline' : 'home-outline'}
                        size={19}
                        color={active ? colors.white : colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="h3">{address.label ?? 'Home'}</AppText>
                      <AppText variant="small" style={styles.addressLine}>
                        {address.addressLine}
                        {address.locality ? `, ${address.locality}` : ''} · {address.city} {address.postalCode}
                      </AppText>
                    </View>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <View style={styles.radioInner} /> : null}
                    </View>
                  </Pressable>
                );
              })}
              <Pressable accessibilityRole="button" style={styles.addAddress} onPress={() => setAddressSheet(true)}>
                <Ionicons name="add" size={19} color={colors.primary} />
                <AppText variant="h3" style={styles.addAddressText}>
                  Add a new address
                </AppText>
              </Pressable>
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <AppText variant="h1" style={styles.title}>
              When works for you?
            </AppText>
            <AppText variant="body" style={styles.subtitle}>
              Choose an arrival window. You can track the partner live.
            </AppText>
            <View style={styles.list}>
              {slots.map((slot) => {
                const active = slotId === slot.id;
                return (
                  <Pressable accessibilityRole="button"
                    key={slot.id}
                    onPress={() => setSlotId(slot.id)}
                    style={[styles.slot, active && styles.addressActive]}
                  >
                    <View style={[styles.addressIcon, active && styles.addressIconActive]}>
                      <Ionicons name="time-outline" size={19} color={active ? colors.white : colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="h3">{slot.title}</AppText>
                      <AppText variant="small" style={styles.addressLine}>
                        {slot.detail}
                      </AppText>
                    </View>
                    {active ? <Pill label="SELECTED" tone="violet" /> : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.infoNote}>
              <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
              <AppText variant="small" style={styles.infoText}>
                You can cancel free of charge until the partner starts the job.
              </AppText>
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <AppText variant="h1" style={styles.title}>
              Review your booking
            </AppText>
            <AppText variant="body" style={styles.subtitle}>
              Check the details before we find your partner.
            </AppText>

            <View style={styles.serviceCard}>
              <CategoryGlyph code={category?.code} size={50} />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" style={styles.serviceEyebrow}>
                  {(category?.name ?? 'SERVICE').toUpperCase()}
                </AppText>
                <AppText variant="h3">{item?.name}</AppText>
                <AppText variant="small" style={styles.serviceMeta}>
                  Verified partner · Pay after service
                </AppText>
              </View>
              <AppText variant="price" style={styles.servicePrice}>
                {inr(item?.basePrice)}
              </AppText>
            </View>

            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryIcon}>
                  <Ionicons name="location-outline" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="small" style={styles.summaryLabel}>
                    SERVICE ADDRESS
                  </AppText>
                  <AppText variant="body" style={styles.summaryValue}>
                    {selectedAddress?.addressLine}
                    {selectedAddress?.locality ? `, ${selectedAddress.locality}` : ''}, {selectedAddress?.city}
                  </AppText>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setStep(0)} hitSlop={8}>
                  <AppText variant="small" style={styles.edit}>
                    Edit
                  </AppText>
                </Pressable>
              </View>
              <View style={styles.summaryLine} />
              <View style={styles.summaryRow}>
                <View style={styles.summaryIcon}>
                  <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="small" style={styles.summaryLabel}>
                    ARRIVAL WINDOW
                  </AppText>
                  <AppText variant="body" style={styles.summaryValue}>
                    {selectedSlot.title}
                  </AppText>
                </View>
                <Pressable accessibilityRole="button" onPress={() => setStep(1)} hitSlop={8}>
                  <AppText variant="small" style={styles.edit}>
                    Edit
                  </AppText>
                </Pressable>
              </View>
            </View>

            <View style={styles.priceCard}>
              <View style={styles.priceRow}>
                <AppText variant="body">Service price</AppText>
                <AppText variant="bodyMedium">{inr(item?.basePrice)}</AppText>
              </View>
              <View style={styles.priceRow}>
                <AppText variant="body">Visit</AppText>
                <AppText variant="body" style={styles.included}>
                  Included
                </AppText>
              </View>
              <View style={styles.summaryLine} />
              <View style={styles.priceRow}>
                <AppText variant="h3">Total</AppText>
                <AppText variant="price">{inr(item?.basePrice)}</AppText>
              </View>
              <View style={styles.payNote}>
                <Ionicons name="cash-outline" size={15} color={colors.success} />
                <AppText variant="small" style={styles.payText}>
                  Pay the partner after the service. No card needed now.
                </AppText>
              </View>
            </View>

            {bookingError ? <AppText variant="small" style={styles.error}>{bookingError}</AppText> : null}
          </>
        ) : null}
        <View style={{ height: 120 + insets.bottom }} />
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={{ flex: 1 }}>
          <AppText variant="small" style={styles.totalLabel}>
            {step === 2 ? 'TOTAL' : 'SERVICE PRICE'}
          </AppText>
          <AppText variant="price">{inr(item?.basePrice)}</AppText>
        </View>
        <Button
          label={step === 2 ? 'Confirm booking' : 'Continue'}
          icon={step === 2 ? 'checkmark-circle-outline' : 'arrow-forward'}
          onPress={next}
          loading={create.isPending}
          disabled={(step === 0 && !selectedAddress) || !item}
          full={false}
          style={styles.cta}
        />
      </View>

      <Sheet
        visible={addressSheet}
        onClose={() => setAddressSheet(false)}
        title="Add an address"
        subtitle="Where should the partner come?"
      >
        <Field label="LABEL" value={addressForm.label} onChangeText={(label) => setAddressForm((f) => ({ ...f, label }))} placeholder="Home, Work…" />
        <Field
          label="HOUSE / STREET"
          value={addressForm.addressLine}
          onChangeText={(addressLine) => setAddressForm((f) => ({ ...f, addressLine }))}
          placeholder="House 42, near City Hospital"
        />
        <Field
          label="LOCALITY"
          value={addressForm.locality}
          onChangeText={(locality) => setAddressForm((f) => ({ ...f, locality }))}
          placeholder="Rampur Garden"
        />
        <View style={styles.fieldRow}>
          <Field label="CITY" value={addressForm.city} onChangeText={(city) => setAddressForm((f) => ({ ...f, city }))} style={{ flex: 1 }} />
          <Field label="STATE" value={addressForm.state} onChangeText={(state) => setAddressForm((f) => ({ ...f, state }))} style={{ flex: 1 }} />
        </View>
        <Field
          label="PIN CODE"
          value={addressForm.postalCode}
          onChangeText={(postalCode) => setAddressForm((f) => ({ ...f, postalCode }))}
          placeholder="243001"
          keyboardType="number-pad"
          maxLength={6}
          error={addressError}
        />
        <Button label="Save address" onPress={addAddress} loading={savingAddress} icon="checkmark" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  progress: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 14,
  },
  progressItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: colors.primary },
  stepNumber: { fontSize: 10.5, color: colors.muted },
  stepNumberActive: { color: colors.white },
  stepLabel: { fontSize: 10, color: colors.faint },
  stepLabelActive: { color: colors.ink },
  stepLine: { flex: 1, height: 1, backgroundColor: colors.line, marginHorizontal: 8 },
  stepLineActive: { backgroundColor: colors.primary },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  title: { fontSize: 25, lineHeight: 31 },
  subtitle: { marginTop: 6, color: colors.muted, fontSize: 12.5 },
  list: { gap: 10, marginTop: 12 },
  bookingFor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 9,
    marginTop: 14,
  },
  bookingForImage: { width: 48, height: 48, borderRadius: radius.sm },
  bookingForLabel: { fontSize: 9.5, color: colors.primary },
  bookingForMeta: { fontSize: 10, marginTop: 1 },
  address: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.card,
  },
  addressActive: { borderColor: colors.primary },
  addressIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressIconActive: { backgroundColor: colors.primary },
  addressLine: { marginTop: 2, lineHeight: 16, fontSize: 10.5 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  addAddress: {
    height: 58,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.primaryGhost,
  },
  addAddressText: { color: colors.primary, fontSize: 12.5 },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.card,
  },
  infoNote: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 18,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontFamily: fonts.medium, fontSize: 10.5, color: colors.inkSoft, lineHeight: 15 },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: radius.lg,
    marginTop: 20,
    ...shadows.card,
  },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  serviceEyebrow: { fontSize: 10 },
  serviceMeta: { fontSize: 10, marginTop: 2 },
  servicePrice: { fontSize: 17 },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 15,
    marginTop: 12,
  },
  summaryRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: { fontSize: 10, letterSpacing: 1 },
  summaryValue: { marginTop: 2, fontSize: 12, lineHeight: 17 },
  summaryLine: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  edit: { color: colors.primary, fontFamily: fonts.semibold, fontSize: 10.5 },
  priceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 15,
    marginTop: 12,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  included: { color: colors.success, fontFamily: fonts.semibold, fontSize: 11 },
  payNote: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    padding: 10,
    marginTop: 8,
  },
  payText: { flex: 1, fontSize: 11, lineHeight: 13, color: colors.success },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  totalLabel: { fontSize: 10, letterSpacing: 1.2 },
  cta: { flex: 1.7 },
  fieldRow: { flexDirection: 'row', gap: 10 },
});
