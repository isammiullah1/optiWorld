import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginFormSchema, type AuthSessionUser, type LoginFormValues } from '@optiworld/shared';
import { useForm, Controller } from 'react-hook-form';

import {
  AuthRequestError,
  canOfferBiometricLogin,
  login,
  restoreSession,
} from '../../services/auth-service';
import { colors } from '../../theme/colors';

const REMEMBERED_EMAIL_KEY = 'optiworld.rememberedEmail';
const INACTIVE_MESSAGE = 'Your account is currently inactive';
const INVALID_MESSAGE = 'Incorrect email or password';

type LoginScreenProps = {
  onSignedIn: (user: AuthSessionUser) => void;
  onForgotPassword: () => void;
};

export function LoginScreen({
  onSignedIn,
  onForgotPassword,
}: LoginScreenProps): React.ReactElement {
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    void SecureStore.getItemAsync(REMEMBERED_EMAIL_KEY).then((saved) => {
      if (saved) {
        form.setValue('email', saved);
        setRememberEmail(true);
      }
    });
    void canOfferBiometricLogin().then(async (offered) => {
      if (!offered) {
        return;
      }
      const [hardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      setBiometricReady(hardware && enrolled);
    });
  }, [form]);

  async function onSubmit(values: LoginFormValues): Promise<void> {
    setFormError(null);
    setSubmitting(true);
    try {
      const user = await login(values.email, values.password);
      if (rememberEmail) {
        await SecureStore.setItemAsync(REMEMBERED_EMAIL_KEY, values.email);
      } else {
        await SecureStore.deleteItemAsync(REMEMBERED_EMAIL_KEY);
      }
      onSignedIn(user);
    } catch (error) {
      setFormError(
        error instanceof AuthRequestError && error.status === 403
          ? INACTIVE_MESSAGE
          : INVALID_MESSAGE,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function signInWithBiometrics(): Promise<void> {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sign in to OptiWorld',
      cancelLabel: 'Cancel',
    });
    if (!result.success) {
      return;
    }
    setSubmitting(true);
    try {
      onSignedIn(await restoreSession());
    } catch {
      setFormError(INVALID_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  const emailError = form.formState.errors.email?.message;
  const passwordError = form.formState.errors.password?.message;

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.mark} accessibilityElementsHidden>
              <View style={styles.lens} />
            </View>
            <Text style={styles.wordmark} accessibilityRole="header">
              OptiWorld
            </Text>
          </View>
          <Text style={styles.tagline}>The optical industry, connected</Text>
          <Text style={styles.label} nativeID="email-label">
            Email address
          </Text>
          <Controller
            control={form.control}
            name="email"
            render={({ field }) => (
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                accessibilityLabel="Email address"
                accessibilityHint={emailError}
                style={styles.input}
              />
            )}
          />
          {emailError ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {emailError}
            </Text>
          ) : null}
          <Text style={styles.label}>Password</Text>
          <View>
            <Controller
              control={form.control}
              name="password"
              render={({ field }) => (
                <TextInput
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  textContentType="password"
                  accessibilityLabel="Password"
                  accessibilityHint={passwordError}
                  style={[styles.input, styles.passwordInput]}
                />
              )}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              onPress={() => setShowPassword((current) => !current)}
              style={styles.showButton}
            >
              <Text style={styles.showLabel}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
          {passwordError ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {passwordError}
            </Text>
          ) : null}
          <Pressable accessibilityRole="link" onPress={onForgotPassword} style={styles.linkHit}>
            <Text style={styles.link}>Forgot password?</Text>
          </Pressable>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberEmail }}
            onPress={() => setRememberEmail((current) => !current)}
            style={styles.remember}
          >
            <View style={[styles.box, rememberEmail ? styles.boxOn : null]} />
            <Text style={styles.rememberLabel}>Remember email</Text>
          </Pressable>
          {formError ? (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              style={styles.error}
            >
              {formError}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting, busy: submitting }}
            disabled={submitting}
            onPress={form.handleSubmit(onSubmit)}
            style={styles.primary}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryLabel}>Sign in</Text>
            )}
          </Pressable>
          {biometricReady ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign in with biometrics"
              disabled={submitting}
              onPress={() => {
                void signInWithBiometrics();
              }}
              style={styles.secondary}
            >
              <Text style={styles.secondaryLabel}>Sign in with biometrics</Text>
            </Pressable>
          ) : null}
          <Text style={styles.note}>New to OptiWorld? Contact your administrator</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lens: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.white },
  wordmark: { color: colors.ink, fontSize: 24, fontWeight: '600' },
  tagline: { color: colors.ink2, fontSize: 15, marginTop: 12, marginBottom: 20 },
  label: { color: colors.ink, fontSize: 16, fontWeight: '500', marginBottom: 6 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    fontSize: 18,
    color: colors.ink,
    marginBottom: 4,
  },
  passwordInput: { paddingRight: 72 },
  showButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  showLabel: { color: colors.blue, fontSize: 16 },
  error: { color: colors.red, fontSize: 15, marginBottom: 8 },
  linkHit: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.blue, fontSize: 16 },
  remember: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  boxOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  rememberLabel: { color: colors.ink2, fontSize: 16 },
  primary: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryLabel: { color: colors.white, fontSize: 18, fontWeight: '600' },
  secondary: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  secondaryLabel: { color: colors.ink, fontSize: 18, fontWeight: '500' },
  note: { color: colors.ink3, fontSize: 14, textAlign: 'center', marginTop: 20 },
});
