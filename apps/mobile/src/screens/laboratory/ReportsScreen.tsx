import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LabJobActivity } from '@optiworld/shared';

import { AppHeader, SkeletonCard } from '../../components/shared';
import { loadMobileLabActivity, recentUtcRange } from '../../services/mobile-directory';
import { colors } from '../../theme/colors';

export function ReportsScreen(): React.ReactElement {
  const [data, setData] = useState<LabJobActivity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const range = recentUtcRange(30);
    try {
      setData(await loadMobileLabActivity(range.from, range.to));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Job activity could not be loaded');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const received = data?.days.reduce((sum, day) => sum + day.received, 0) ?? 0;
  const completed = data?.days.reduce((sum, day) => sum + day.completed, 0) ?? 0;

  return (
    <View style={styles.screen}>
      <AppHeader title="Reports" />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!data && !error ? <SkeletonCard /> : null}
        {data ? (
          <View style={styles.grid}>
            <Count label="Received" value={received} />
            <Count label="Completed" value={completed} />
          </View>
        ) : null}
        <Text style={styles.footer}>
          Counts for the last 30 days. Financial data stays outside OptiWorld.
        </Text>
      </ScrollView>
    </View>
  );
}

function Count({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <View style={styles.count}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  content: { gap: 8, padding: 12 },
  error: { color: colors.red, fontSize: 14 },
  grid: { flexDirection: 'row', gap: 8 },
  count: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: 12,
  },
  value: { color: colors.ink, fontSize: 24, fontWeight: '600' },
  label: { color: colors.ink3, fontSize: 13, marginTop: 4 },
  footer: { color: colors.ink3, fontSize: 14 },
});
