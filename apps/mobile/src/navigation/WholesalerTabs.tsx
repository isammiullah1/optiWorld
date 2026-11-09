import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactElement,
} from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type NavigatorScreenParams,
  type RouteProp,
} from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { MoreMenu } from './MoreMenu';
import { OrgShell } from './OrgShell';
import { TabMark, tabScreenOptions } from './tab-options';
import { loadWholesalerShell } from '../services/mobile-directory';
import { CatalogListScreen } from '../screens/wholesaler/CatalogListScreen';
import { DashboardHomeScreen } from '../screens/wholesaler/DashboardHomeScreen';
import { OrderDetailScreen } from '../screens/wholesaler/OrderDetailScreen';
import { OrdersScreen } from '../screens/wholesaler/OrdersScreen';
import { ActivityScreen } from '../screens/wholesaler/ActivityScreen';
import { RetailersScreen } from '../screens/wholesaler/RetailersScreen';
import { AlertsScreen } from '../screens/shared/AlertsScreen';
import { SettingsScreen } from '../screens/shared/SettingsScreen';
import { colors } from '../theme/colors';

export type OrdersStackParamList = {
  Inbox: undefined;
  Detail: { orderId: string };
};

export type WholesalerMoreParamList = {
  Menu: undefined;
  Alerts: undefined;
  Reports: undefined;
  Settings: undefined;
};

export type WholesalerTabParamList = {
  Dashboard: undefined;
  Orders: NavigatorScreenParams<OrdersStackParamList>;
  Catalog: undefined;
  Retailers: undefined;
  More: NavigatorScreenParams<WholesalerMoreParamList>;
};

const RefreshPending = createContext<() => void>(() => undefined);
const Tabs = createBottomTabNavigator<WholesalerTabParamList>();
const Orders = createNativeStackNavigator<OrdersStackParamList>();
const More = createNativeStackNavigator<WholesalerMoreParamList>();
const stackOptions = { headerShown: false } as const;

export function WholesalerTabs(): ReactElement {
  const [pending, setPending] = useState(0);
  const refresh = useCallback(() => {
    void loadWholesalerShell()
      .then((shell) => setPending(shell.pendingOrderCount))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <RefreshPending.Provider value={refresh}>
      <OrgShell>
        <Tabs.Navigator screenOptions={tabScreenOptions}>
          <Tabs.Screen
            name="Dashboard"
            component={DashboardRoute}
            options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="Dashboard" /> }}
          />
          <Tabs.Screen
            name="Orders"
            component={OrdersStack}
            options={{
              tabBarBadge: pending > 0 ? pending : undefined,
              tabBarBadgeStyle: { backgroundColor: colors.blue, color: colors.white, fontSize: 12 },
              tabBarIcon: ({ color }) => <TabMark color={color} label="Orders" />,
            }}
          />
          <Tabs.Screen
            name="Catalog"
            component={CatalogListScreen}
            options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="Catalog" /> }}
          />
          <Tabs.Screen
            name="Retailers"
            component={RetailersScreen}
            options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="Retailers" /> }}
          />
          <Tabs.Screen
            name="More"
            component={MoreStack}
            options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="More" /> }}
          />
        </Tabs.Navigator>
      </OrgShell>
    </RefreshPending.Provider>
  );
}

function DashboardRoute(): ReactElement {
  const navigation = useNavigation<BottomTabNavigationProp<WholesalerTabParamList>>();
  return (
    <DashboardHomeScreen
      onOpenOrder={(orderId) =>
        navigation.navigate('Orders', { screen: 'Detail', params: { orderId } })
      }
    />
  );
}

function OrdersStack(): ReactElement {
  return (
    <Orders.Navigator screenOptions={stackOptions}>
      <Orders.Screen name="Inbox" component={InboxRoute} />
      <Orders.Screen name="Detail" component={DetailRoute} />
    </Orders.Navigator>
  );
}

function InboxRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList>>();
  const refresh = useContext(RefreshPending);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );
  return <OrdersScreen onOpen={(orderId) => navigation.navigate('Detail', { orderId })} />;
}

function DetailRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<OrdersStackParamList, 'Detail'>>();
  const route = useRoute<RouteProp<OrdersStackParamList, 'Detail'>>();
  return <OrderDetailScreen orderId={route.params.orderId} onBack={() => navigation.goBack()} />;
}

function MoreStack(): ReactElement {
  return (
    <More.Navigator screenOptions={stackOptions}>
      <More.Screen name="Menu" component={MoreMenuRoute} />
      <More.Screen name="Alerts" component={AlertsRoute} />
      <More.Screen name="Reports" component={ActivityScreen} />
      <More.Screen name="Settings" component={SettingsScreen} />
    </More.Navigator>
  );
}

function AlertsRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<WholesalerMoreParamList>>();
  const tabs = navigation.getParent<BottomTabNavigationProp<WholesalerTabParamList>>();
  return (
    <AlertsScreen
      onAction={(alert) => {
        if (alert.type.startsWith('ORDER_') && alert.relatedEntityId) {
          tabs?.navigate('Orders', {
            screen: 'Detail',
            params: { orderId: alert.relatedEntityId },
          });
        }
      }}
    />
  );
}

function MoreMenuRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<WholesalerMoreParamList>>();
  return (
    <MoreMenu
      items={[
        { label: 'Alerts', onPress: () => navigation.navigate('Alerts') },
        { label: 'Order activity', onPress: () => navigation.navigate('Reports') },
        { label: 'Settings', onPress: () => navigation.navigate('Settings') },
      ]}
    />
  );
}
