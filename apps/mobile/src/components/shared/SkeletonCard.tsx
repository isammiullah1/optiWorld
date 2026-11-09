import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors } from '../../theme/colors';

export function SkeletonCard(): React.ReactElement {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View accessibilityLabel="Loading" style={[styles.card, { opacity }]}>
      <View style={styles.line} />
      <View style={styles.short} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  line: {
    backgroundColor: colors.line,
    borderRadius: 4,
    height: 12,
  },
  short: {
    backgroundColor: colors.line,
    borderRadius: 4,
    height: 12,
    width: '55%',
  },
});
