import { REFRESH_TOKEN_TTL_SECONDS } from '@optiworld/shared';
import { z } from 'zod';

import { getRedis } from './redis.js';

const RESET_TTL_SECONDS = 60 * 60;

const StoredAccountSchema = z.object({
  accountId: z.string().uuid(),
  kind: z.enum(['user', 'super_admin']),
});

export type StoredAccount = z.infer<typeof StoredAccountSchema>;

function refreshKey(tokenHash: string): string {
  return `optiworld:refresh:${tokenHash}`;
}

function refreshIndexKey(accountId: string): string {
  return `optiworld:refresh-index:${accountId}`;
}

function resetKey(tokenHash: string): string {
  return `optiworld:reset:${tokenHash}`;
}

export async function saveRefreshToken(tokenHash: string, account: StoredAccount): Promise<void> {
  const redis = getRedis();
  await redis
    .multi()
    .set(refreshKey(tokenHash), JSON.stringify(account), 'EX', REFRESH_TOKEN_TTL_SECONDS)
    .sadd(refreshIndexKey(account.accountId), tokenHash)
    .expire(refreshIndexKey(account.accountId), REFRESH_TOKEN_TTL_SECONDS)
    .exec();
}

export async function readRefreshToken(tokenHash: string): Promise<StoredAccount | null> {
  const raw = await getRedis().get(refreshKey(tokenHash));
  return parseAccount(raw);
}

export async function deleteRefreshToken(tokenHash: string): Promise<void> {
  const stored = await readRefreshToken(tokenHash);
  const redis = getRedis();
  const transaction = redis.multi().del(refreshKey(tokenHash));
  if (stored) {
    transaction.srem(refreshIndexKey(stored.accountId), tokenHash);
  }
  await transaction.exec();
}

export async function revokeAccountRefreshTokens(accountId: string): Promise<void> {
  const redis = getRedis();
  const indexKey = refreshIndexKey(accountId);
  const hashes = await redis.smembers(indexKey);
  const keys = hashes.map(refreshKey);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  await redis.del(indexKey);
}

export async function saveResetToken(tokenHash: string, account: StoredAccount): Promise<void> {
  await getRedis().set(resetKey(tokenHash), JSON.stringify(account), 'EX', RESET_TTL_SECONDS);
}

export async function readResetToken(tokenHash: string): Promise<StoredAccount | null> {
  const raw = await getRedis().get(resetKey(tokenHash));
  return parseAccount(raw);
}

export async function deleteResetToken(tokenHash: string): Promise<void> {
  await getRedis().del(resetKey(tokenHash));
}

function parseAccount(raw: string | null): StoredAccount | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = StoredAccountSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
