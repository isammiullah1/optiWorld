import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RetailerOrderRow } from '@optiworld/shared';

import { loadRetailerOrders } from '../../services/catalog-orders';
import { colors } from '../../theme/colors';

const FILTERS = ['ALL', 'PENDING', 'CONFIRMED', 'DISPATCHED', 'DELIVERED'] as const;

export function RetailerOrdersScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (orderId: string) => void;
}): React.ReactElement {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const [rows, setRows] = useState<RetailerOrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadRetailerOrders(filter)
      .then(setRows)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Orders could not be loaded'),
      );
  }, [filter]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Orders</Text>
      <View style={styles.row}>
        {FILTERS.map((status) => (
          <Pressable
            key={status}
            onPress={() => setFilter(status)}
            style={[styles.chip, filter === status && styles.chipOn]}
          >
            <Text style={filter === status ? styles.chipOnText : styles.meta}>
              {status === 'ALL' ? 'All' : status}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows.map((row) => (
        <Pressable key={row.id} style={styles.card} onPress={() => onOpen(row.id)}>
          <Text style={styles.name}>
            #{row.reference} · {row.wholesalerName}
          </Text>
          <Text style={styles.meta}>
            {row.itemCount} items · {row.status}
          </Text>
          <Text style={styles.link}>View</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 12 },
  back: { minHeight: 44, justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipOnText: { color: colors.white, fontSize: 14 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  name: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.ink3, fontSize: 14, marginTop: 4 },
  link: { color: colors.blue, fontSize: 16, marginTop: 8 },
  error: { color: colors.red, fontSize: 15 },
});
