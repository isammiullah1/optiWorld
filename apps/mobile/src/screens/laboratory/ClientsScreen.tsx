import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LabRequestLists } from '@optiworld/shared';

import { DirectoryScreen } from '../shared/DirectoryScreen';
import {
  loadMobileLabClients,
  loadMobileLabRequests,
  respondToLabRequest,
} from '../../services/mobile-directory';
import { colors } from '../../theme/colors';

export function ClientsScreen(): ReactElement {
  const [requests, setRequests] = useState<LabRequestLists | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshRequests = useCallback(async (): Promise<void> => {
    try {
      setRequests(await loadMobileLabRequests());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Requests could not be loaded');
    }
  }, []);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  const load = useCallback(async () => {
    const clients = await loadMobileLabClients();
    return clients.map((client) => ({
      id: client.id,
      title: client.name,
      detail: `${client.type === 'OPTIWORLD' ? 'OptiWorld' : 'External'} · ${client.totalJobs} jobs`,
      status: client.type === 'OPTIWORLD' ? 'ACTIVE' : undefined,
    }));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {error ? <Text style={{ color: colors.red, padding: 16 }}>{error}</Text> : null}
      {requests?.pending.map((row) => (
        <View
          key={row.id}
          style={{
            margin: 16,
            marginBottom: 0,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.white,
          }}
        >
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.retailerName}</Text>
          <Text style={{ color: colors.ink3, marginTop: 4 }}>{row.city ?? 'Pending request'}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void respondToLabRequest(row.id, 'approve')
                  .then(refreshRequests)
                  .catch((caught: unknown) => {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : 'The request could not be accepted',
                    );
                  });
              }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.blue }}>Accept</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void respondToLabRequest(row.id, 'decline')
                  .then(refreshRequests)
                  .catch((caught: unknown) => {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : 'The request could not be declined',
                    );
                  });
              }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.red }}>Decline</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <DirectoryScreen
        emptyDescription="Accepted shops and walk-in clients appear here."
        emptyTitle="No clients yet"
        load={load}
        title="Clients"
      />
    </View>
  );
}
