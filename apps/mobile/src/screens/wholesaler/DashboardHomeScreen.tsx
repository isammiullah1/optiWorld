import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { WholesalerDashboard } from '@optiworld/shared';

import { EmptyState, SkeletonCard, StatusBadge } from '../../components/shared';
import { loadWholesalerDashboard } from '../../services/mobile-directory';
import { colors } from '../../theme/colors';

type DashboardHomeScreenProps = {
  onOpenOrder: (orderId: string) => void;
};

export function DashboardHomeScreen({ onOpenOrder }: DashboardHomeScreenProps): React.ReactElement {
  const [data, setData] = useState<WholesalerDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setData(await loadWholesalerDashboard());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The dashboard could not be loaded');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!data && !error) {
    return (
      <View style={styles.screen}>
        <SkeletonCard />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {data ? (
        <View style={styles.grid}>
          <Count label="Pending" value={data.pendingOrders} />
          <Count label="Connections" value={data.activeConnections} />
          <Count label="Catalog" value={data.catalogProducts} />
          <Count label="Out of stock" value={data.outOfStockProducts} />
          <Count label="Orders today" value={data.ordersToday} />
        </View>
      ) : null}
      {data && data.recentOrders.length === 0 ? (
        <EmptyState description="New retailer orders show up here." title="No recent orders" />
      ) : null}
      {data?.recentOrders.map((order) => (
        <Pressable
          key={order.id}
          accessibilityRole="button"
          onPress={() => onOpenOrder(order.id)}
          style={styles.card}
        >
          <View style={styles.row}>
            <Text style={styles.title}>#{order.reference}</Text>
            <StatusBadge status={order.status} />
          </View>
          <Text style={styles.detail}>
            {order.retailerName} · {order.itemCount} items
          </Text>
        </Pressable>
      ))}
    </ScrollView>
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
});
