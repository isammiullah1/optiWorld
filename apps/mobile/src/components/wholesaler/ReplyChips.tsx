import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReplyChip } from '@optiworld/shared';

import { colors } from '../../theme/colors';

type ReplyChipsProps = {
  chips: readonly ReplyChip[];
  onInsert: (text: string) => void;
};

export function ReplyChips({ chips, onInsert }: ReplyChipsProps): React.ReactElement {
  return (
    <View accessibilityRole="summary" style={styles.row}>
      {chips.map((chip) => (
        <Pressable
          key={chip.id}
          accessibilityLabel={chip.tooltip ?? chip.label}
          accessibilityState={{ disabled: chip.disabled === true }}
          disabled={chip.disabled === true}
          onPress={() => {
            if (chip.disabled || chip.text.length === 0) {
              return;
            }
            onInsert(chip.text);
          }}
          style={[styles.chip, chip.disabled ? styles.disabled : null]}
        >
          <Text style={styles.label}>{chip.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    color: colors.ink2,
    fontSize: 14,
  },
});
