import type { OrgStatus, OrgType, PlanType, SubscriptionStatus, UserRole } from '@optiworld/shared';
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: string;
    user: {
      userId: string;
      orgId: string | null;
      orgType: OrgType | null;
      role: UserRole;
      orgStatus: OrgStatus | null;
      planType: PlanType | null;
      subscriptionStatus: SubscriptionStatus | null;
    } & DefaultSession['user'];
  }

  interface User {
    userId: string;
    orgId: string | null;
    orgType: OrgType | null;
    role: UserRole;
    orgStatus: OrgStatus | null;
    planType: PlanType | null;
    subscriptionStatus: SubscriptionStatus | null;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    orgId: string | null;
    orgType: OrgType | null;
    role: UserRole;
    orgStatus: OrgStatus | null;
    planType: PlanType | null;
    subscriptionStatus: SubscriptionStatus | null;
    accessToken: string;
    refreshToken: string;
    accessTokenExpires: number;
    error?: string;
  }
}
