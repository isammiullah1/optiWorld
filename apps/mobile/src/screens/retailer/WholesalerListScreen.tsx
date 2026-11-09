import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { WholesalerConnection, WholesalerSearchHit } from '@optiworld/shared';

import {
  loadWholesalerConnections,
  requestWholesalerConnection,
  searchWholesalerOrgs,
} from '../../services/catalog-orders';
import { colors } from '../../theme/colors';

export function WholesalerListScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (wholesalerId: string) => void;
}): React.ReactElement {
  const [rows, setRows] = useState<WholesalerConnection[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<WholesalerSearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh(): void {
    void loadWholesalerConnections()
      .then(setRows)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Connections could not be loaded'),
      );
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Wholesalers</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Exact username or ID"
        placeholderTextColor={colors.ink3}
        style={styles.input}
      />
      <Pressable
        style={styles.primary}
        onPress={() => {
          if (query.trim().length < 3) {
            return;
          }
          void searchWholesalerOrgs(query.trim())
            .then(setHits)
            .catch((caught: unknown) =>
              setError(caught instanceof Error ? caught.message : 'Search failed'),
            );
        }}
      >
        <Text style={styles.primaryText}>Find wholesaler</Text>
      </Pressable>
      {hits.map((hit) => (
        <View key={hit.id} style={styles.card}>
          <Text style={styles.name}>{hit.name}</Text>
          <Text style={styles.meta}>{hit.city ?? 'No city'}</Text>
          {hit.connectionStatus ? (
            <Text style={styles.meta}>{hit.connectionStatus}</Text>
          ) : (
            <Pressable
              style={styles.back}
              onPress={() => {
                void requestWholesalerConnection(hit.id)
                  .then(() => refresh())
                  .catch((caught: unknown) =>
                    setError(caught instanceof Error ? caught.message : 'Request failed'),
                  );
              }}
            >
              <Text style={styles.link}>Send request</Text>
            </Pressable>
          )}
        </View>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows.map((row) => (
        <Pressable
          key={row.id}
          style={styles.card}
          onPress={() => {
            if (row.status === 'APPROVED') {
              onOpen(row.wholesalerOrgId);
            }
          }}
        >
          <Text style={styles.name}>{row.wholesalerName}</Text>
          <Text style={styles.meta}>
            {row.phone ?? 'No phone'} · {row.status}
          </Text>
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
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  name: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.ink3, fontSize: 14, marginTop: 4 },
  link: { color: colors.blue, fontSize: 16 },
  error: { color: colors.red, fontSize: 15 },
});
