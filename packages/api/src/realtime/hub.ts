import type { Server } from 'socket.io';

import { orderChatRoom } from '@optiworld/shared';

export type OrderBroadcast = {
  event:
    | 'message_received'
    | 'change_proposed'
    | 'change_responded'
    | 'order_confirmed'
    | 'order_status_updated';
  payload: object;
};

let server: Server | undefined;

export function setChatServer(next: Server): void {
  server = next;
}

export function chatServer(): Server | undefined {
  return server;
}

export function emitOrderBroadcasts(orderId: string, broadcasts: readonly OrderBroadcast[]): void {
  if (!server) {
    return;
  }
  const room = orderChatRoom(orderId);
  for (const broadcast of broadcasts) {
    server.to(room).emit(broadcast.event, broadcast.payload);
  }
}
