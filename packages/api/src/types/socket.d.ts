import type { AuthSessionUser } from '@optiworld/shared';
import 'socket.io';

declare module 'socket.io' {
  interface SocketData {
    token: string;
    user: AuthSessionUser;
  }
}
