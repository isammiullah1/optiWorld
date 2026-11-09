import { useCallback, type ReactElement } from 'react';
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

import { SyncStatusIcon } from '../components/shared';
import { MoreMenu } from './MoreMenu';
import { OrgShell } from './OrgShell';
import { useSignedInUser } from './session';
import { TabMark, tabScreenOptions } from './tab-options';
import { useConnectivityStore } from '../store/connectivity.store';
import { CustomerListScreen } from '../screens/retailer/CustomerListScreen';
import { CustomerProfileScreen } from '../screens/retailer/CustomerProfileScreen';
import { DashboardScreen, type DashboardTarget } from '../screens/retailer/DashboardScreen';
import { InventoryScreen } from '../screens/retailer/InventoryScreen';
import { LabConnectionsScreen } from '../screens/retailer/LabConnectionsScreen';
import { LabJobScreen } from '../screens/retailer/LabJobScreen';
import { LabJobsScreen } from '../screens/retailer/LabJobsScreen';
import { POSScreen } from '../screens/retailer/POSScreen';
import { ReceiptScreen } from '../screens/retailer/ReceiptScreen';
import { RetailerOrderScreen } from '../screens/retailer/RetailerOrderScreen';
import { RetailerOrdersScreen } from '../screens/retailer/RetailerOrdersScreen';
import { AlertsScreen } from '../screens/shared/AlertsScreen';
import { WholesalerCatalogScreen } from '../screens/retailer/WholesalerCatalogScreen';
import { WholesalerListScreen } from '../screens/retailer/WholesalerListScreen';
import { SettingsScreen } from '../screens/shared/SettingsScreen';

export type BillsStackParamList = {
  POS: undefined;
  Receipt: { invoiceId?: string; localId?: string; localRef?: string };
};

export type CustomersStackParamList = {
  List: undefined;
  Profile: { customerId: string };
};

export type RetailerMoreParamList = {
  Menu: undefined;
  Alerts: undefined;
  Settings: undefined;
  Wholesalers: undefined;
  Catalog: { wholesalerId: string };
  Orders: undefined;
  Order: { orderId: string };
  Laboratories: undefined;
  LabJobs: undefined;
  LabJob: { jobId: string };
};

export type RetailerTabParamList = {
  Home: undefined;
  Bills: NavigatorScreenParams<BillsStackParamList>;
  Customers: NavigatorScreenParams<CustomersStackParamList>;
  Inventory: undefined;
  More: NavigatorScreenParams<RetailerMoreParamList>;
};

const Tabs = createBottomTabNavigator<RetailerTabParamList>();
const Bills = createNativeStackNavigator<BillsStackParamList>();
const Customers = createNativeStackNavigator<CustomersStackParamList>();
const More = createNativeStackNavigator<RetailerMoreParamList>();

const stackOptions = { headerShown: false } as const;

export function RetailerTabs(): ReactElement {
  return (
    <OrgShell>
      <Tabs.Navigator screenOptions={tabScreenOptions}>
        <Tabs.Screen
          name="Home"
          component={HomeRoute}
          options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="Home" /> }}
        />
        <Tabs.Screen
          name="Bills"
          component={BillsStack}
          options={{
            tabBarIcon: () => <SyncStatusIcon />,
          }}
        />
        <Tabs.Screen
          name="Customers"
          component={CustomersStack}
          options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="Customers" /> }}
        />
        <Tabs.Screen
          name="Inventory"
          component={InventoryScreen}
          options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="Inventory" /> }}
        />
        <Tabs.Screen
          name="More"
          component={MoreStack}
          options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="More" /> }}
        />
      </Tabs.Navigator>
    </OrgShell>
  );
}

function HomeRoute(): ReactElement {
  const navigation = useNavigation<BottomTabNavigationProp<RetailerTabParamList, 'Home'>>();
  const user = useSignedInUser();
  return (
    <DashboardScreen
      userName={user.name}
      onOpen={(target) => openDashboardTarget(navigation, target)}
    />
  );
}

