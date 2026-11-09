import type { ApprovedConnection, AuthSessionUser, OrgType, UserRole } from '@optiworld/shared';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthSessionUser;
      user?: {
        userId: string;
        orgId: string | null;
        orgType: OrgType | null;
        role: UserRole;
      };
      retailerConnection?: ApprovedConnection;
    }
  }
}

export {};
