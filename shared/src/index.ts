/** Shared types & constants for IceFlow Branch Manager */

export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const ROLES = {
  MAIN_ADMIN: 'MAIN_ADMIN',
  SUB_ADMIN: 'SUB_ADMIN',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const STOCK_MOVEMENT_TYPES = [
  'opening_balance',
  'stock_received_from_main',
  'stock_sent_to_subbranch',
  'stock_out_to_employee',
  'stock_in_from_employee',
  'damaged',
  'expiry',
  'write_off',
  'adjustment_in',
  'adjustment_out',
  'event_reserved',
  'event_delivered',
  'return_to_main',
] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const DISPATCH_STATUSES = [
  'pending',
  'approved',
  'packed',
  'sent',
  'received',
  'cancelled',
] as const;

export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

export const SESSION_STATUSES = [
  'draft',
  'stock_out_saved',
  'stock_in_draft',
  'finalized',
  'voided',
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  'maintenance',
  'miscellaneous',
  'utilities',
  'transport',
  'staff',
  'other',
] as const;

export const RATE_TYPES = {
  MAIN_TO_SUB: 'MAIN_TO_SUB',
  SUB_TO_EMPLOYEE: 'SUB_TO_EMPLOYEE',
} as const;

export const ENTRY_SOURCES = ['manual', 'voice', 'imported', 'adjustment'] as const;
export type EntrySource = (typeof ENTRY_SOURCES)[number];

export const ASSISTANT_NAME = 'Ashok';
export const APP_NAME = 'IceFlow Branch Manager';

export interface JwtPayload {
  sub: string;
  role: Role;
  branchId: string | null;
  branchCode: string | null;
  username: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: Record<string, unknown>;
}
