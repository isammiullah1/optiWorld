import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RetailerOrderDetail } from '@optiworld/shared';

import { loadRetailerOrder } from '../../services/catalog-orders';
import {
  connectOrderChat,
  joinOrderChat,
  proposeOrderChange,
  sendOrderChatMessage,
} from '../../services/order-chat';
import { colors } from '../../theme/colors';

const STEPS = ['PENDING', 'CONFIRMED', 'DISPATCHED', 'DELIVERED'] as const;

export function RetailerOrderScreen({
  orderId,
  onBack,
}: {
  orderId: string;
  onBack: () => void;
}): React.ReactElement {
  const [order, setOrder] = useState<RetailerOrderDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void loadRetailerOrder(orderId).then((next) => {
      setOrder(next);
      setQuantities(Object.fromEntries(next.items.map((item) => [item.id, String(item.quantity)])));
    });
  }, [orderId]);

  const locked = Boolean(order?.lockedAt);
  const step = order ? STEPS.indexOf(order.status) : -1;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Order #{order?.reference ?? ''}</Text>
      <Text style={styles.meta}>
        {order?.wholesaler.name} · {order?.wholesaler.phone ?? 'No phone'}
      </Text>
      {locked ? <Text style={styles.banner}>Order confirmed — no further changes</Text> : null}
      <View style={styles.steps}>
        {STEPS.map((name, index) => (
          <Text
            key={name}
            style={{ color: index <= step ? colors.teal : colors.ink3, fontSize: 13 }}
          >
            {name}
          </Text>
        ))}
      </View>
      {order?.items.map((item) => (
        <Text key={item.id} style={styles.body}>
          {item.productName} × {item.quantity} ·{' '}
          {item.agreedPrice ? `₨ ${item.agreedPrice}` : 'Price on request'}
        </Text>
      ))}
      <Text style={styles.body}>
        {order?.totalValue ? `Total ₨ ${order.totalValue}` : 'Total on request'}
      </Text>
      <Text style={styles.title}>Chat</Text>
      {order?.messages.map((message) => (
        <Text key={message.id} style={styles.body}>
          {message.senderName}: {message.content}
        </Text>
      ))}
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Message"
        placeholderTextColor={colors.ink3}
        style={styles.input}
      />
      <Pressable
        style={styles.primary}
        onPress={() => {
          if (draft.trim().length === 0) {
            return;
          }
          const content = draft.trim();
          setDraft('');
          void connectOrderChat()
            .then(async (socket) => {
              await joinOrderChat(socket, orderId);
              await sendOrderChatMessage(socket, orderId, content);
              socket.disconnect();
              return loadRetailerOrder(orderId);
            })
            .then(setOrder)
            .catch(() => setNotice('The message could not be sent'));
        }}
      >
        <Text style={styles.primaryText}>Send</Text>
      </Pressable>
      {!locked && order?.pricesVisible ? (
        <View style={styles.card}>
          <Text style={styles.body}>Propose changes</Text>
          {order.items.map((item) =>
            item.agreedPrice && item.catalogProductId ? (
              <TextInput
                key={item.id}
                value={quantities[item.id] ?? String(item.quantity)}
                keyboardType="number-pad"
                onChangeText={(value) =>
                  setQuantities((current) => ({ ...current, [item.id]: value }))
                }
                style={styles.input}
              />
            ) : null,
          )}
          <Pressable
            style={styles.back}
            onPress={() => {
              const changes = order.items.flatMap((item) => {
                if (!item.catalogProductId || !item.agreedPrice) {
                  return [];
                }
                const quantity = Number(quantities[item.id] ?? item.quantity);
                if (!Number.isInteger(quantity) || quantity < 1 || quantity === item.quantity) {
                  return [];
                }
                return [
                  {
                    catalogProductId: item.catalogProductId,
                    quantity,
                    agreedPrice: item.agreedPrice,
                  },
                ];
              });
              void connectOrderChat()
                .then(async (socket) => {
                  await joinOrderChat(socket, orderId);
                  await proposeOrderChange(socket, orderId, changes);
                  socket.disconnect();
                })
                .then(() => setNotice('Change proposed.'))
                .catch(() => setNotice('The change could not be proposed'));
            }}
          >
            <Text style={styles.link}>Propose change</Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? <Text style={styles.meta}>{notice}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 12 },
  back: { minHeight: 44, justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  body: { color: colors.ink, fontSize: 15 },
  meta: { color: colors.ink3, fontSize: 14 },
  banner: {
    backgroundColor: colors.amberSoft,
    color: colors.ink,
    borderRadius: 8,
    padding: 12,
    overflow: 'hidden',
  },
  steps: { flexDirection: 'row', justifyContent: 'space-between' },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 8,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.white,
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
  primaryText: { color: colors.white, fontWeight: '600' },
  link: { color: colors.blue, fontSize: 16 },
});
