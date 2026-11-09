import type { Server as HttpServer } from 'node:http';

import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';

import { getEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { setChatServer } from '../realtime/hub.js';
import { registerOrderChat } from './order-chat.js';

export function attachOrderChat(httpServer: HttpServer): Server {
  const env = getEnv();
  const io = new Server(httpServer, {
    cors: {
      origin: socketCorsOrigin(env.NEXTAUTH_URL, env.ADMIN_NEXTAUTH_URL),
      credentials: true,
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });

  if (env.NODE_ENV !== 'test') {
    attachRedis(io, env.REDIS_URL);
  }

  setChatServer(io);
  registerOrderChat(io);
  return io;
}

function socketCorsOrigin(webOrigin: string, adminOrigin: string): string | string[] {
  const configured = process.env.SOCKET_CORS_ORIGIN ?? process.env.SOCKET_IO_CORS_ORIGIN;
  if (!configured) {
    return [webOrigin, adminOrigin];
  }
  const origins = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length === 1 ? (origins[0] ?? webOrigin) : origins;
}

function attachRedis(io: Server, redisUrl: string): void {
  const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  const subClient = pubClient.duplicate();
  pubClient.on('error', (error: Error) => {
    logger.error('Redis adapter error', { message: error.message });
  });
  subClient.on('error', (error: Error) => {
    logger.error('Redis adapter error', { message: error.message });
  });
  io.adapter(createAdapter(pubClient, subClient));
  logger.info('Socket.io Redis adapter attached');
}