function openDashboardTarget(
  navigation: BottomTabNavigationProp<RetailerTabParamList, 'Home'>,
  target: DashboardTarget,
): void {
  if (target === 'new-invoice') {
    navigation.navigate('Bills', { screen: 'POS' });
    return;
  }
  if (target === 'customers') {
    navigation.navigate('Customers', { screen: 'List' });
    return;
  }
  if (target === 'inventory') {
    navigation.navigate('Inventory');
    return;
  }
  if (target === 'alerts') {
    navigation.navigate('More', { screen: 'Alerts' });
    return;
  }
  if (target === 'jobs') {
    navigation.navigate('More', { screen: 'LabJobs' });
    return;
  }
  if (target === 'laboratories') {
    navigation.navigate('More', { screen: 'Laboratories' });
    return;
  }
  if (target === 'wholesalers') {
    navigation.navigate('More', { screen: 'Wholesalers' });
    return;
  }
  if (target === 'orders') {
    navigation.navigate('More', { screen: 'Orders' });
    return;
  }
  navigation.navigate('Bills', { screen: 'Receipt', params: { invoiceId: target.invoiceId } });
}

function BillsStack(): ReactElement {
  const refreshPendingCount = useConnectivityStore((state) => state.refreshPendingCount);
  useFocusEffect(
    useCallback(() => {
      void refreshPendingCount();
    }, [refreshPendingCount]),
  );
  return (
    <Bills.Navigator screenOptions={stackOptions}>
      <Bills.Screen name="POS" component={PosRoute} />
      <Bills.Screen name="Receipt" component={ReceiptRoute} />
    </Bills.Navigator>
  );
}

function PosRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<BillsStackParamList>>();
  const tabs = navigation.getParent<BottomTabNavigationProp<RetailerTabParamList>>();
  return (
    <POSScreen
      onBack={() => tabs?.navigate('Home')}
      onReceipt={(receipt) => navigation.navigate('Receipt', receipt)}
    />
  );
}

function ReceiptRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<BillsStackParamList, 'Receipt'>>();
  const route = useRoute<RouteProp<BillsStackParamList, 'Receipt'>>();
  return (
    <ReceiptScreen
      invoiceId={route.params?.invoiceId}
      localId={route.params?.localId}
      localRef={route.params?.localRef}
      onBack={() => navigation.navigate('POS')}
      onNewInvoice={() => navigation.navigate('POS')}
    />
  );
}

function CustomersStack(): ReactElement {
  return (
    <Customers.Navigator screenOptions={stackOptions}>
      <Customers.Screen name="List" component={CustomerListRoute} />
      <Customers.Screen name="Profile" component={CustomerProfileRoute} />
    </Customers.Navigator>
  );
}

function CustomerListRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<CustomersStackParamList>>();
  const tabs = navigation.getParent<BottomTabNavigationProp<RetailerTabParamList>>();
  return (
    <CustomerListScreen
      onBack={() => tabs?.navigate('Home')}
      onNewInvoice={() => tabs?.navigate('Bills', { screen: 'POS' })}
      onOpen={(customerId) => navigation.navigate('Profile', { customerId })}
    />
  );
}

function CustomerProfileRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<CustomersStackParamList, 'Profile'>>();
  const tabs = navigation.getParent<BottomTabNavigationProp<RetailerTabParamList>>();
  const route = useRoute<RouteProp<CustomersStackParamList, 'Profile'>>();
  const user = useSignedInUser();
  return (
    <CustomerProfileScreen
      customerId={route.params.customerId}
      isOwner={user.role === 'OWNER'}
      onBack={() => navigation.goBack()}
      onNewInvoice={() => tabs?.navigate('Bills', { screen: 'POS' })}
    />
  );
}

