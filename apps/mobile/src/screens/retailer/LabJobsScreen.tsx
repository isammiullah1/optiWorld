import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { JOB_STATUSES, type LabJobRow } from '@optiworld/shared';

import { loadLabJobs } from '../../services/lab-jobs';
import { colors } from '../../theme/colors';

const FILTERS = ['ALL', ...JOB_STATUSES] as const;

export function LabJobsScreen({
  onBack,
  onOpen,
  onLabs,
}: {
  onBack: () => void;
  onOpen: (jobId: string) => void;
  onLabs: () => void;
}): React.ReactElement {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL');
  const [rows, setRows] = useState<LabJobRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadLabJobs({ status: filter })
      .then(setRows)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Lab jobs could not be loaded'),
      );
  }, [filter]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      <View style={styles.header}>
        <Text style={styles.title}>Lab jobs</Text>
        <Pressable onPress={onLabs} style={styles.back}>
          <Text style={styles.link}>Labs</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        {FILTERS.map((status) => (
          <Pressable
            key={status}
            onPress={() => setFilter(status)}
            style={[styles.chip, filter === status && styles.chipOn]}
          >
            <Text style={filter === status ? styles.chipOnText : styles.meta}>
              {status === 'ALL' ? 'All' : status}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {rows.map((row) => (
        <Pressable key={row.id} style={styles.card} onPress={() => onOpen(row.id)}>
          <Text style={styles.name}>{row.referenceNumber}</Text>
          <Text style={styles.meta}>
            {row.patientName} · {row.labName}
          </Text>
          <Text style={styles.meta}>{row.status}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { minHeight: 44, justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
