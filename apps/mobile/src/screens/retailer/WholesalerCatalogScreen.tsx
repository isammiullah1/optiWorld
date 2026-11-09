import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { WholesalerCatalog } from '@optiworld/shared';

import {
  CatalogRequestError,
  loadWholesalerCatalog,
  submitRetailerOrder,
} from '../../services/catalog-orders';
import { colors } from '../../theme/colors';

type Draft = { id: string; name: string; listedPrice: string | null; quantity: string };

export function WholesalerCatalogScreen({
  wholesalerId,
  onBack,
  onOrdered,
}: {
  wholesalerId: string;
  onBack: () => void;
  onOrdered: (orderId: string) => void;
}): React.ReactElement {
  const [catalog, setCatalog] = useState<WholesalerCatalog | null>(null);
  const [hidden, setHidden] = useState(false);
  const [category, setCategory] = useState('All');
  const [lines, setLines] = useState<Draft[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadWholesalerCatalog(wholesalerId)
      .then(setCatalog)
      .catch((caught: unknown) => {
        if (caught instanceof CatalogRequestError && caught.code === 'CONNECTION_REQUIRED') {
          onBack();
          return;
        }
        if (caught instanceof CatalogRequestError && caught.code === 'CATALOG_HIDDEN') {
          setHidden(true);
          return;
        }
        setError(caught instanceof Error ? caught.message : 'This catalog could not be loaded');
      });
  }, [onBack, wholesalerId]);

  if (hidden) {
    return (
      <View style={styles.pad}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Catalog not available — contact wholesaler directly</Text>
      </View>
    );
  }

  const categories = [
    'All',
    ...new Set(catalog?.products.map((product) => product.category) ?? []),
  ];
  const products =
    catalog?.products.filter((product) => category === 'All' || product.category === category) ??
    [];
  const total =
    catalog?.pricesVisible && lines.length > 0 && lines.every((line) => line.listedPrice)
      ? lines
          .reduce((sum, line) => sum + Number(line.listedPrice) * Number(line.quantity || 0), 0)
          .toFixed(2)
      : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      <Text style={styles.title}>{catalog?.wholesaler.name ?? 'Catalog'}</Text>
      <Text style={styles.meta}>{catalog?.wholesaler.city ?? 'City not set'}</Text>
      <Text style={styles.meta}>{catalog?.wholesaler.phone ?? 'No contact number'}</Text>
      {catalog?.wholesaler.whatsappNumber ? (
        <Text style={styles.meta}>WhatsApp {catalog.wholesaler.whatsappNumber}</Text>
      ) : null}
      <Text style={styles.meta}>About us</Text>
      <Text style={styles.name}>{catalog?.wholesaler.listingProfileNotes?.trim() || '—'}</Text>
      <ScrollView horizontal contentContainerStyle={styles.tabs}>
        {categories.map((name) => (
          <Pressable
            key={name}
            onPress={() => setCategory(name)}
            style={[styles.chip, category === name && styles.chipOn]}
          >
            <Text style={category === name ? styles.chipOnText : styles.meta}>{name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {products.map((product) => (
        <View key={product.id} style={styles.card}>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.meta}>
            {product.listedPrice ? `₨ ${product.listedPrice}` : 'Price on request'}
          </Text>
          <Pressable
            style={styles.back}
            onPress={() =>
              setLines((current) =>
                current.some((line) => line.id === product.id)
                  ? current
                  : [
                      ...current,
                      {
                        id: product.id,
                        name: product.name,
                        listedPrice: product.listedPrice,
                        quantity: '1',
                      },
                    ],
              )
            }
          >
            <Text style={styles.link}>Add to order</Text>
          </Pressable>
        </View>
      ))}
      <Text style={styles.title}>Order</Text>
      {lines.map((line) => (
        <View key={line.id} style={styles.card}>
          <Text style={styles.name}>{line.name}</Text>
          <TextInput
            value={line.quantity}
            keyboardType="number-pad"
            onChangeText={(value) =>
              setLines((current) =>
                current.map((item) =>
                  item.id === line.id ? { ...item, quantity: value.replace(/\D/g, '') } : item,
                ),
              )
            }
            style={styles.input}
          />
        </View>
      ))}
      <Text style={styles.meta}>
        {total ? `Total ₨ ${total}` : 'Prices are on request when hidden.'}
      </Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Notes"
        placeholderTextColor={colors.ink3}
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={styles.primary}
        onPress={() => {
          if (!catalog || lines.length === 0) {
            return;
          }
          void submitRetailerOrder({
            wholesalerOrgId: catalog.wholesaler.id,
            notes: notes.trim() || undefined,
            items: lines.map((line) => ({
              catalogProductId: line.id,
              quantity: Math.max(1, Number(line.quantity) || 1),
            })),
          })
            .then(onOrdered)
            .catch((caught: unknown) =>
              setError(
                caught instanceof Error ? caught.message : 'The order could not be submitted',
              ),
            );
        }}
      >
        <Text style={styles.primaryText}>Submit order</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 12 },
  pad: { flex: 1, backgroundColor: colors.canvas, padding: 16 },
  back: { minHeight: 44, justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  name: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.ink3, fontSize: 14 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 4,
  },
  tabs: { gap: 8 },
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
  error: { color: colors.red, fontSize: 15 },
});
