import type { ReactElement } from 'react';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { colors } from '../theme/colors';

export const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.blue,
  tabBarInactiveTintColor: colors.ink3,
  tabBarStyle: {
    backgroundColor: colors.white,
    borderTopColor: colors.line,
    minHeight: 56,
  },
  tabBarLabelStyle: { fontSize: 13, fontWeight: '500' as const },
} satisfies BottomTabNavigationOptions;

export function TabMark({ label, color }: { label: string; color: string }): ReactElement {
  return <Text style={{ color, fontSize: 14, fontWeight: '700' }}>{label.slice(0, 1)}</Text>;
}
