import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { WholesalerConnectionLists, WholesalerRetailerConnection } from '@optiworld/shared';

import {
  AppHeader,
  EmptyState,
  SearchBar,
  SkeletonCard,
  StatusBadge,
} from '../../components/shared';
import { loadWholesalerRetailers } from '../../services/mobile-directory';
import { colors } from '../../theme/colors';

const VISIBILITY: Record<WholesalerRetailerConnection['visibilityMode'], string> = {
  FULL: 'Full catalog',
  PRICES_HIDDEN: 'Prices hidden',
  CATALOG_HIDDEN: 'Catalog hidden',
};

export function RetailersScreen(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [lists, setLists] = useState<WholesalerConnectionLists | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setLists(await loadWholesalerRetailers());
      setError(null);
    } catch (caught) {
      setLists({ connected: [], pending: [], declined: [] });
      setError(caught instanceof Error ? caught.message : 'Retailers could not be loaded');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const needle = query.trim().toLowerCase();
  const match = (row: WholesalerRetailerConnection): boolean =>
    `${row.retailerName} ${row.city ?? ''}`.toLowerCase().includes(needle);

  return (
    <View style={styles.screen}>
      <AppHeader title="Retailers" />
      <ScrollView contentContainerStyle={styles.content}>
        <SearchBar onChange={setQuery} placeholder="Search retailers" value={query} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {lists === null ? <SkeletonCard /> : null}
        {lists ? <Section rows={lists.connected.filter(match)} title="Connected" /> : null}
        {lists ? <Section rows={lists.pending.filter(match)} title="Pending" /> : null}
        {lists ? <Section rows={lists.declined.filter(match)} title="Declined" /> : null}
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  rows,
}: {
  title: string;
  rows: WholesalerRetailerConnection[];
}): React.ReactElement {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {rows.length === 0 ? (
        <EmptyState
          description="Nothing in this list."
          title={`No ${title.toLowerCase()} retailers`}
        />
      ) : null}
      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.name}>{row.retailerName}</Text>
            <StatusBadge status={row.status} />
          </View>
          <Text style={styles.detail}>
            {row.city ?? 'City not set'} · {VISIBILITY[row.visibilityMode]} · {row.orderCount}{' '}
            orders
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  content: { gap: 12, padding: 12 },
  error: { color: colors.red, fontSize: 14 },
  section: { gap: 8 },
  heading: { color: colors.ink3, fontSize: 13, fontWeight: '600', letterSpacing: 0.6 },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '600' },
  detail: { color: colors.ink2, fontSize: 14, marginTop: 4 },
});
