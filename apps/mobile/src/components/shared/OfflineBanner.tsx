import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useConnectivityStore } from '../../store/connectivity.store';
import { colors } from '../../theme/colors';

export function OfflineBanner(): React.ReactElement | null {
  const isOnline = useConnectivityStore((state) => state.isOnline);
  const pendingSyncCount = useConnectivityStore((state) => state.pendingSyncCount);
  if (isOnline) {
    return null;
  }
  return (
    <View accessibilityRole="summary" style={styles.banner}>
      <Text style={styles.text}>Offline — {pendingSyncCount} invoices pending sync</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.amber,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
