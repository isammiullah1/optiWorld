import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/colors';

type AppHeaderProps = {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
};

export function AppHeader({ title, onBack, right }: AppHeaderProps): React.ReactElement {
  return (
    <View style={styles.bar}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.side}
        >
          <Text style={styles.back}>Back</Text>
        </Pressable>
      ) : (
        <View style={styles.side} />
      )}
      <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <View style={styles.side}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 8,
  },
  side: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 72,
  },
  back: {
    color: colors.blue,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});
