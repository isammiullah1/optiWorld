import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineBanner } from '../components/shared';
import { useConnectivityStore } from '../store/connectivity.store';
import { colors } from '../theme/colors';

export function OrgShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const isOnline = useConnectivityStore((state) => state.isOnline);
  return (
    <View style={styles.screen}>
      {isOnline ? null : (
        <SafeAreaView edges={['top']} style={styles.banner}>
          <OfflineBanner />
        </SafeAreaView>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  banner: { backgroundColor: colors.amber },
});
