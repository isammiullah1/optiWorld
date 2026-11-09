import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useConnectivityStore } from '../../store/connectivity.store';
import { colors } from '../../theme/colors';

type SyncStatusIconProps = {
  pendingCount?: number;
};

export function SyncStatusIcon({ pendingCount }: SyncStatusIconProps): React.ReactElement {
  const stored = useConnectivityStore((state) => state.pendingSyncCount);
  const count = pendingCount ?? stored;
  return (
    <View accessibilityLabel={`Bills, ${count} pending sync`} style={styles.wrap}>
      <Text style={styles.glyph}>B</Text>
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  glyph: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: colors.blue,
    borderRadius: 8,
    minWidth: 16,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -10,
    top: -6,
  },
  badgeText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
