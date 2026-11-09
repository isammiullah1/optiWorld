import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/colors';

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  failed: boolean;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  private retry = (): void => {
    this.setState({ failed: false });
  };

  override render(): React.ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>The screen stopped. You can try it again.</Text>
        <Pressable accessibilityRole="button" onPress={this.retry} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: colors.canvas,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '600',
  },
  body: {
    color: colors.ink2,
    fontSize: 15,
    marginTop: 8,
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
