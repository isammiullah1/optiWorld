import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { OrderStatus, WholesalerOrderRow } from '@optiworld/shared';

import {
  loadWholesalerOrderInbox,
  updateWholesalerOrderStatus,
} from '../../services/wholesaler-orders';
import { colors } from '../../theme/colors';

const STAGES = ['PENDING', 'CONFIRMED', 'DISPATCHED', 'DELIVERED'] as const;

export function OrdersScreen({
  onOpen,
}: {
  onOpen: (orderId: string) => void;
}): React.ReactElement {
  const [filter, setFilter] = useState<OrderStatus | ''>('');
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<WholesalerOrderRow[]>([]);
  const [pipeline, setPipeline] = useState({
    PENDING: 0,
    CONFIRMED: 0,
    DISPATCHED: 0,
    DELIVERED: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const result = await loadWholesalerOrderInbox({
        status: filter || undefined,
        q: query.trim() || undefined,
      });
      setOrders(result.orders);
      setPipeline(result.pipeline);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Orders could not be loaded');
    } finally {
      setRefreshing(false);
    }
  }, [filter, query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <Text style={styles.title}>Orders</Text>
      <View style={styles.pipeline}>
        {STAGES.map((stage) => (
          <Pressable
            key={stage}
            onPress={() => setFilter((current) => (current === stage ? '' : stage))}
            style={[styles.stage, filter === stage && styles.stageOn]}
          >
            <Text style={styles.stageLabel}>{stage[0] + stage.slice(1).toLowerCase()}</Text>
            <Text style={styles.stageCount}>{pipeline[stage]}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Order # or retailer"
        placeholderTextColor={colors.ink3}
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          onOpen={() => onOpen(order.id)}
          onStatus={() => {
            const next =
              order.status === 'CONFIRMED'
                ? 'DISPATCHED'
                : order.status === 'DISPATCHED'
                  ? 'DELIVERED'
                  : null;
            if (!next) {
              return;
            }
            const label = next === 'DISPATCHED' ? 'dispatched' : 'delivered';
            Alert.alert(
              `Mark as ${label}`,
              'This updates the order and notifies the retailer on WhatsApp.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: `Mark ${label}`,
                  onPress: () => {
                    void updateWholesalerOrderStatus(order.id, next)
                      .then((message) => {
                        Alert.alert('Order updated', message);
                        return refresh();
                      })
                      .catch((caught: unknown) =>
                        Alert.alert(
                          'Order',
                          caught instanceof Error ? caught.message : 'Could not update',
                        ),
                      );
                  },
                },
              ],
            );
          }}
        />
      ))}
    </ScrollView>
  );
}

function OrderCard({
  order,
  onOpen,
  onStatus,
}: {
  order: WholesalerOrderRow;
  onOpen: () => void;
  onStatus: () => void;
}): React.ReactElement {
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dx) > 24 && Math.abs(gesture.dy) < 20,
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx > 60) {
        onOpen();
      } else if (gesture.dx < -60) {
        onStatus();
      }
    },
  });
  return (
    <View {...pan.panHandlers} style={styles.card}>
      <Pressable onPress={onOpen} style={styles.cardBody}>
        <Text style={styles.name}>
          {order.hasUnread ? '● ' : ''}#{order.reference} · {order.retailerName}
        </Text>
        <Text style={styles.meta}>{order.itemsSummary}</Text>
        <Text style={styles.meta}>
          {order.totalValue ? `₨ ${order.totalValue}` : 'On request'} · {order.status}
        </Text>
        <Text style={styles.link}>Swipe right to open chat · swipe left for the status action</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 12 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  pipeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stage: {
    minWidth: 72,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  stageOn: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  stageLabel: { color: colors.ink3, fontSize: 13 },
  stageCount: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    color: colors.ink,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardBody: { padding: 12, minHeight: 44 },
  name: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.ink2, fontSize: 14, marginTop: 4 },
  link: { color: colors.blue, fontSize: 13, marginTop: 8 },
  error: { color: colors.red, fontSize: 15 },
});
