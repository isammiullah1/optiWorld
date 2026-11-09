import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { WholesalerOrderDetail } from '@optiworld/shared';

import {
  loadWholesalerOrderDetail,
  updateWholesalerOrderStatus,
} from '../../services/wholesaler-orders';
import { colors } from '../../theme/colors';
import { OrderChatScreen } from './OrderChatScreen';

export function OrderDetailScreen({
  orderId,
  onBack,
}: {
  orderId: string;
  onBack: () => void;
}): React.ReactElement {
  const [order, setOrder] = useState<WholesalerOrderDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback((): void => {
    void loadWholesalerOrderDetail(orderId)
      .then(setOrder)
      .catch((caught: unknown) =>
        setNotice(caught instanceof Error ? caught.message : 'Order could not be loaded'),
      );
  }, [orderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function ask(status: 'DISPATCHED' | 'DELIVERED'): void {
    const label = status === 'DISPATCHED' ? 'dispatched' : 'delivered';
    Alert.alert(
      `Mark as ${label}`,
      'This updates the order and notifies the retailer on WhatsApp.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Mark ${label}`,
          onPress: () => {
            void updateWholesalerOrderStatus(orderId, status)
              .then(async (message) => {
                setNotice(message);
                setOrder(await loadWholesalerOrderDetail(orderId));
              })
              .catch((caught: unknown) =>
                setNotice(caught instanceof Error ? caught.message : 'Could not update'),
              );
          },
        },
      ],
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
        {order?.status === 'CONFIRMED' ? (
          <Pressable onPress={() => ask('DISPATCHED')}>
            <Text style={styles.link}>Mark dispatched</Text>
          </Pressable>
        ) : null}
        {order?.status === 'DISPATCHED' ? (
          <Pressable onPress={() => ask('DELIVERED')}>
            <Text style={styles.link}>Mark delivered</Text>
          </Pressable>
        ) : null}
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {order ? (
        <OrderChatScreen
          orderId={orderId}
          reference={order.reference}
          retailerName={order.retailer.name}
          retailerCity={order.retailer.city}
          retailerPhone={order.retailer.phone}
          initiallyLocked={Boolean(order.lockedAt) || order.status !== 'PENDING'}
          initialStatus={order.status}
          initialTotal={order.totalValue}
          initialItems={order.items}
          onOrderChanged={refresh}
        />
      ) : (
        <View style={styles.loading} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  bar: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.blue, fontSize: 16 },
  notice: { color: colors.teal, fontSize: 14, paddingHorizontal: 16 },
  loading: { flex: 1, margin: 16, borderRadius: 12, backgroundColor: colors.white },
});
