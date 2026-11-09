import type { NextAuthOptions, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import {
  LoginSchema,
  ORG_STATUSES,
  ORG_TYPES,
  PLAN_TYPES,
  SUBSCRIPTION_STATUSES,
  USER_ROLES,
} from '@optiworld/shared';
import { z } from 'zod';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const LoginApiSchema = z.object({
  success: z.literal(true),
  data: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number(),
    user: z.object({
      userId: z.string(),
      email: z.string().email(),
      name: z.string(),
      orgId: z.string().nullable(),
      orgType: z.enum(ORG_TYPES).nullable(),
      role: z.enum(USER_ROLES),
      orgStatus: z.enum(ORG_STATUSES).nullable(),
      planType: z.enum(PLAN_TYPES).nullable(),
      subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).nullable(),
    }),
  }),
});

async function requestLogin(email: string, password: string): Promise<User | null> {
  const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload: unknown = await response.json();
  if (response.status === 403) {
    throw new Error('INACTIVE_ORG');
  }
  const parsed = LoginApiSchema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    return null;
  }

  const { user, accessToken, refreshToken, expiresIn } = parsed.data.data;
  if (user.role === 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN');
  }

  return {
    id: user.userId,
    email: user.email,
    name: user.name,
    userId: user.userId,
    orgId: user.orgId,
    orgType: user.orgType,
    role: user.role,
    orgStatus: user.orgStatus,
    planType: user.planType,
    subscriptionStatus: user.subscriptionStatus,
    accessToken,
    refreshToken,
    accessTokenExpires: Date.now() + expiresIn * 1000,
  };
}

async function refreshAccessToken(token: {
  refreshToken?: string;
  accessTokenExpires?: number;
}): Promise<{ accessToken: string; accessTokenExpires: number } | null> {
  if (!token.refreshToken) {
    return null;
  }

  const response = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: token.refreshToken }),
  });
  const payload: unknown = await response.json();
  const parsed = z
    .object({
      success: z.literal(true),
      data: z.object({ accessToken: z.string(), expiresIn: z.number() }),
    })
    .safeParse(payload);

  if (!response.ok || !parsed.success) {
    return null;
  }

  return {
    accessToken: parsed.data.data.accessToken,
    accessTokenExpires: Date.now() + parsed.data.data.expiresIn * 1000,
  };
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }
        return requestLogin(parsed.data.email, parsed.data.password);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.userId;
        token.email = user.email;
        token.name = user.name;
        token.orgId = user.orgId;
        token.orgType = user.orgType;
        token.role = user.role;
        token.orgStatus = user.orgStatus;
        token.planType = user.planType;
        token.subscriptionStatus = user.subscriptionStatus;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpires = user.accessTokenExpires;
        return token;
      }

      if (Date.now() < token.accessTokenExpires - 10_000) {
        return token;
      }

      const refreshed = await refreshAccessToken(token);
      if (!refreshed) {
        return { ...token, error: 'RefreshAccessTokenError' };
      }

      return { ...token, ...refreshed, error: undefined };
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        userId: token.userId,
        orgId: token.orgId,
        orgType: token.orgType,
        role: token.role,
        orgStatus: token.orgStatus,
        planType: token.planType,
        subscriptionStatus: token.subscriptionStatus,
      };
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
};
