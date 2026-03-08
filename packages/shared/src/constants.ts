export const BOOKING_STATUSES = [
  'PENDING',
  'NEEDS_REVIEW',
  'APPROVED',
  'REJECTED',
  'PLATFORM_ACTIONED',
  'CONFIRMED',
  'CANCELLED',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PLATFORMS = ['giggster', 'peerspace', 'scouty', 'tagvenue', 'direct'] as const;

export type Platform = (typeof PLATFORMS)[number];

export const EVENT_TYPES = [
  'RECEIVED',
  'PARSED',
  'ASSIGNED',
  'APPROVED',
  'REJECTED',
  'CONFIRMED',
  'CANCELLED',
  'NOTE_ADDED',
  'PLATFORM_ACTIONED',
  'EDITED',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const STAFF_ROLES = ['admin', 'manager', 'staff'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const VALID_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  NEEDS_REVIEW: ['PENDING', 'APPROVED', 'REJECTED'],
  APPROVED: ['PLATFORM_ACTIONED', 'CANCELLED'],
  REJECTED: [],
  PLATFORM_ACTIONED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  CANCELLED: [],
};

export const AI_CONFIDENCE_THRESHOLD = 0.6;

// --- Studio Management Constants ---

export const STUDIO_ITEM_CATEGORIES = ['maintenance', 'insurance', 'consumables', 'contracts'] as const;
export type StudioItemCategory = (typeof STUDIO_ITEM_CATEGORIES)[number];

export const STUDIO_ITEM_STATUSES = ['pending', 'in_progress', 'completed', 'overdue', 'cancelled'] as const;
export type StudioItemStatus = (typeof STUDIO_ITEM_STATUSES)[number];

export const STUDIO_ITEM_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type StudioItemPriority = (typeof STUDIO_ITEM_PRIORITIES)[number];

export const STUDIO_ITEM_RECURRENCES = ['none', 'weekly', 'monthly', 'quarterly', 'annually'] as const;
export type StudioItemRecurrence = (typeof STUDIO_ITEM_RECURRENCES)[number];

export const STALE_APPROVAL_HOURS = 2;

// --- RBAC Permissions ---

export const PERMISSIONS = [
  'bookings.view',
  'bookings.create',
  'bookings.approve',
  'bookings.reject',
  'bookings.assign',
  'bookings.delete',
  'rooms.view',
  'rooms.manage',
  'staff.view',
  'staff.manage',
  'studio.view',
  'studio.manage',
  'analytics.view',
  'finance.view',
  'finance.manage',
  'assets.view',
  'assets.manage',
  'invoices.view',
  'invoices.create',
  'settings.view',
  'settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  admin: PERMISSIONS, // full access
  manager: [
    'bookings.view', 'bookings.create', 'bookings.approve', 'bookings.reject', 'bookings.assign',
    'rooms.view', 'rooms.manage',
    'staff.view',
    'studio.view', 'studio.manage',
    'analytics.view',
    'finance.view', 'finance.manage',
    'assets.view', 'assets.manage',
    'invoices.view', 'invoices.create',
    'settings.view',
  ],
  staff: [
    'bookings.view', 'bookings.create', 'bookings.assign',
    'rooms.view',
    'staff.view',
    'studio.view',
    'analytics.view',
    'finance.view',
    'assets.view',
    'invoices.view',
  ],
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  scouty: '#3B82F6',
  giggster: '#8B5CF6',
  peerspace: '#10B981',
  tagvenue: '#F97316',
  direct: '#6B7280',
};
