export const ORG_TYPES = ['RETAILER', 'WHOLESALER', 'LABORATORY'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const ORG_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const USER_ROLES = [
  'OWNER',
  'STAFF',
  'ADMIN',
  'ORDER_HANDLER',
  'TECHNICIAN',
  'SUPER_ADMIN',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PLAN_TYPES = [
  'RETAILER_STANDARD',
  'WHOLESALER_STANDARD',
  'LABORATORY_STANDARD',
] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const SUBSCRIPTION_STATUSES = [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const VISIBILITY_MODES = ['FULL', 'PRICES_HIDDEN', 'CATALOG_HIDDEN'] as const;
export type VisibilityMode = (typeof VISIBILITY_MODES)[number];

export const CONNECTION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const JOB_STATUSES = [
  'SUBMITTED',
  'CONFIRMED',
  'RECEIVED',
  'CUTTING',
  'FITTING',
  'QC',
  'READY',
  'DISPATCHED',
  'REJECTED',
  'OUTSOURCED',
  'CANCELLED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const ALERT_TYPES = [
  'LOW_STOCK',
  'PAYMENT_DUE',
  'PAYMENT_OVERDUE',
  'LAB_JOB_STATUS',
  'LAB_JOB_READY',
  'ORDER_PLACED',
  'ORDER_CONFIRMED',
  'ORDER_DISPATCHED',
  'ORDER_DELIVERED',
  'INVOICE_REVIEW',
  'CONNECTION_REQUEST',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const CUSTOMER_GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type CustomerGender = (typeof CUSTOMER_GENDERS)[number];

export const INVOICE_STATUSES = ['PAID', 'CREDIT'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'CREDIT', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Local POS invoice state. SYNCING is in flight and is retried after a crash. */
export const SYNC_STATUSES = ['PENDING', 'SYNCING', 'SYNCED', 'CONFLICT'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const CONFLICT_RESOLUTIONS = [
  'ACCEPT_SERVER',
  'ACCEPT_LOCAL',
  'ACKNOWLEDGE_REVIEW',
] as const;
export type ConflictResolution = (typeof CONFLICT_RESOLUTIONS)[number];

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MESSAGE_TYPES = ['TEXT', 'SYSTEM', 'CHANGE_REQUEST'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const CHANGE_REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED'] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const CHANGE_RESPONSE_ACTIONS = ['ACCEPT', 'DECLINE'] as const;
export type ChangeResponseAction = (typeof CHANGE_RESPONSE_ACTIONS)[number];

export const REPLY_CHIP_STATES = [
  'new_order',
  'price_query',
  'change_request',
  'closing',
  'general',
] as const;
export type ReplyChipState = (typeof REPLY_CHIP_STATES)[number];

export const RETAILER_ROLES = ['OWNER', 'STAFF'] as const satisfies readonly UserRole[];
export const WHOLESALER_ROLES = ['ADMIN', 'ORDER_HANDLER'] as const satisfies readonly UserRole[];
export const LABORATORY_ROLES = ['ADMIN', 'TECHNICIAN'] as const satisfies readonly UserRole[];
