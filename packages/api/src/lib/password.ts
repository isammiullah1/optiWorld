import bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '@optiworld/shared';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
