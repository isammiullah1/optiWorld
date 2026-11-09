import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CustomerLedger, CustomerProfile } from '@optiworld/shared';

import {
  loadMobileCustomer,
  loadMobileLedger,
  recordMobilePayment,
} from '../../services/customers';
import { colors } from '../../theme/colors';

type CustomerProfileScreenProps = {
  customerId: string;
  isOwner: boolean;
  onBack: () => void;
  onNewInvoice: () => void;
};

const TABS = ['Overview', 'Invoices', 'Ledger', 'Activity'] as const;

export function CustomerProfileScreen({
  customerId,
  isOwner,
  onBack,
  onNewInvoice,
}: CustomerProfileScreenProps): React.ReactElement {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [ledger, setLedger] = useState<CustomerLedger | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const tabs = isOwner ? TABS : TABS.filter((item) => item !== 'Ledger');

  useEffect(() => {
    void loadMobileCustomer(customerId)
      .then((next) => {
        setProfile(next);
        setAmount(next.outstanding);
      })
      .catch(() => setError('Customer was not found'));
    if (isOwner) {
      void loadMobileLedger(customerId)
        .then(setLedger)
        .catch(() => setLedger(null));
    }
  }, [customerId, isOwner]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      <Text style={styles.title}>{profile?.name ?? 'Customer'}</Text>
      <Pressable onPress={onNewInvoice} style={styles.primary}>
        <Text style={styles.primaryText}>New invoice</Text>
      </Pressable>
      <View style={styles.row}>
        {tabs.map((item) => (
          <Pressable
            key={item}
            onPress={() => setTab(item)}
            style={[styles.chip, tab === item && styles.chipOn]}
          >
            <Text style={tab === item ? styles.chipOnText : styles.meta}>{item}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {profile && tab === 'Overview' ? (
        <View style={styles.card}>
          <Text style={styles.body}>Total spent ₨ {profile.totalSpent}</Text>
          <Text style={styles.body}>Outstanding ₨ {profile.outstanding}</Text>
          <Text style={styles.body}>Credit limit ₨ {profile.creditLimit}</Text>
          <Text style={styles.body}>Invoices {profile.invoiceCount}</Text>
          <Text style={styles.body}>{profile.notes ?? 'No notes yet.'}</Text>
          {profile.prescriptions.map((record) => (
            <Text key={record.id} style={styles.meta}>
              {record.referenceNumber} · {record.summary}
            </Text>
          ))}
        </View>
      ) : null}
      {profile && tab === 'Invoices'
        ? profile.invoices.map((invoice) => (
            <View key={invoice.id} style={styles.card}>
              <Text style={styles.body}>
                #{invoice.invoiceNumber} · {invoice.status} · ₨ {invoice.total}
              </Text>
            </View>
          ))
        : null}
      {tab === 'Ledger' && isOwner ? (
        <View style={styles.card}>
          <TextInput value={amount} onChangeText={setAmount} style={styles.input} />
          <Pressable
            onPress={() => {
              void recordMobilePayment(customerId, {
                amount,
                recordedAt: new Date().toISOString(),
                method: 'CASH',
              })
                .then(() => loadMobileLedger(customerId))
                .then(setLedger)
                .catch(() => setError('The payment could not be saved'));
            }}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>Record payment</Text>
          </Pressable>
          {ledger?.entries.map((entry) => (
            <Text key={entry.id} style={styles.body}>
              {new Date(entry.at).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' · '}
              {entry.handledBy ?? '—'}
              {' · '}
              {entry.label}
              {' · '}
              {entry.kind === 'DEBIT' ? 'Debit' : 'Credit'} ₨ {entry.amount} · Balance ₨{' '}
              {entry.balance}
            </Text>
          ))}
        </View>
      ) : null}
      {profile && tab === 'Activity'
        ? profile.activity.map((event) => (
            <View key={event.id} style={styles.card}>
              <Text style={styles.body}>{event.title}</Text>
              <Text style={styles.meta}>{event.detail}</Text>
            </View>
          ))
        : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 12 },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.blue, fontSize: 16 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipOnText: { color: colors.white, fontSize: 14 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  body: { color: colors.ink, fontSize: 15 },
  meta: { color: colors.ink3, fontSize: 14 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.ink,
  },
  primary: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  error: { color: colors.red, fontSize: 14 },
});