function MoreStack(): ReactElement {
  return (
    <More.Navigator screenOptions={stackOptions}>
      <More.Screen name="Menu" component={MoreMenuRoute} />
      <More.Screen name="Alerts" component={AlertsRoute} />
      <More.Screen name="Settings" component={SettingsScreen} />
      <More.Screen name="Wholesalers" component={WholesalersRoute} />
      <More.Screen name="Catalog" component={CatalogRoute} />
      <More.Screen name="Orders" component={OrdersRoute} />
      <More.Screen name="Order" component={OrderRoute} />
      <More.Screen name="Laboratories" component={LaboratoriesRoute} />
      <More.Screen name="LabJobs" component={LabJobsRoute} />
      <More.Screen name="LabJob" component={LabJobRoute} />
    </More.Navigator>
  );
}

function AlertsRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<RetailerMoreParamList>>();
  const tabs = navigation.getParent<BottomTabNavigationProp<RetailerTabParamList>>();
  return (
    <AlertsScreen
      onAction={(alert) => {
        if (alert.type === 'LOW_STOCK') {
          tabs?.navigate('Inventory');
          return;
        }
        if (alert.type.startsWith('ORDER_') && alert.relatedEntityId) {
          navigation.navigate('Order', { orderId: alert.relatedEntityId });
          return;
        }
        if (alert.type.startsWith('LAB_') && alert.relatedEntityId) {
          navigation.navigate('LabJob', { jobId: alert.relatedEntityId });
          return;
        }
        if (
          (alert.type === 'PAYMENT_DUE' || alert.type === 'PAYMENT_OVERDUE') &&
          alert.relatedEntityType === 'Customer' &&
          alert.relatedEntityId
        ) {
          tabs?.navigate('Customers', {
            screen: 'Profile',
            params: { customerId: alert.relatedEntityId },
          });
        }
      }}
    />
  );
}

function MoreMenuRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<RetailerMoreParamList>>();
  return (
    <MoreMenu
      items={[
        { label: 'Alerts', onPress: () => navigation.navigate('Alerts') },
        { label: 'Wholesalers', onPress: () => navigation.navigate('Wholesalers') },
        { label: 'Orders', onPress: () => navigation.navigate('Orders') },
        { label: 'Laboratories', onPress: () => navigation.navigate('Laboratories') },
        { label: 'Lab jobs', onPress: () => navigation.navigate('LabJobs') },
        { label: 'Settings', onPress: () => navigation.navigate('Settings') },
      ]}
    />
  );
}

function WholesalersRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<RetailerMoreParamList>>();
  return (
    <WholesalerListScreen
      onBack={() => navigation.goBack()}
      onOpen={(wholesalerId) => navigation.navigate('Catalog', { wholesalerId })}
    />
  );
}

function CatalogRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<RetailerMoreParamList, 'Catalog'>>();
  const route = useRoute<RouteProp<RetailerMoreParamList, 'Catalog'>>();
  return (
    <WholesalerCatalogScreen
      wholesalerId={route.params.wholesalerId}
      onBack={() => navigation.goBack()}
      onOrdered={(orderId) => navigation.navigate('Order', { orderId })}
    />
  );
}

function OrdersRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<RetailerMoreParamList>>();
  return (
    <RetailerOrdersScreen
      onBack={() => navigation.goBack()}
      onOpen={(orderId) => navigation.navigate('Order', { orderId })}
    />
  );
}

function OrderRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<RetailerMoreParamList, 'Order'>>();
  const route = useRoute<RouteProp<RetailerMoreParamList, 'Order'>>();
  return <RetailerOrderScreen orderId={route.params.orderId} onBack={() => navigation.goBack()} />;
}

function LaboratoriesRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<RetailerMoreParamList>>();
  return <LabConnectionsScreen onBack={() => navigation.goBack()} />;
}

function LabJobsRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<RetailerMoreParamList>>();
  return (
    <LabJobsScreen
      onBack={() => navigation.goBack()}
      onLabs={() => navigation.navigate('Laboratories')}
      onOpen={(jobId) => navigation.navigate('LabJob', { jobId })}
    />
  );
}

function LabJobRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<RetailerMoreParamList, 'LabJob'>>();
  const route = useRoute<RouteProp<RetailerMoreParamList, 'LabJob'>>();
  return <LabJobScreen jobId={route.params.jobId} onBack={() => navigation.goBack()} />;
}
