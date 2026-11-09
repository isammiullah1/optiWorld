import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  EmptyState,
  SearchBar,
  SkeletonCard,
  StatusBadge,
} from '../../components/shared';
import { colors } from '../../theme/colors';

export type DirectoryRow = {
  id: string;
  title: string;
  detail: string;
  status?: string;
};

type DirectoryScreenProps = {
  title?: string;
  load: () => Promise<DirectoryRow[]>;
  emptyTitle: string;
  emptyDescription: string;
  onOpen?: (id: string) => void;
};

export function DirectoryScreen({
  title,
  load,
  emptyTitle,
  emptyDescription,
  onOpen,
}: DirectoryScreenProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<DirectoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setRows(await load());
    } catch (caught) {
      setRows([]);
      setError(caught instanceof Error ? caught.message : 'This list could not be loaded');
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = (rows ?? []).filter((row) => {
    const haystack = `${row.title} ${row.detail}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <View style={styles.screen}>
      {title ? <AppHeader title={title} /> : null}
      <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
        <SearchBar onChange={setQuery} placeholder="Search" value={query} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {rows === null ? (
          <View style={styles.gap}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}
        {rows && visible.length === 0 ? (
          <EmptyState description={emptyDescription} title={emptyTitle} />
        ) : null}
        {visible.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole={onOpen ? 'button' : undefined}
            onPress={onOpen ? () => onOpen(row.id) : undefined}
            style={styles.card}
          >
            <View style={styles.row}>
              <Text style={styles.title}>{row.title}</Text>
              {row.status ? <StatusBadge status={row.status} /> : null}
            </View>
            <Text style={styles.detail}>{row.detail}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  content: { gap: 8, padding: 12 },
  gap: { gap: 8 },
  error: { color: colors.red, fontSize: 14 },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  title: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '600' },
  detail: { color: colors.ink2, fontSize: 14, marginTop: 4 },
});
