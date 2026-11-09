import { Redis } from 'ioredis';

import { getEnv } from '../config/env.js';
import { logger } from './logger.js';

let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: 3 });
    client.on('error', (error: Error) => {
      logger.error('Redis error', { message: error.message });
    });
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (!client) {
    return;
  }
  const current = client;
  client = undefined;
  await current.quit();
}
