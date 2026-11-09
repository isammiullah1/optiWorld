import { useEffect, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PosReceipt } from '@optiworld/shared';

import { loadMobileReceipt, sendMobileReceipt } from '../../services/pos-billing';
import { readLocalReceipt } from '../../services/syncService';
import { useConnectivityStore } from '../../store/connectivity.store';
import { colors } from '../../theme/colors';

type ReceiptScreenProps = {
  invoiceId?: string;
  localId?: string;
  localRef?: string;
  onNewInvoice: () => void;
  onBack: () => void;
};

const OFFLINE_NOTICE = 'Will sync and send WhatsApp receipt when back online';

export function ReceiptScreen({
  invoiceId,
  localId,
  localRef,
  onNewInvoice,
  onBack,
}: ReceiptScreenProps): ReactElement {
  const isOnline = useConnectivityStore((state) => state.isOnline);
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [local, setLocal] = useState<Awaited<ReturnType<typeof readLocalReceipt>>>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = Boolean(localId) && !invoiceId;

  useEffect(() => {
    if (invoiceId) {
      void loadMobileReceipt(invoiceId)
        .then(setReceipt)
        .catch(() => setNotice('The receipt could not be loaded.'));
      return;
    }
    if (localId) {
      setNotice(OFFLINE_NOTICE);
      void readLocalReceipt(localId).then(setLocal);
    }
  }, [invoiceId, localId]);

  const summary = receipt
    ? {
        title: `Invoice #${receipt.invoiceNumber}`,
        customerName: receipt.customerName,
        status: receipt.status,
        items: receipt.items.map((item) => ({
          id: item.id,
          label: `${item.productName} × ${item.quantity}`,
          amount: item.lineTotal,
        })),
        subtotal: receipt.subtotal,
        discount: receipt.discount,
        deliveryCharge: receipt.deliveryAddress ? receipt.deliveryCharge : null,
        deliveryAddress: receipt.deliveryAddress,
        total: receipt.total,
        labReference: receipt.labReference,
      }
    : local
      ? {
          title: localRef ?? 'Saved on this device',
          customerName: local.customerName,
          status: local.status,
          items: local.items.map((item) => ({
            id: item.id,
            label: `${item.productName} × ${item.quantity}`,
            amount: item.lineTotal,
          })),
          subtotal: local.subtotal,
          discount: local.discount,
          deliveryCharge: local.deliveryCharge,
          deliveryAddress: local.deliveryAddress,
          total: local.total,
          labReference: null,
        }
      : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      {summary ? (
        <View style={styles.card}>
          <Text style={styles.title}>{summary.title}</Text>
          <Text style={styles.body}>{summary.customerName}</Text>
          <Text style={[styles.badge, summary.status === 'PAID' ? styles.paid : styles.credit]}>
            {summary.status === 'PAID' ? 'PAID' : 'ON CREDIT'}
          </Text>
          {summary.items.map((item) => (
            <Text key={item.id} style={styles.body}>
              {item.label} · ₨ {item.amount}
            </Text>
          ))}
          <Text style={styles.body}>Subtotal ₨ {summary.subtotal}</Text>
          <Text style={styles.body}>Discount ₨ {summary.discount}</Text>
          {summary.deliveryAddress ? (
            <Text style={styles.body}>
              Delivery ₨ {summary.deliveryCharge ?? '0.00'} · {summary.deliveryAddress}
            </Text>
          ) : null}
          <Text style={styles.title}>Total ₨ {summary.total}</Text>
          {summary.labReference ? (
            <Text style={styles.body}>Lab reference {summary.labReference}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.body}>
          {pending ? (localRef ?? 'Saved on this device') : 'Loading receipt'}
        </Text>
      )}
      {notice ? <Text style={styles.banner}>{notice}</Text> : null}
      {isOnline && invoiceId ? (
        <Pressable
          onPress={() => {
            void sendMobileReceipt(invoiceId).then((result) => setNotice(result.message));
          }}
          style={styles.whatsapp}
        >
          <Text style={styles.whatsappText}>Send via WhatsApp</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onNewInvoice} style={styles.primary}>
        <Text style={styles.primaryText}>New invoice</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 12 },
  back: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.blue, fontSize: 16 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  title: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  body: { color: colors.ink2, fontSize: 15 },
  badge: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 13,
  },
  paid: { backgroundColor: colors.tealSoft, color: colors.teal },
  credit: { backgroundColor: colors.amberSoft, color: colors.amber },
  banner: {
    backgroundColor: colors.amberSoft,
    color: colors.amber,
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
  },
  whatsapp: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#128C7E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsappText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  primary: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: '600' },
});
