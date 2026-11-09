import 'react-native-gesture-handler';

import { useEffect, useRef, type ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import { ErrorBoundary } from './src/components/shared';
import { RootNavigator } from './src/navigation/RootNavigator';
import { SessionProvider, useSessionValue } from './src/navigation/session';
import { pullLatestData, syncPendingInvoices } from './src/services/syncService';
import { useConnectivityStore } from './src/store/connectivity.store';

enableScreens();

export default function App(): ReactElement {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <SessionProvider>
            <ConnectivityHost />
            <RootNavigator />
          </SessionProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ConnectivityHost(): null {
  const orgType = useSessionValue().user?.orgType;
  const setOnline = useConnectivityStore((state) => state.setOnline);
  const refreshPendingCount = useConnectivityStore((state) => state.refreshPendingCount);
  const wasOnline = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function syncRetailer(): Promise<void> {
      if (orgType !== 'RETAILER') {
        return;
      }
      try {
        await syncPendingInvoices();
        await pullLatestData();
      } catch {
        // Invoices stay on the device until the next connection.
      }
      if (!cancelled) {
        await refreshPendingCount();
      }
    }

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true;
      setOnline(online);
      if (online && !wasOnline.current) {
        void syncRetailer();
      } else if (!online && orgType === 'RETAILER') {
        void refreshPendingCount();
      }
      wasOnline.current = online;
    });

    void NetInfo.fetch().then((state) => {
      const online = state.isConnected === true;
      setOnline(online);
      wasOnline.current = online;
      if (online) {
        void syncRetailer();
      } else if (orgType === 'RETAILER') {
        void refreshPendingCount();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [orgType, refreshPendingCount, setOnline]);

  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
