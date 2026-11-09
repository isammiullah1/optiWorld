import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { ForgotPasswordSchema, type ForgotPasswordRequest } from '@optiworld/shared';
import { useForm, Controller } from 'react-hook-form';

import { AppHeader } from '../../components/shared';
import { forgotPassword } from '../../services/auth-service';
import { colors } from '../../theme/colors';

type ForgotPasswordScreenProps = {
  onBack: () => void;
};

export function ForgotPasswordScreen({ onBack }: ForgotPasswordScreenProps): React.ReactElement {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordRequest): Promise<void> {
    setFormError(null);
    try {
      await forgotPassword(values.email);
      setSent(true);
    } catch {
      setFormError('The reset email could not be sent.');
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <AppHeader title="Forgot password" onBack={onBack} />
      <View style={styles.body}>
        {sent ? (
          <Text style={styles.copy}>
            If an account exists for that email, a reset link has been sent.
          </Text>
        ) : (
          <View>
            <Text style={styles.copy}>Enter the email for your OptiWorld account.</Text>
            <Controller
              control={form.control}
              name="email"
              render={({ field, fieldState }) => (
                <View>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    onBlur={field.onBlur}
                    onChangeText={field.onChange}
                    placeholder="Email"
                    placeholderTextColor={colors.ink3}
                    style={styles.input}
                    value={field.value}
                  />
                  {fieldState.error ? (
                    <Text style={styles.error}>{fieldState.error.message}</Text>
                  ) : null}
                </View>
              )}
            />
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={form.formState.isSubmitting}
              onPress={form.handleSubmit(onSubmit)}
              style={styles.button}
            >
              <Text style={styles.buttonText}>
                {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  body: { padding: 16 },
  copy: { color: colors.ink2, fontSize: 15, marginBottom: 12 },
  input: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  error: { color: colors.red, fontSize: 14, marginTop: 6 },
  button: {
    alignItems: 'center',
    backgroundColor: colors.blue,
    borderRadius: 8,
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '600' },
});
