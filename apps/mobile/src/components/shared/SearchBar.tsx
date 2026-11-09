import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../theme/colors';

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

const DEBOUNCE_MS = 300;

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search',
}: SearchBarProps): React.ReactElement {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (text === value) {
      return undefined;
    }
    const timer = setTimeout(() => onChange(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [onChange, text, value]);

  return (
    <View style={styles.row}>
      <TextInput
        accessibilityLabel={placeholder}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        style={styles.input}
        value={text}
      />
      {text.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => {
            setText('');
            onChange('');
          }}
          style={styles.clear}
        >
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  clear: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
  },
  clearText: {
    color: colors.blue,
    fontSize: 15,
    fontWeight: '600',
  },
});
