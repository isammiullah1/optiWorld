import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/colors';

type SyncStatusBannerProps = {
  online: boolean;
  syncing?: boolean;
  pendingCount: number;
  reviewCount: number;
  conflictCount: number;
};

export function SyncStatusBanner({
  online,
  syncing = false,
  pendingCount,
  reviewCount,
  conflictCount,
}: SyncStatusBannerProps): React.ReactElement {
  const waiting = !online || pendingCount > 0;
  const title = syncing
    ? `Back online — syncing ${pendingCount} invoices...`
    : online
      ? 'Online'
      : `Offline — invoices saving locally | ${pendingCount} pending sync`;
  return (
    <View
      accessibilityRole="summary"
      style={[styles.banner, waiting ? styles.waiting : styles.ready]}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>
        {online
          ? 'Sales recorded here sync when the connection is available.'
          : `Offline — invoices saving locally | ${pendingCount} pending sync`}
      </Text>
      <Text style={styles.meta}>
        {pendingCount} waiting · {reviewCount} to review · {conflictCount} need attention
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  waiting: {
    backgroundColor: colors.amberSoft,
    borderColor: colors.amber,
  },
  ready: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.teal,
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  body: {
    color: colors.ink2,
    fontSize: 15,
    marginTop: 4,
  },
  meta: {
    color: colors.ink3,
    fontSize: 13,
    marginTop: 8,
  },
});
