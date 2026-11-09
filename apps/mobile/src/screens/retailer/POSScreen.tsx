import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  centsToMoney,
  makeLabReference,
  moneyToCents,
  resolveDiscountCents,
  type ConnectedLab,
  type CustomerSearchHit,
  type InventorySearchHit,
  type LabPrescription,
} from '@optiworld/shared';

import { SearchBar } from '../../components/shared';
import { createLabJob } from '../../services/lab-jobs';
import {
  createMobileInvoice,
  loadMobileLabs,
  searchMobileCustomers,
  searchMobileInventory,
} from '../../services/pos-billing';
import { readLocalCatalog, recordCartSale } from '../../services/pos-sync';
import { useConnectivityStore } from '../../store/connectivity.store';
import { colors } from '../../theme/colors';
import { CartScreen, nextQuantity, type CartLine } from './CartScreen';

type PosScreenProps = {
  onReceipt: (target: { invoiceId?: string; localId?: string; localRef?: string }) => void;
  onBack: () => void;
};

const emptyEye = { sphere: '', cylinder: '', axis: '' };

export function POSScreen({ onReceipt, onBack }: PosScreenProps): ReactElement {
  const offline = !useConnectivityStore((state) => state.isOnline);
  const refreshPendingCount = useConnectivityStore((state) => state.refreshPendingCount);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<InventorySearchHit[]>([]);
  const [recent, setRecent] = useState<InventorySearchHit[]>([]);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerSearchHit | null>(null);
  const [customers, setCustomers] = useState<CustomerSearchHit[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [customerHint, setCustomerHint] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [payment, setPayment] = useState<'CASH' | 'CREDIT'>('CASH');
  const [discountMode, setDiscountMode] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT');
  const [discountValue, setDiscountValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [labs, setLabs] = useState<ConnectedLab[]>([]);
  const [labJob, setLabJob] = useState<LabPrescription | null>(null);
  const [editingRx, setEditingRx] = useState(false);

  useEffect(() => {
    void loadCatalog(query, offline).then(setProducts);
    if (!offline) {
      void loadMobileLabs()
        .then(setLabs)
        .catch(() => setLabs([]));
    }
  }, [query, offline]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (sum, line) => sum + moneyToCents(line.unitPrice || '0') * line.quantity,
      0,
    );
    const discount = resolveDiscountCents(subtotal, discountMode, discountValue);
    return {
      subtotal: centsToMoney(subtotal),
      discount: centsToMoney(discount),
      total: centsToMoney(Math.max(0, subtotal - discount)),
    };
  }, [discountMode, discountValue, lines]);

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const chips = recent.length > 0 ? recent : products.slice(0, 6);
  const results = query.trim().length > 0 ? products : [];

  function openCustomers(hint: string | null): void {
    setCustomerHint(hint);
    setPickingCustomer(true);
    void loadCustomers(customerQuery, offline).then(setCustomers);
  }

  function addProduct(product: InventorySearchHit): void {
    if (!customer) {
      openCustomers('Select a customer first.');
      return;
    }
    setRecent((current) =>
      [product, ...current.filter((entry) => entry.id !== product.id)].slice(0, 8),
    );
    setLines((current) => {
      const existing = current.find((line) => line.inventoryBatchId === product.id);
      if (existing) {
        return current.map((line) =>
          line.inventoryBatchId === product.id
            ? { ...line, quantity: nextQuantity(line.quantity, 1) }
            : line,
        );
      }
      return [
        ...current,
        {
          inventoryBatchId: product.id,
          priceCode: product.priceCode,
          productName: product.productName,
          unitPrice: product.salePrice,
          quantity: 1,
        },
      ];
    });
    setCartOpen(true);
  }

  async function complete(): Promise<void> {
    if (!customer || lines.length === 0) {
      return;
    }
    const localId = crypto.randomUUID();
    const localRef = `LOC-${Date.now()}`;
    const items = lines.map((line) => ({
      inventoryBatchId: line.inventoryBatchId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    }));
    try {
      if (!offline) {
        const receipt = await createMobileInvoice({
          localId,
          customerId: customer.id,
          paymentType: payment,
          discount: totals.discount,
          items,
          ...(labJob ? { labPrescription: labJob } : {}),
        });
        onReceipt({ invoiceId: receipt.id });
        return;
      }
      await recordCartSale({
        customerId: customer.id,
        items,
        discount: totals.discount,
        status: payment === 'CREDIT' ? 'CREDIT' : 'PAID',
        localId,
        ...(labJob ? { labJob } : {}),
      });
      await refreshPendingCount();
      onReceipt({ localId, localRef });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The sale could not be completed.');
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
        {offline ? (
          <Text style={styles.banner}>Offline — invoice will sync when connected</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => openCustomers(null)}
          style={styles.customer}
        >
          <Text style={styles.customerName}>{customer?.name ?? 'Select customer'}</Text>
          {customer ? (
            <Text style={creditOwed(customer.outstanding) ? styles.chipDue : styles.chipClear}>
              {creditLabel(customer.outstanding)}
            </Text>
          ) : null}
        </Pressable>
        <SearchBar onChange={setQuery} placeholder="Name, brand, or product code" value={query} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {chips.map((product) => (
            <Pressable key={product.id} onPress={() => addProduct(product)} style={styles.chip}>
              <Text style={styles.chipText}>{product.productName}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {results.map((product) => (
          <Pressable key={product.id} onPress={() => addProduct(product)} style={styles.card}>
            <Text style={styles.code}>{product.priceCode}</Text>
            <Text style={styles.name}>{product.productName}</Text>
            <Text style={styles.meta}>₨ {product.salePrice}</Text>
            <Text style={product.lowStock ? styles.low : styles.meta}>
              Stock {product.stockQty}
            </Text>
          </Pressable>
        ))}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      {lines.length > 0 ? (
        <CartScreen
          canComplete={Boolean(customer) && lines.length > 0}
          discount={totals.discount}
          discountMode={discountMode}
          discountValue={discountValue}
          expanded={cartOpen}
          itemCount={itemCount}
          lines={lines}
          onChangePrice={(inventoryBatchId, unitPrice) =>
            setLines((current) =>
              current.map((line) =>
                line.inventoryBatchId === inventoryBatchId ? { ...line, unitPrice } : line,
              ),
            )
          }
          onChangeQty={(inventoryBatchId, delta) =>
            setLines((current) =>
              current.map((line) =>
                line.inventoryBatchId === inventoryBatchId
                  ? { ...line, quantity: nextQuantity(line.quantity, delta) }
                  : line,
              ),
            )
          }
          onComplete={() => {
            void complete();
          }}
          onDiscountMode={setDiscountMode}
          onDiscountValue={setDiscountValue}
          onExpanded={setCartOpen}
          onPayment={setPayment}
          onRemove={(inventoryBatchId) =>
            setLines((current) =>
              current.filter((line) => line.inventoryBatchId !== inventoryBatchId),
            )
          }
          payment={payment}
          subtotal={totals.subtotal}
          total={totals.total}
          extra={
            <View>
              <Pressable
                onPress={() => {
                  setEditingRx(true);
                  if (!labJob && labs[0]) {
                    setLabJob({
                      labOrgId: labs[0].id,
                      referenceNumber: makeLabReference(),
                      right: emptyEye,
                      left: emptyEye,
                      add: '',
                      pd: '',
                      notes: '',
                      frameType: '',
                      frameMaterial: '',
                      eyeSize: '',
                      specialInstructions: '',
                    });
                  }
                }}
                style={styles.secondary}
              >
                <Text style={styles.payText}>
                  {labJob ? labJob.referenceNumber : 'Add Lab Prescription'}
                </Text>
              </Pressable>
              {editingRx && labJob ? (
                <View style={styles.card}>
                  {labs.map((lab) => (
                    <Pressable
                      key={lab.id}
                      onPress={() => setLabJob({ ...labJob, labOrgId: lab.id })}
                      style={styles.step}
                    >
                      <Text style={labJob.labOrgId === lab.id ? styles.code : styles.payText}>
                        {lab.name}
                      </Text>
                    </Pressable>
                  ))}
                  <RxFields
                    label="Right"
                    eye={labJob.right}
                    onChange={(right) => setLabJob({ ...labJob, right })}
                  />
                  <RxFields
                    label="Left"
                    eye={labJob.left}
                    onChange={(left) => setLabJob({ ...labJob, left })}
                  />
                  <TextInput
                    value={labJob.notes}
                    onChangeText={(notes) => setLabJob({ ...labJob, notes })}
                    placeholder="Notes"
                    placeholderTextColor={colors.ink3}
                    style={styles.input}
                  />
                  <Pressable
                    onPress={() => {
                      void (async () => {
                        const online = await NetInfo.fetch();
                        if (online.isConnected && customer) {
                          try {
                            await createLabJob({ ...labJob, patientName: customer.name });
                          } catch {
                            // The sale still creates the job when the invoice is saved.
                          }
                        }
                        setEditingRx(false);
                      })();
                    }}
                    style={styles.secondary}
                  >
                    <Text style={styles.payText}>Attach to invoice</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          }
        />
      ) : null}
      {pickingCustomer ? (
        <View style={styles.sheetFill}>
          <Pressable
            accessibilityLabel="Dismiss"
            onPress={() => setPickingCustomer(false)}
            style={styles.backdrop}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select customer</Text>
            {customerHint ? <Text style={styles.hint}>{customerHint}</Text> : null}
            <SearchBar
              onChange={(value) => {
                setCustomerQuery(value);
                void loadCustomers(value, offline).then(setCustomers);
              }}
              placeholder="Name or phone"
              value={customerQuery}
            />
            <ScrollView style={styles.sheetList}>
              {customers.map((entry) => (
                <Pressable
                  key={entry.id}
                  onPress={() => {
                    setCustomer(entry);
                    setPickingCustomer(false);
                    setCustomerHint(null);
                  }}
                  style={styles.card}
                >
                  <Text style={styles.name}>{entry.name}</Text>
                  <Text style={styles.meta}>{creditLabel(entry.outstanding)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function RxFields({
  label,
  eye,
  onChange,
}: {
  label: string;
  eye: LabPrescription['right'];
  onChange: (eye: LabPrescription['right']) => void;
}): ReactElement {
  return (
    <View>
      <Text style={styles.meta}>{label} Sphere / Cyl / Axis</Text>
      <View style={styles.row}>
        <TextInput
          value={eye.sphere}
          onChangeText={(sphere) => onChange({ ...eye, sphere })}
          style={styles.input}
        />
        <TextInput
          value={eye.cylinder}
          onChangeText={(cylinder) => onChange({ ...eye, cylinder })}
          style={styles.input}
        />
        <TextInput
          value={eye.axis}
          onChangeText={(axis) => onChange({ ...eye, axis })}
          style={styles.input}
        />
      </View>
    </View>
  );
}

function creditOwed(outstanding: string): boolean {
  return moneyToCents(outstanding || '0') > 0;
}

function creditLabel(outstanding: string): string {
  return creditOwed(outstanding) ? `Credit ₨ ${outstanding}` : 'No credit due';
}

async function loadCatalog(query: string, offline: boolean): Promise<InventorySearchHit[]> {
  if (!offline) {
    return searchMobileInventory(query).catch(() => []);
  }
  const catalog = await readLocalCatalog().catch(() => ({ customers: [], batches: [] }));
  const needle = query.trim().toLowerCase();
  return catalog.batches
    .filter((batch) => {
      if (!needle) {
        return true;
      }
      return (
        batch.productName.toLowerCase().includes(needle) ||
        batch.priceCode.toLowerCase().includes(needle) ||
        batch.category.toLowerCase().includes(needle)
      );
    })
    .slice(0, 24)
    .map((batch) => ({
      id: batch.id,
      priceCode: batch.priceCode,
      productName: batch.productName,
      brand: null,
      category: batch.category,
      salePrice: batch.salePrice,
      stockQty: batch.stockQty,
      lowStock: batch.stockQty <= batch.lowStockThreshold,
    }));
}

async function loadCustomers(query: string, offline: boolean): Promise<CustomerSearchHit[]> {
  if (!offline) {
    return searchMobileCustomers(query).catch(() => []);
  }
  const catalog = await readLocalCatalog().catch(() => ({ customers: [], batches: [] }));
  const needle = query.trim().toLowerCase();
  return catalog.customers
    .filter((entry) => {
      if (!needle) {
        return true;
      }
      return entry.name.toLowerCase().includes(needle) || (entry.phone ?? '').includes(needle);
    })
    .slice(0, 15)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      phone: entry.phone,
      whatsappNumber: null,
      gender: null,
      dateOfBirth: null,
      referredBy: null,
      creditLimit: entry.creditLimit,
      outstanding: '0.00',
      lastPurchaseAt: null,
    }));
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  content: { gap: 12, padding: 16, paddingBottom: 24 },
  back: { justifyContent: 'center', minHeight: 44 },
  link: { color: colors.blue, fontSize: 16 },
  banner: {
    backgroundColor: colors.amberSoft,
    borderRadius: 8,
    color: colors.amber,
    fontSize: 14,
    padding: 12,
  },
  customer: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 12,
  },
  customerName: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '600' },
  chipDue: {
    backgroundColor: colors.amberSoft,
    borderRadius: 999,
    color: colors.amber,
    fontSize: 13,
    fontWeight: '600',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipClear: {
    backgroundColor: colors.tealSoft,
    borderRadius: 999,
    color: colors.teal,
    fontSize: 13,
    fontWeight: '600',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chips: { gap: 8 },
  chip: {
    backgroundColor: colors.blueSoft,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  chipText: { color: colors.blue, fontSize: 14, fontWeight: '600' },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  code: { color: colors.blue, fontSize: 16, fontWeight: '600' },
  name: { color: colors.ink, fontSize: 15 },
  meta: { color: colors.ink3, fontSize: 14 },
  low: { color: colors.amber, fontSize: 14 },
  error: { color: colors.red, fontSize: 14 },
  secondary: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  payText: { color: colors.ink2, fontSize: 15 },
  step: { justifyContent: 'center', minHeight: 44 },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  row: { flexDirection: 'row', gap: 8 },
  sheetFill: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 32, 64, 0.4)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 8,
    maxHeight: '70%',
    padding: 16,
  },
  sheetTitle: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  hint: { color: colors.amber, fontSize: 15 },
  sheetList: { maxHeight: 320 },
});
