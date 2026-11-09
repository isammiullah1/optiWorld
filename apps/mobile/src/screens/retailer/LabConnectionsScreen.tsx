import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ConnectionStatus, LabConnection, LabSearchHit } from '@optiworld/shared';

import { connectLab, loadLabConnections, searchLabs } from '../../services/lab-jobs';
import { colors } from '../../theme/colors';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  APPROVED: 'Accepted',
  PENDING: 'Pending',
  REJECTED: 'Declined',
};

export function LabConnectionsScreen({ onBack }: { onBack: () => void }): React.ReactElement {
  const [labs, setLabs] = useState<LabConnection[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<LabSearchHit[]>([]);
  const [lookedUp, setLookedUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadLabConnections()
      .then(setLabs)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Laboratories could not be loaded'),
      );
  }, []);

  function lookup(): void {
    const term = query.trim();
    if (term.length < 3) {
      setHits([]);
      setLookedUp(false);
      setError('Enter the exact username or ID.');
      return;
    }
    void searchLabs(term)
      .then((next) => {
        setHits(next);
        setLookedUp(true);
        setError(null);
      })
      .catch((caught: unknown) => {
        setHits([]);
        setLookedUp(false);
        setError(caught instanceof Error ? caught.message : 'The laboratory could not be found');
      });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Laboratories</Text>
      <Text style={styles.meta}>A laboratory receives jobs only after it accepts the request.</Text>
      <TextInput
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          setHits([]);
          setLookedUp(false);
        }}
        placeholder="Exact username or ID"
        placeholderTextColor={colors.ink3}
        style={styles.input}
        autoCapitalize="none"
      />
      <Pressable onPress={lookup} style={styles.action}>
        <Text style={styles.actionText}>Find laboratory</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {hits.map((hit) => (
        <View key={hit.id} style={styles.card}>
          <Text style={styles.name}>{hit.name}</Text>
          <Text style={styles.meta}>{hit.city ?? 'Location not set'}</Text>
          {hit.connectionStatus === 'PENDING' || hit.connectionStatus === 'APPROVED' ? (
            <Text style={styles.meta}>{STATUS_LABEL[hit.connectionStatus]}</Text>
          ) : (
            <Pressable
              style={styles.back}
              onPress={() => {
                void connectLab(hit.id)
                  .then(() => loadLabConnections())
                  .then((next) => {
                    setLabs(next);
                    setHits((current) =>
                      current.map((row) =>
                        row.id === hit.id ? { ...row, connectionStatus: 'PENDING' } : row,
                      ),
                    );
                  })
                  .catch((caught: unknown) =>
                    setError(
                      caught instanceof Error ? caught.message : 'The request could not be sent',
                    ),
                  );
              }}
            >
              <Text style={styles.link}>Send request</Text>
            </Pressable>
          )}
        </View>
      ))}
      {lookedUp && hits.length === 0 ? (
        <Text style={styles.meta}>No laboratory matches that username or ID.</Text>
      ) : null}
      {labs.map((lab) => (
        <View key={lab.id} style={styles.card}>
          <Text style={styles.name}>{lab.name}</Text>
          <Text style={styles.meta}>{lab.city ?? 'Location not set'}</Text>
          <Text style={styles.meta}>{STATUS_LABEL[lab.status]}</Text>
          {lab.status === 'APPROVED' ? (
            <Text style={styles.meta}>
              {lab.activeJobs} active ·{' '}
              {lab.averageTurnaroundDays === null
                ? 'No turnaround yet'
                : `${lab.averageTurnaroundDays} days`}
            </Text>
          ) : null}
        </View>
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
    paddingHorizontal: 12,
    backgroundColor: colors.white,
    color: colors.ink,
  },
  action: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: colors.white, fontSize: 16, fontWeight: '600' },
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
