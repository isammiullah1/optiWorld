import { io, type Socket } from 'socket.io-client';

import { getAccessToken, refreshAccessToken } from './auth-service';

const RECONNECT_DELAY_MS = 1_000;
const RECONNECT_DELAY_MAX_MS = 10_000;

export async function connectOrderChat(): Promise<Socket> {
  const existing = await getAccessToken();
  const accessToken = existing ?? (await refreshAccessToken());
  const socket = io(apiBaseUrl(), {
    auth: { token: accessToken },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: RECONNECT_DELAY_MS,
    reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
  });
  bindTokenRefresh(socket);
  return socket;
}

export function joinOrderChat(socket: Socket, orderId: string): Promise<unknown> {
  return emitWithAck(socket, 'join_order_chat', { orderId });
}

export function sendOrderChatMessage(
  socket: Socket,
  orderId: string,
  content: string,
): Promise<unknown> {
  return emitWithAck(socket, 'send_message', { orderId, content, messageType: 'TEXT' });
}

export function proposeOrderChange(
  socket: Socket,
  orderId: string,
  changes: readonly { catalogProductId: string; quantity: number; agreedPrice: string }[],
): Promise<unknown> {
  return emitWithAck(socket, 'propose_change', { orderId, changes });
}

export function respondToOrderChange(
  socket: Socket,
  changeRequestId: string,
  action: 'ACCEPT' | 'DECLINE',
): Promise<unknown> {
  return emitWithAck(socket, 'respond_to_change', { changeRequestId, action });
}

export function confirmOrderChat(socket: Socket, orderId: string): Promise<unknown> {
  return emitWithAck(socket, 'confirm_order', { orderId });
}

function bindTokenRefresh(socket: Socket): void {
  let refreshAttempts = 0;
  socket.on('connect', () => {
    refreshAttempts = 0;
  });
  socket.on('connect_error', (error: Error) => {
    if (error.message !== 'UNAUTHORIZED' || refreshAttempts >= 1) {
      return;
    }
    refreshAttempts += 1;
    void refreshAccessToken()
      .then((accessToken) => {
        socket.auth = { token: accessToken };
        socket.connect();
      })
      .catch(() => undefined);
  });
}

function emitWithAck(socket: Socket, event: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.timeout(10_000).emit(event, payload, (error: Error | null, response: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

function apiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
}
