import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import jwt, { type JwtPayload } from 'jsonwebtoken';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  USER_ROLES,
  type AuthSessionUser,
} from '@optiworld/shared';

import { getEnv } from '../config/env.js';
import { AppError } from './errors.js';

const ACCESS_TYPE = 'access';
const REFRESH_TYPE = 'refresh';
const RESET_TYPE = 'password-reset';

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokensMatch(leftHash: string, rightHash: string): boolean {
  const left = Buffer.from(leftHash);
  const right = Buffer.from(rightHash);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function signAccessToken(user: AuthSessionUser): string {
  return jwt.sign({ type: ACCESS_TYPE, ...user }, getEnv().JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    subject: user.userId,
    issuer: 'optiworld',
  });
}

export function signRefreshToken(userId: string): { token: string; expiresAt: Date } {
  const token = jwt.sign({ type: REFRESH_TYPE }, getEnv().JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    subject: userId,
    issuer: 'optiworld',
    jwtid: randomBytes(16).toString('hex'),
  });
  return {
    token,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  };
}

export function verifyAccessToken(token: string): AuthSessionUser {
  try {
    const decoded = jwt.verify(token, getEnv().JWT_SECRET, { issuer: 'optiworld' });
    if (!isRecord(decoded) || decoded.type !== ACCESS_TYPE) {
      throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
    }
    return toSessionUser(decoded);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
}

export function signPasswordResetToken(userId: string): string {
  return jwt.sign({ type: RESET_TYPE }, getEnv().JWT_SECRET, {
    expiresIn: 60 * 60,
    subject: userId,
    issuer: 'optiworld',
    jwtid: randomBytes(16).toString('hex'),
  });
}

export function verifyPasswordResetToken(token: string): { userId: string } {
  try {
    const decoded = jwt.verify(token, getEnv().JWT_SECRET, { issuer: 'optiworld' });
    if (!isRecord(decoded) || decoded.type !== RESET_TYPE || typeof decoded.sub !== 'string') {
      throw new AppError(422, 'VALIDATION_ERROR', 'Reset link is invalid or expired');
    }
    return { userId: decoded.sub };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(422, 'VALIDATION_ERROR', 'Reset link is invalid or expired');
  }
}

export function verifyRefreshToken(token: string): { userId: string } {
  try {
    const decoded = jwt.verify(token, getEnv().JWT_REFRESH_SECRET, { issuer: 'optiworld' });
    if (!isRecord(decoded) || decoded.type !== REFRESH_TYPE || typeof decoded.sub !== 'string') {
      throw new AppError(401, 'UNAUTHORIZED', 'Refresh token is invalid');
    }
    return { userId: decoded.sub };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(401, 'UNAUTHORIZED', 'Refresh token is invalid');
  }
}

function toSessionUser(payload: JwtPayload): AuthSessionUser {
  if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  if (
    typeof payload.role !== 'string' ||
    !(USER_ROLES as readonly string[]).includes(payload.role)
  ) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }

  return {
    userId: payload.userId,
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : '',
    orgId: typeof payload.orgId === 'string' ? payload.orgId : null,
    orgType: isOrgType(payload.orgType) ? payload.orgType : null,
    role: payload.role as AuthSessionUser['role'],
    orgStatus: isOrgStatus(payload.orgStatus) ? payload.orgStatus : null,
    planType: isPlanType(payload.planType) ? payload.planType : null,
    subscriptionStatus: isSubscriptionStatus(payload.subscriptionStatus)
      ? payload.subscriptionStatus
      : null,
  };
}

function isRecord(value: unknown): value is JwtPayload {
  return typeof value === 'object' && value !== null;
}

function isOrgType(value: unknown): value is AuthSessionUser['orgType'] {
  return value === 'RETAILER' || value === 'WHOLESALER' || value === 'LABORATORY';
}

function isOrgStatus(value: unknown): value is AuthSessionUser['orgStatus'] {
  return value === 'ACTIVE' || value === 'INACTIVE' || value === 'SUSPENDED';
}

function isPlanType(value: unknown): value is AuthSessionUser['planType'] {
  return (
    value === 'RETAILER_STANDARD' ||
    value === 'WHOLESALER_STANDARD' ||
    value === 'LABORATORY_STANDARD'
  );
}

function isSubscriptionStatus(value: unknown): value is AuthSessionUser['subscriptionStatus'] {
  return (
    value === 'TRIAL' ||
    value === 'ACTIVE' ||
    value === 'PAST_DUE' ||
    value === 'CANCELLED' ||
    value === 'EXPIRED'
  );
}
