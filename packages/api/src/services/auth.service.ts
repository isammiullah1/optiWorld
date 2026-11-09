import { prisma } from '@optiworld/db';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  LABORATORY_ROLES,
  RETAILER_ROLES,
  WHOLESALER_ROLES,
  type AuthSessionUser,
  type LoginResponse,
  type OrgType,
  type UserRole,
} from '@optiworld/shared';

import {
  deleteRefreshToken,
  deleteResetToken,
  readRefreshToken,
  readResetToken,
  revokeAccountRefreshTokens,
  saveRefreshToken,
  saveResetToken,
} from '../lib/auth-session-store.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  hashOpaqueToken,
  signAccessToken,
  signPasswordResetToken,
  signRefreshToken,
  verifyPasswordResetToken,
  verifyRefreshToken,
} from '../lib/tokens.js';
import { getEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';
import type { Mailer } from './mailer.js';

const GENERIC_LOGIN_ERROR = 'Invalid email or password';
const GENERIC_RESET_MESSAGE = 'If an account exists for that email, a reset link has been sent';

type OrgAccount = {
  kind: 'user';
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
  role: string;
  orgId: string;
  org: {
    type: OrgType;
    status: AuthSessionUser['orgStatus'];
    planType: AuthSessionUser['planType'];
    subscriptionStatus: AuthSessionUser['subscriptionStatus'];
  };
};

type AdminAccount = {
  kind: 'super_admin';
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
};

type Account = OrgAccount | AdminAccount;

export async function login(email: string, password: string): Promise<LoginResponse> {
  const account = await findAccountByEmail(email);
  if (!account || !account.isActive) {
    throw new AppError(401, 'UNAUTHORIZED', GENERIC_LOGIN_ERROR);
  }

  const passwordMatches = await verifyPassword(password, account.passwordHash);
  if (!passwordMatches) {
    throw new AppError(401, 'UNAUTHORIZED', GENERIC_LOGIN_ERROR);
  }

  const sessionUser = toSessionUser(account);
  if (sessionUser.role !== 'SUPER_ADMIN' && sessionUser.orgStatus !== 'ACTIVE') {
    throw new AppError(403, 'FORBIDDEN', 'This organisation is not active');
  }

  if (account.kind === 'user') {
    await prisma.user.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });
    await prisma.auditLog
      .create({
        data: {
          orgId: account.orgId,
          userId: account.id,
          action: 'USER_LOGIN',
          entityType: 'User',
          entityId: account.id,
        },
      })
      .catch((error: unknown) => {
        logger.error('Login audit failed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      });
  }

  const tokens = await issueTokens(sessionUser);
  return { ...tokens, user: sessionUser };
}

export async function refresh(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const { userId } = verifyRefreshToken(refreshToken);
  const tokenHash = hashOpaqueToken(refreshToken);
  const stored = await readRefreshToken(tokenHash);

  if (!stored || stored.accountId !== userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Refresh token is invalid');
  }

  const account = await findAccountById(stored.accountId);
  if (!account || !account.isActive) {
    throw new AppError(401, 'UNAUTHORIZED', 'Refresh token is invalid');
  }

  const sessionUser = toSessionUser(account);
  return {
    accessToken: signAccessToken(sessionUser),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export async function logout(refreshToken: string): Promise<void> {
  await deleteRefreshToken(hashOpaqueToken(refreshToken));
}

export async function forgotPassword(email: string, mailer: Mailer): Promise<string> {
  const account = await findAccountByEmail(email);
  if (!account || !account.isActive) {
    return GENERIC_RESET_MESSAGE;
  }

  const rawToken = signPasswordResetToken(account.id);
  await saveResetToken(hashOpaqueToken(rawToken), {
    accountId: account.id,
    kind: account.kind,
  });

  const resetUrl = resetUrlForUser(toSessionUser(account), rawToken);
  try {
    await mailer.sendPasswordReset({
      to: account.email,
      resetUrl,
      recipientName: account.name,
    });
  } catch (error) {
    logger.error('Password reset email failed', {
      message: error instanceof Error ? error.message : 'Unknown email error',
    });
  }

  return GENERIC_RESET_MESSAGE;
}

export async function validatePasswordResetToken(token: string): Promise<void> {
  await findUsableResetToken(token);
}

export async function resetPassword(token: string, password: string): Promise<{ email: string }> {
  const stored = await findUsableResetToken(token);
  const account = await findAccountById(stored.accountId);
  if (!account || !account.isActive || account.kind !== stored.kind) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Reset link is invalid or expired');
  }

  const passwordHash = await hashPassword(password);
  if (account.kind === 'user') {
    await prisma.user.update({ where: { id: account.id }, data: { passwordHash } });
  } else {
    await prisma.superAdmin.update({ where: { id: account.id }, data: { passwordHash } });
  }
  await deleteResetToken(hashOpaqueToken(token));
  await revokeAccountRefreshTokens(account.id);
  return { email: account.email };
}

async function findUsableResetToken(token: string) {
  let userId: string;
  try {
    userId = verifyPasswordResetToken(token).userId;
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'Reset link is invalid or expired');
  }

  const stored = await readResetToken(hashOpaqueToken(token));
  if (!stored || stored.accountId !== userId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Reset link is invalid or expired');
  }
  return stored;
}

export async function getCurrentUser(userId: string): Promise<AuthSessionUser> {
  const account = await findAccountById(userId);
  if (!account || !account.isActive) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return toSessionUser(account);
}

async function issueTokens(user: AuthSessionUser): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const refresh = signRefreshToken(user.userId);
  await saveRefreshToken(hashOpaqueToken(refresh.token), {
    accountId: user.userId,
    kind: user.role === 'SUPER_ADMIN' ? 'super_admin' : 'user',
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken: refresh.token,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

async function findAccountByEmail(email: string): Promise<Account | null> {
  const normalized = email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    include: { org: true },
  });
  if (user) {
    return {
      kind: 'user',
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      isActive: user.isActive,
      role: user.role,
      orgId: user.orgId,
      org: user.org,
    };
  }

  const admin = await prisma.superAdmin.findUnique({ where: { email: normalized } });
  if (!admin) {
    return null;
  }
  return {
    kind: 'super_admin',
    id: admin.id,
    email: admin.email,
    name: admin.name,
    passwordHash: admin.passwordHash,
    isActive: admin.isActive,
  };
}

async function findAccountById(id: string): Promise<Account | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { org: true },
  });
  if (user) {
    return {
      kind: 'user',
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      isActive: user.isActive,
      role: user.role,
      orgId: user.orgId,
      org: user.org,
    };
  }

  const admin = await prisma.superAdmin.findUnique({ where: { id } });
  if (!admin) {
    return null;
  }
  return {
    kind: 'super_admin',
    id: admin.id,
    email: admin.email,
    name: admin.name,
    passwordHash: admin.passwordHash,
    isActive: admin.isActive,
  };
}

