import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { WholesalerOrderActivity } from '@optiworld/shared';

import { AppHeader, SkeletonCard, StatusBadge } from '../../components/shared';
import { loadWholesalerActivity, recentUtcRange } from '../../services/mobile-directory';
import { colors } from '../../theme/colors';

export function ActivityScreen(): React.ReactElement {
  const navigation = useNavigation();
  const [data, setData] = useState<WholesalerOrderActivity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const range = recentUtcRange(30);
    try {
      setData(await loadWholesalerActivity(range.from, range.to));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Order activity could not be loaded');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <View style={styles.screen}>
      <AppHeader title="Order activity" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!data && !error ? <SkeletonCard /> : null}
        {data ? (
          <View style={styles.grid}>
            <Count label="Received" value={data.counts.received} />
            <Count label="Confirmed" value={data.counts.confirmed} />
            <Count label="Dispatched" value={data.counts.dispatched} />
            <Count label="Delivered" value={data.counts.delivered} />
          </View>
        ) : null}
        {data?.orders.map((order) => (
          <View key={order.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.title}>#{order.reference}</Text>
              <StatusBadge status={order.status} />
            </View>
            <Text style={styles.detail}>
              {order.retailerName} · {order.itemsSummary}
            </Text>
          </View>
        ))}
        <Text style={styles.footer}>Revenue and financial data is managed outside OptiWorld.</Text>
      </ScrollView>
    </View>
  );
}

function Count({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <View style={styles.count}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  content: { gap: 8, padding: 12 },
  error: { color: colors.red, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  count: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: '47%',
    padding: 12,
  },
  value: { color: colors.ink, fontSize: 24, fontWeight: '600' },
  label: { color: colors.ink3, fontSize: 13, marginTop: 4 },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  detail: { color: colors.ink2, fontSize: 14, marginTop: 4 },
  footer: { color: colors.ink3, fontSize: 14, marginTop: 8 },
});
