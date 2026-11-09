import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/colors';

type ConfirmSheetProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmSheetProps): React.ReactElement | null {
  const travel = useRef(new Animated.Value(320)).current;

  useEffect(() => {
    Animated.timing(travel, {
      toValue: visible ? 0 : 320,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [travel, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.fill}>
      <Pressable accessibilityLabel="Dismiss" onPress={onCancel} style={styles.backdrop} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: travel }] }]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <Pressable accessibilityRole="button" onPress={onConfirm} style={styles.confirm}>
          <Text style={styles.confirmText}>{confirmLabel}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 32, 64, 0.4)',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '600',
  },
  message: {
    color: colors.ink2,
    fontSize: 15,
    marginTop: 8,
  },
  confirm: {
    alignItems: 'center',
    backgroundColor: colors.red,
    borderRadius: 8,
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  confirmText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  cancel: {
    alignItems: 'center',
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.ink2,
    fontSize: 16,
    fontWeight: '600',
  },
});