function toSessionUser(account: Account): AuthSessionUser {
  if (account.kind === 'super_admin') {
    return {
      userId: account.id,
      email: account.email,
      name: account.name,
      orgId: null,
      orgType: null,
      role: 'SUPER_ADMIN',
      orgStatus: null,
      planType: null,
      subscriptionStatus: null,
    };
  }

  if (!account.org) {
    throw new AppError(403, 'FORBIDDEN', 'This organisation is not active');
  }

  return {
    userId: account.id,
    email: account.email,
    name: account.name,
    orgId: account.orgId,
    orgType: account.org.type,
    role: roleForOrg(account.org.type, account.role),
    orgStatus: account.org.status,
    planType: account.org.planType,
    subscriptionStatus: account.org.subscriptionStatus,
  };
}

function roleForOrg(orgType: OrgType, role: string): UserRole {
  const allowed =
    orgType === 'RETAILER'
      ? RETAILER_ROLES
      : orgType === 'WHOLESALER'
        ? WHOLESALER_ROLES
        : LABORATORY_ROLES;
  if (!(allowed as readonly string[]).includes(role)) {
    throw new AppError(403, 'FORBIDDEN', 'This account role is not valid for the organisation');
  }
  return role as UserRole;
}

function resetUrlForUser(user: AuthSessionUser, token: string): string {
  const env = getEnv();
  const base = user.role === 'SUPER_ADMIN' ? env.ADMIN_NEXTAUTH_URL : env.NEXTAUTH_URL;
  const path = user.role === 'SUPER_ADMIN' ? '/admin/reset-password' : '/reset-password';
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('token', token);
  return url.toString();
}
