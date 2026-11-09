import type { Server, Socket } from 'socket.io';
import { ZodError } from 'zod';
import {
  ConfirmOrderSchema,
  JoinOrderChatSchema,
  ProposeChangeSchema,
  RespondToChangeSchema,
  SendMessageSchema,
  orderChatRoom,
  type AuthSessionUser,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { verifyAccessToken } from '../lib/tokens.js';
import {
  confirmOrder,
  getOrderChat,
  proposeOrderChange,
  respondToOrderChange,
  sendOrderMessage,
} from '../services/order-chat.service.js';
import { emitOrderBroadcasts, type OrderBroadcast } from '../realtime/hub.js';

type Ack = (body: { success: boolean; data?: unknown; error?: SocketErrorBody }) => void;

type SocketErrorBody = {
  code: string;
  message: string;
};

export function registerOrderChat(io: Server): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (typeof token !== 'string' || token.length === 0) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    try {
      const user = verifyAccessToken(token);
      socket.data.token = token;
      socket.data.user = user;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    bind(socket, 'join_order_chat', async (payload) => {
      const { orderId } = parseJoin(payload);
      await joinRoom(socket, orderId);
      return getOrderChat(authFrom(socket), orderId);
    });

    bind(socket, 'send_message', async (payload) => {
      const input = SendMessageSchema.parse(payload);
      await joinRoom(socket, input.orderId);
      return publish(
        input.orderId,
        await sendOrderMessage(authFrom(socket), input.orderId, input.content, input.messageType),
      );
    });

    bind(socket, 'propose_change', async (payload) => {
      const input = ProposeChangeSchema.parse(payload);
      await joinRoom(socket, input.orderId);
      return publish(
        input.orderId,
        await proposeOrderChange(authFrom(socket), input.orderId, input.changes),
      );
    });

    bind(socket, 'respond_to_change', async (payload) => {
      const input = RespondToChangeSchema.parse(payload);
      const outcome = await respondToOrderChange(
        authFrom(socket),
        input.changeRequestId,
        input.action,
      );
      await joinRoom(socket, outcome.result.updatedOrder.id);
      emitOrderBroadcasts(outcome.result.updatedOrder.id, outcome.broadcasts);
      return outcome.result;
    });

    bind(socket, 'confirm_order', async (payload) => {
      const input = ConfirmOrderSchema.parse(payload);
      await joinRoom(socket, input.orderId);
      return publish(input.orderId, await confirmOrder(authFrom(socket), input.orderId));
    });
  });
}

async function joinRoom(socket: Socket, orderId: string): Promise<void> {
  await getOrderChat(authFrom(socket), orderId);
  const nextRoom = orderChatRoom(orderId);
  for (const room of socket.rooms) {
    if (room.startsWith('order_') && room !== nextRoom) {
      await socket.leave(room);
    }
  }
  await socket.join(nextRoom);
}

function bind(
  socket: Socket,
  event: string,
  handler: (payload: unknown) => Promise<unknown>,
): void {
  socket.on(event, (payload: unknown, ack?: Ack) => {
    void handler(payload).then(
      (data) => {
        if (typeof ack === 'function') {
          ack({ success: true, data });
        }
      },
      (error: unknown) => {
        const body = toSocketError(error);
        logger.info('Order chat event rejected', { event, code: body.code });
        if (typeof ack === 'function') {
          ack({ success: false, error: body });
        }
        socket.emit('error', body);
      },
    );
  });
}

function publish<T>(orderId: string, outcome: { result: T; broadcasts: OrderBroadcast[] }): T {
  emitOrderBroadcasts(orderId, outcome.broadcasts);
  return outcome.result;
}

function authFrom(socket: Socket): AuthSessionUser {
  const user = socket.data.user;
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return user;
}

function parseJoin(payload: unknown): { orderId: string } {
  if (typeof payload === 'string') {
    return JoinOrderChatSchema.parse({ orderId: payload });
  }
  return JoinOrderChatSchema.parse(payload);
}

function toSocketError(error: unknown): SocketErrorBody {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof ZodError) {
    return { code: 'VALIDATION_ERROR', message: 'Validation failed' };
  }
  logger.error('Order chat event failed', {
    message: error instanceof Error ? error.message : 'Unknown error',
  });
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong' };
}
