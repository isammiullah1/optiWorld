import * as SecureStore from 'expo-secure-store';
import {
  ForgotPasswordSchema,
  LoginSchema,
  ResetPasswordSchema,
  type AuthSessionUser,
  type LoginResponse,
} from '@optiworld/shared';

const ACCESS_TOKEN_KEY = 'optiworld.accessToken';
const REFRESH_TOKEN_KEY = 'optiworld.refreshToken';

const BIOMETRIC_ENABLED_KEY = 'optiworld.biometricEnabled';

export class AuthRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AuthRequestError';
    this.status = status;
    this.code = code;
  }
}

type FailureBody = {
  success: false;
  error?: { code?: string; message?: string };
};

function apiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
}

export async function login(email: string, password: string): Promise<AuthSessionUser> {
  const body = LoginSchema.parse({ email, password });
  const payload = await postJson<LoginResponse>('/api/v1/auth/login', body);
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, payload.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, payload.refreshToken);
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, '1');
  return payload.user;
}

export async function refreshAccessToken(): Promise<string> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    throw new Error('Sign in is required');
  }
  const payload = await postJson<{ accessToken: string; expiresIn: number }>(
    '/api/v1/auth/refresh',
    {
      refreshToken,
    },
  );
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, payload.accessToken);
  return payload.accessToken;
}

export async function logout(): Promise<void> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  try {
    if (refreshToken) {
      await postJson<{ revoked: boolean }>('/api/v1/auth/logout', { refreshToken });
    }
  } finally {
    await deleteStoredToken(ACCESS_TOKEN_KEY);
    await deleteStoredToken(REFRESH_TOKEN_KEY);
    await deleteStoredToken(BIOMETRIC_ENABLED_KEY);
  }
}

export async function forgotPassword(email: string): Promise<void> {
  const body = ForgotPasswordSchema.parse({ email });
  await postJson<{ message: string }>('/api/v1/auth/forgot-password', body);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const body = ResetPasswordSchema.parse({ token, password });
  await postJson<{ reset: boolean }>('/api/v1/auth/reset-password', body);
}

export function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function canOfferBiometricLogin(): Promise<boolean> {
  const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  return enabled === '1' && refreshToken !== null;
}

export async function restoreSession(): Promise<AuthSessionUser> {
  await refreshAccessToken();
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthRequestError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  const response = await fetch(`${apiBaseUrl()}/api/v1/auth/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isSuccess<AuthSessionUser>(payload)) {
    throw requestError(response.status, payload);
  }
  return payload.data;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isSuccess<T>(payload)) {
    throw requestError(response.status, payload);
  }
  return payload.data;
}

function isSuccess<T>(value: unknown): value is { success: true; data: T } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === true &&
    'data' in value
  );
}

function requestError(status: number, value: unknown): AuthRequestError {
  if (typeof value === 'object' && value !== null && 'error' in value) {
    const error = (value as FailureBody).error;
    return new AuthRequestError(
      status,
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'Request failed',
    );
  }
  return new AuthRequestError(status, 'REQUEST_FAILED', 'Request failed');
}

async function deleteStoredToken(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // The key is already absent.
  }
}
