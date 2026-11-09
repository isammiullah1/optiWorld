import type {
  OrgStatus,
  OrgType,
  PlanType,
  SubscriptionStatus,
  UserRole,
  VisibilityMode,
} from '../enums/index.js';

/** Session identity shared by NextAuth and API access tokens. */
export type AuthSessionUser = {
  userId: string;
  email: string;
  name: string;
  orgId: string | null;
  orgType: OrgType | null;
  role: UserRole;
  orgStatus: OrgStatus | null;
  planType: PlanType | null;
  subscriptionStatus: SubscriptionStatus | null;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type LoginResponse = AuthTokens & {
  user: AuthSessionUser;
};

export type ApprovedConnection = {
  id: string;
  wholesalerOrgId: string;
  retailerOrgId: string;
  visibilityMode: VisibilityMode;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
