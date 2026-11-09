import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/colors';

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps): React.ReactElement {
  return (
    <View style={styles.wrap}>
      <View accessibilityElementsHidden style={styles.icon}>
        <Text style={styles.iconText}>—</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.button}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.blueSoft,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  iconText: {
    color: colors.blue,
    fontSize: 20,
    fontWeight: '700',
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  description: {
    color: colors.ink2,
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.blue,
    borderRadius: 8,
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
