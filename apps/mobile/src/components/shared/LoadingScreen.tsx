import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/colors';

type LoadingScreenProps = {
  message?: string;
};

export function LoadingScreen({ message = 'Loading' }: LoadingScreenProps): React.ReactElement {
  return (
    <View accessibilityRole="progressbar" style={styles.screen}>
      <ActivityIndicator color={colors.blue} size="large" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: colors.canvas,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    color: colors.ink2,
    fontSize: 16,
    marginTop: 12,
  },
});
