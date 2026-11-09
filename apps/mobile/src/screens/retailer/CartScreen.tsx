import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors } from '../../theme/colors';

export type CartLine = {
  inventoryBatchId: string;
  priceCode: string;
  productName: string;
  unitPrice: string;
  quantity: number;
};

const MAX_QUANTITY = 10_000;

type CartScreenProps = {
  lines: CartLine[];
  itemCount: number;
  total: string;
  subtotal: string;
  discount: string;
  discountMode: 'AMOUNT' | 'PERCENT';
  discountValue: string;
  payment: 'CASH' | 'CREDIT';
  expanded: boolean;
  canComplete: boolean;
  onExpanded: (expanded: boolean) => void;
  onChangeQty: (inventoryBatchId: string, delta: number) => void;
  onChangePrice: (inventoryBatchId: string, unitPrice: string) => void;
  onRemove: (inventoryBatchId: string) => void;
  onDiscountMode: (mode: 'AMOUNT' | 'PERCENT') => void;
  onDiscountValue: (value: string) => void;
  onPayment: (payment: 'CASH' | 'CREDIT') => void;
  onComplete: () => void;
  extra?: ReactNode;
};

export function CartScreen(props: CartScreenProps): ReactElement {
  const height = useRef(new Animated.Value(88)).current;
  const onExpandedRef = useRef(props.onExpanded);
  onExpandedRef.current = props.onExpanded;

  useEffect(() => {
    Animated.timing(height, {
      toValue: props.expanded ? 460 : 88,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [height, props.expanded]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 8,
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy < -24) {
          onExpandedRef.current(true);
        } else if (gesture.dy > 24) {
          onExpandedRef.current(false);
        }
      },
    }),
  ).current;

  const saleColor = props.payment === 'CREDIT' ? colors.amber : colors.teal;

  return (
    <Animated.View style={[styles.sheet, { height }]}>
      <View {...pan.panHandlers} style={styles.handleWrap}>
        <View style={styles.handle} />
        <View style={styles.summary}>
          <View>
            <Text style={styles.count}>
              {props.itemCount} {props.itemCount === 1 ? 'item' : 'items'}
            </Text>
            <Text style={styles.total}>₨ {props.total}</Text>
          </View>
          {props.expanded ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={() => props.onExpanded(true)}
              style={[styles.complete, { backgroundColor: saleColor }]}
            >
              <Text style={styles.completeText}>Complete</Text>
            </Pressable>
          )}
        </View>
      </View>
      {props.expanded ? (
        <ScrollView contentContainerStyle={styles.body}>
          {props.lines.map((line) => (
            <View key={line.inventoryBatchId} style={styles.line}>
              <Text style={styles.name}>{line.productName}</Text>
              <Text style={styles.code}>{line.priceCode}</Text>
              <View style={styles.row}>
                <Pressable
                  accessibilityLabel="Decrease quantity"
                  onPress={() => props.onChangeQty(line.inventoryBatchId, -1)}
                  style={styles.step}
                >
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <Text style={styles.qty}>{line.quantity}</Text>
                <Pressable
                  accessibilityLabel="Increase quantity"
                  onPress={() => props.onChangeQty(line.inventoryBatchId, 1)}
                  style={styles.step}
                >
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
                <TextInput
                  keyboardType="decimal-pad"
                  onChangeText={(value) => props.onChangePrice(line.inventoryBatchId, value)}
                  style={styles.price}
                  value={line.unitPrice}
                />
                <Pressable
                  accessibilityLabel="Remove item"
                  onPress={() => props.onRemove(line.inventoryBatchId)}
                  style={styles.step}
                >
                  <Text style={styles.remove}>×</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <Text style={styles.meta}>Subtotal ₨ {props.subtotal}</Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => props.onDiscountMode('AMOUNT')}
              style={[styles.mode, props.discountMode === 'AMOUNT' && styles.modeOn]}
            >
              <Text style={styles.stepText}>Amount</Text>
            </Pressable>
            <Pressable
              onPress={() => props.onDiscountMode('PERCENT')}
              style={[styles.mode, props.discountMode === 'PERCENT' && styles.modeOn]}
            >
              <Text style={styles.stepText}>%</Text>
            </Pressable>
            <TextInput
              keyboardType="decimal-pad"
              onChangeText={props.onDiscountValue}
              placeholder="Discount"
              placeholderTextColor={colors.ink3}
              style={styles.price}
              value={props.discountValue}
            />
          </View>
          <Text style={styles.meta}>Discount ₨ {props.discount}</Text>
          <View style={styles.payRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => props.onPayment('CASH')}
              style={[styles.pay, props.payment === 'CASH' && styles.cashOn]}
            >
              <Text style={props.payment === 'CASH' ? styles.payOnText : styles.payText}>Cash</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => props.onPayment('CREDIT')}
              style={[styles.pay, props.payment === 'CREDIT' && styles.creditOn]}
            >
              <Text style={props.payment === 'CREDIT' ? styles.payOnText : styles.payText}>
                Credit
              </Text>
            </Pressable>
          </View>
          {props.extra}
          <Pressable
            accessibilityRole="button"
            disabled={!props.canComplete}
            onPress={props.onComplete}
            style={[
              styles.sale,
              { backgroundColor: saleColor },
              !props.canComplete && styles.disabled,
            ]}
          >
            <Text style={styles.completeText}>Complete Sale · ₨ {props.total}</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </Animated.View>
  );
}

export function nextQuantity(current: number, delta: number): number {
  return Math.min(MAX_QUANTITY, Math.max(1, current + delta));
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.white,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  handleWrap: { paddingHorizontal: 16, paddingTop: 8 },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.line,
    borderRadius: 2,
    height: 4,
    width: 36,
  },
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  count: { color: colors.ink2, fontSize: 14 },
  total: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  complete: { borderRadius: 8, justifyContent: 'center', minHeight: 44, paddingHorizontal: 16 },
  completeText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  body: { gap: 8, padding: 16, paddingTop: 0 },
  line: { borderColor: colors.line, borderRadius: 12, borderWidth: 1, padding: 12 },
  name: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  code: { color: colors.blue, fontSize: 14, marginTop: 2 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
  step: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  stepText: { color: colors.ink2, fontSize: 18 },
  qty: { color: colors.ink, fontSize: 16, fontWeight: '600', minWidth: 24, textAlign: 'center' },
  price: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  remove: { color: colors.red, fontSize: 20 },
  meta: { color: colors.ink3, fontSize: 14 },
  mode: {
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 10,
  },
  modeOn: { backgroundColor: colors.blueSoft, borderColor: colors.blue },
  payRow: { flexDirection: 'row', gap: 8 },
  pay: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  cashOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  creditOn: { backgroundColor: colors.amber, borderColor: colors.amber },
  payText: { color: colors.ink2, fontSize: 18, fontWeight: '600' },
  payOnText: { color: colors.white, fontSize: 18, fontWeight: '600' },
  sale: { alignItems: 'center', borderRadius: 8, justifyContent: 'center', minHeight: 48 },
  disabled: { opacity: 0.5 },
});
