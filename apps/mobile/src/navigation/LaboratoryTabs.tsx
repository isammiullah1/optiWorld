import type { ReactElement } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { useNavigation, type NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { MoreMenu } from './MoreMenu';
import { OrgShell } from './OrgShell';
import { TabMark, tabScreenOptions } from './tab-options';
import { ClientsScreen } from '../screens/laboratory/ClientsScreen';
import { InventoryScreen } from '../screens/laboratory/InventoryScreen';
import { JobsScreen } from '../screens/laboratory/JobsScreen';
import { ReportsScreen } from '../screens/laboratory/ReportsScreen';
import { AlertsScreen } from '../screens/shared/AlertsScreen';
import { SettingsScreen } from '../screens/shared/SettingsScreen';

export type LaboratoryMoreParamList = {
  Menu: undefined;
  Alerts: undefined;
  Settings: undefined;
};

export type LaboratoryTabParamList = {
  Jobs: undefined;
  Inventory: undefined;
  Clients: undefined;
  Reports: undefined;
  More: NavigatorScreenParams<LaboratoryMoreParamList>;
};

const Tabs = createBottomTabNavigator<LaboratoryTabParamList>();
const More = createNativeStackNavigator<LaboratoryMoreParamList>();
const stackOptions = { headerShown: false } as const;

export function LaboratoryTabs(): ReactElement {
  return (
    <OrgShell>
      <Tabs.Navigator screenOptions={tabScreenOptions}>
        <Tabs.Screen
          name="Jobs"
          component={JobsScreen}
          options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="Jobs" /> }}
        />
        <Tabs.Screen
          name="Inventory"
          component={InventoryScreen}
          options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="Inventory" /> }}
        />
        <Tabs.Screen
          name="Clients"
          component={ClientsScreen}
          options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="Clients" /> }}
        />
        <Tabs.Screen
          name="Reports"
          component={ReportsScreen}
          options={{ tabBarIcon: ({ color }) => <TabMark color={color} label="Reports" /> }}
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

function MoreStack(): ReactElement {
  return (
    <More.Navigator screenOptions={stackOptions}>
      <More.Screen name="Menu" component={MoreMenuRoute} />
      <More.Screen name="Alerts" component={AlertsRoute} />
      <More.Screen name="Settings" component={SettingsScreen} />
    </More.Navigator>
  );
}

function AlertsRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<LaboratoryMoreParamList>>();
  const tabs = navigation.getParent<BottomTabNavigationProp<LaboratoryTabParamList>>();
  return (
    <AlertsScreen
      onAction={(alert) => {
        if (alert.type === 'LOW_STOCK') {
          tabs?.navigate('Inventory');
          return;
        }
        if (alert.type.startsWith('LAB_')) {
          tabs?.navigate('Jobs');
        }
      }}
    />
  );
}

function MoreMenuRoute(): ReactElement {
  const navigation = useNavigation<NativeStackNavigationProp<LaboratoryMoreParamList>>();
  return (
    <MoreMenu
      items={[
        { label: 'Alerts', onPress: () => navigation.navigate('Alerts') },
        { label: 'Settings', onPress: () => navigation.navigate('Settings') },
      ]}
    />
  );
}
