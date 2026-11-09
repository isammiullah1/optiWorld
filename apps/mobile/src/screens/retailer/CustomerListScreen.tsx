import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CustomerListItem } from '@optiworld/shared';

import { createMobileCustomer, loadMobileCustomers } from '../../services/customers';
import { colors } from '../../theme/colors';

type CustomerListScreenProps = {
  onBack: () => void;
  onOpen: (customerId: string) => void;
  onNewInvoice: (customerId: string) => void;
};

export function CustomerListScreen({
  onBack,
  onOpen,
  onNewInvoice,
}: CustomerListScreenProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [dues, setDues] = useState<'ALL' | 'HAS_DUES' | 'NO_DUES'>('ALL');
  const [rows, setRows] = useState<CustomerListItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadMobileCustomers({ q: query, dues, sort: 'NAME', page: 1, limit: 25 })
      .then(setRows)
      .catch(() => setError('Customers could not be loaded'));
  }, [query, dues]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Customers</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Name, phone, or email"
        placeholderTextColor={colors.ink3}
        style={styles.input}
      />
      <View style={styles.row}>
        {(['ALL', 'HAS_DUES', 'NO_DUES'] as const).map((filter) => (
          <Pressable
            key={filter}
            onPress={() => setDues(filter)}
            style={[styles.chip, dues === filter && styles.chipOn]}
          >
            <Text style={dues === filter ? styles.chipOnText : styles.meta}>
              {filter === 'ALL' ? 'All' : filter === 'HAS_DUES' ? 'Has dues' : 'No dues'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => setAdding((current) => !current)} style={styles.primary}>
        <Text style={styles.primaryText}>Add customer</Text>
      </Pressable>
      {adding ? (
        <View style={styles.card}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={colors.ink3}
            style={styles.input}
          />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone"
            placeholderTextColor={colors.ink3}
            style={styles.input}
          />
          <Pressable
            onPress={() => {
              void createMobileCustomer({
                name: name.trim(),
                phone: phone.trim(),
                creditLimit: '0.00',
              })
                .then(() => {
                  setName('');
                  setPhone('');
                  setAdding(false);
                  return loadMobileCustomers({ q: query, dues, sort: 'NAME', page: 1, limit: 25 });
                })
                .then(setRows)
                .catch(() => setError('The customer could not be saved'));
            }}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>Save customer</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows.map((row) => (
        <Pressable key={row.id} onPress={() => onOpen(row.id)} style={styles.card}>
          <Text style={styles.name}>{row.name}</Text>
          <Text style={styles.meta}>{row.phone ?? 'No phone'}</Text>
          <Text style={row.outstanding === '0.00' ? styles.meta : styles.due}>
            {row.outstanding === '0.00' ? 'No dues' : `Outstanding ₨ ${row.outstanding}`}
          </Text>
          <Pressable onPress={() => onNewInvoice(row.id)} style={styles.secondary}>
            <Text style={styles.link}>New invoice</Text>
          </Pressable>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 12 },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.blue, fontSize: 16 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    color: colors.ink,
  },
  row: { flexDirection: 'row', gap: 8 },
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
  name: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.ink3, fontSize: 14 },
  due: { color: colors.amber, fontSize: 14 },
  primary: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  secondary: { minHeight: 44, justifyContent: 'center' },
  error: { color: colors.red, fontSize: 14 },
});
