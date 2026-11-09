import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppHeader, ConfirmSheet } from '../../components/shared';
import { useSessionValue } from '../../navigation/session';
import { colors } from '../../theme/colors';

export function SettingsScreen(): React.ReactElement {
  const navigation = useNavigation();
  const { user, signOut } = useSessionValue();
  const [confirming, setConfirming] = useState(false);

  return (
    <View style={styles.screen}>
      <AppHeader title="Settings" onBack={() => navigation.goBack()} />
      <View style={styles.card}>
        <Text style={styles.name}>{user?.name ?? 'Signed in'}</Text>
        <Text style={styles.role}>{user?.role ?? ''}</Text>
      </View>
      <ConfirmSheet
        visible={confirming}
        title="Sign out"
        message="You will need your password to open OptiWorld again."
        confirmLabel="Sign out"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void signOut();
        }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => setConfirming(true)}
        style={styles.signOut}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    margin: 12,
    padding: 16,
  },
  name: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  role: { color: colors.ink3, fontSize: 14, marginTop: 4 },
  signOut: {
    justifyContent: 'center',
    marginHorizontal: 16,
    minHeight: 44,
  },
  signOutText: {
    color: colors.red,
    fontSize: 16,
    fontWeight: '600',
  },
});
