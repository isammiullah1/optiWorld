import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors } from '../theme/colors';

export type MoreItem = {
  label: string;
  onPress: () => void;
};

export function MoreMenu({ items }: { items: MoreItem[] }): React.ReactElement {
  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      {items.map((item) => (
        <Pressable
          key={item.label}
          accessibilityRole="button"
          onPress={item.onPress}
          style={styles.row}
        >
          <Text style={styles.label}>{item.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  content: { padding: 12, gap: 8 },
  row: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  label: { color: colors.ink, fontSize: 16, fontWeight: '600' },
});
