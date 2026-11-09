import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/colors';

const TONES = {
  amber: { background: colors.amberSoft, text: colors.amber },
  blue: { background: colors.blueSoft, text: colors.blue },
  teal: { background: colors.tealSoft, text: colors.teal },
  red: { background: colors.redSoft, text: colors.red },
  muted: { background: colors.canvas, text: colors.ink3 },
} as const;

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  PENDING: 'amber',
  WAITING: 'amber',
  FITTING: 'amber',
  QC: 'amber',
  CONFIRMED: 'blue',
  ACTIVE: 'blue',
  CUTTING: 'blue',
  READY: 'teal',
  COMPLETED: 'teal',
  DISPATCHED: 'teal',
  DELIVERED: 'teal',
  RECEIVED: 'muted',
  OVERDUE: 'red',
  CRITICAL: 'red',
  EXPIRED: 'red',
  LOW_STOCK: 'amber',
  OUT_OF_STOCK: 'red',
  AVAILABLE: 'teal',
  APPROVED: 'blue',
  REJECTED: 'muted',
  CANCELLED: 'red',
};

type StatusBadgeProps = {
  status: string;
};

export function StatusBadge({ status }: StatusBadgeProps): React.ReactElement {
  const tone = TONES[STATUS_TONE[status] ?? 'muted'];
  const label = status
    .toLowerCase()
    .split('_')
    .map((part) => (part.length > 0 ? `${part.slice(0, 1).toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
  return (
    <View style={[styles.pill, { backgroundColor: tone.background }]}>
      <Text style={[styles.text, { color: tone.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
