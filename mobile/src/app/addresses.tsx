import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import type { Address } from '../api/types';
import { useAddresses, qk } from '../hooks/data';
import { AppText, Button, EmptyState, Field, IconButton } from '../ui/core';
import { Sheet } from '../ui/Sheet';
import { AppHeader } from '../components/AppHeader';
import { colors, fonts, radius, shadows } from '../theme';
import { errorMessage } from '../lib/errors';

const blank = {
  label: 'Home',
  addressLine: '',
  locality: '',
  city: 'Bareilly',
  state: 'Uttar Pradesh',
  postalCode: '',
};

export default function AddressesScreen() {
  const queryClient = useQueryClient();
  const addresses = useAddresses();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const startAdd = () => {
    setEditing(null);
    setForm(blank);
    setError('');
    setOpen(true);
  };

  const startEdit = (address: Address) => {
    setEditing(address);
    setForm({
      label: address.label ?? 'Home',
      addressLine: address.addressLine,
      locality: address.locality ?? '',
      city: address.city,
      state: address.state,
      postalCode: address.postalCode ?? '',
    });
    setError('');
    setOpen(true);
  };

  const save = async () => {
    setError('');
    if (form.addressLine.trim().length < 5) {
      setError('Add a house or street detail (at least 5 characters).');
      return;
    }
    if (!/^[1-9][0-9]{5}$/.test(form.postalCode.trim())) {
      setError('Enter a valid 6-digit PIN code.');
      return;
    }
    setBusy(true);
    try {
      const input = {
        label: form.label.trim() || 'Home',
        addressLine: form.addressLine.trim(),
        locality: form.locality.trim() || null,
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
      };
      if (editing) await api.updateAddress(editing.id, input);
      else await api.createAddress(input);
      await queryClient.invalidateQueries({ queryKey: qk.addresses });
      setOpen(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = (address: Address) => {
    Alert.alert('Delete this address?', `${address.label ?? 'Home'} · ${address.addressLine}`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteAddress(address.id);
            await queryClient.invalidateQueries({ queryKey: qk.addresses });
          } catch (cause) {
            Alert.alert('Could not delete', errorMessage(cause));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader
        title="Saved addresses"
        right={<IconButton icon="add" variant="violet" size={38} onPress={startAdd} accessibilityLabel="Add address" />}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppText variant="h1" style={styles.title}>
          Where do you need us?
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Save the places you book for. Your partner only sees the address for an active job.
        </AppText>

        <View style={styles.list}>
          {(addresses.data ?? []).map((address) => (
            <View key={address.id} style={styles.card}>
              <View style={styles.icon}>
                <Ionicons
                  name={address.label?.toLowerCase() === 'work' ? 'briefcase-outline' : 'home-outline'}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="h3">{address.label ?? 'Home'}</AppText>
                <AppText variant="small" style={styles.addressLine}>
                  {address.addressLine}
                  {address.locality ? `, ${address.locality}` : ''}
                  {'\n'}
                  {address.city}, {address.state} {address.postalCode ?? ''}
                </AppText>
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" onPress={() => startEdit(address)} style={styles.action}>
                    <Ionicons name="create-outline" size={14} color={colors.primary} />
                    <AppText variant="small" style={styles.actionText}>
                      Edit
                    </AppText>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => remove(address)} style={styles.action}>
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    <AppText variant="small" style={[styles.actionText, { color: colors.danger }]}>
                      Delete
                    </AppText>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
          {addresses.data?.length === 0 ? (
            <EmptyState
              icon="location-outline"
              title="No saved addresses"
              body="Add your home or work address to book your first service."
              action="Add address"
              onAction={startAdd}
            />
          ) : null}
        </View>

        <Button label="Add another address" variant="soft" icon="add" onPress={startAdd} style={{ marginTop: 14 }} />
      </ScrollView>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit address' : 'Add an address'}
        subtitle="Where should the partner come?"
      >
        <Field label="LABEL" value={form.label} onChangeText={(label) => setForm((f) => ({ ...f, label }))} placeholder="Home, Work…" />
        <Field
          label="HOUSE / STREET"
          value={form.addressLine}
          onChangeText={(addressLine) => setForm((f) => ({ ...f, addressLine }))}
          placeholder="House 42, near City Hospital"
        />
        <Field
          label="LOCALITY"
          value={form.locality}
          onChangeText={(locality) => setForm((f) => ({ ...f, locality }))}
          placeholder="Rampur Garden"
        />
        <View style={styles.fieldRow}>
          <Field label="CITY" value={form.city} onChangeText={(city) => setForm((f) => ({ ...f, city }))} style={{ flex: 1 }} />
          <Field label="STATE" value={form.state} onChangeText={(state) => setForm((f) => ({ ...f, state }))} style={{ flex: 1 }} />
        </View>
        <Field
          label="PIN CODE"
          value={form.postalCode}
          onChangeText={(postalCode) => setForm((f) => ({ ...f, postalCode }))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="243001"
          error={error}
        />
        <Button
          label={editing ? 'Save changes' : 'Save address'}
          icon="checkmark"
          onPress={save}
          loading={busy}
        />
        {editing ? (
          <Button label="Delete address" variant="danger" onPress={() => { setOpen(false); remove(editing); }} style={{ marginTop: 8 }} />
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 34 },
  title: { fontSize: 26, lineHeight: 32 },
  subtitle: { marginTop: 6, fontSize: 12, lineHeight: 18, color: colors.muted },
  list: { gap: 12, marginTop: 20 },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 15,
    ...shadows.card,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  badge: {
    backgroundColor: colors.primaryGhost,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 9, color: colors.primary, letterSpacing: 0.8 },
  addressLine: { marginTop: 3, fontSize: 10.5, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontFamily: fonts.semibold, color: colors.primary, fontSize: 10 },
  fieldRow: { flexDirection: 'row', gap: 10 },
});
