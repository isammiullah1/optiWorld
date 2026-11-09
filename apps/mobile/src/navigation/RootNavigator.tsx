import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoadingScreen } from '../components/shared';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { colors } from '../theme/colors';
import { LaboratoryTabs } from './LaboratoryTabs';
import { RetailerTabs } from './RetailerTabs';
import { useSessionValue } from './session';
import { WholesalerTabs } from './WholesalerTabs';

type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
};

const Auth = createNativeStackNavigator<AuthStackParamList>();

export function RootNavigator(): ReactElement {
  const { user, ready, signIn, signOut } = useSessionValue();

  if (!ready) {
    return <LoadingScreen message="Opening OptiWorld" />;
  }

  let body: ReactElement;
  if (!user) {
    body = (
      <Auth.Navigator screenOptions={{ headerShown: false }}>
        <Auth.Screen name="Login">
          {({ navigation }) => (
            <LoginScreen
              onForgotPassword={() => navigation.navigate('ForgotPassword')}
              onSignedIn={signIn}
            />
          )}
        </Auth.Screen>
        <Auth.Screen name="ForgotPassword">
          {({ navigation }) => <ForgotPasswordScreen onBack={() => navigation.goBack()} />}
        </Auth.Screen>
      </Auth.Navigator>
    );
  } else if (user.orgType === 'RETAILER') {
    body = <RetailerTabs />;
  } else if (user.orgType === 'WHOLESALER') {
    body = <WholesalerTabs />;
  } else if (user.orgType === 'LABORATORY') {
    body = <LaboratoryTabs />;
  } else {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>OptiWorld</Text>
        <Text style={styles.body}>Signed in as {user.name}</Text>
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.button}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return <NavigationContainer>{body}</NavigationContainer>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  body: { color: colors.ink2, fontSize: 15, marginTop: 8 },
  button: { justifyContent: 'center', marginTop: 16, minHeight: 44 },
  link: { color: colors.blue, fontSize: 16, fontWeight: '600' },
});
