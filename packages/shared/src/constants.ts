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
  'UNAPPROVED',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const STAFF_ROLES = ['admin', 'manager', 'staff'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const VALID_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  NEEDS_REVIEW: ['PENDING', 'APPROVED', 'REJECTED'],
  APPROVED: ['PENDING', 'PLATFORM_ACTIONED', 'CANCELLED'],
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

// --- CRM Constants ---

export const GUEST_SOURCES = ['booking', 'manual', 'import'] as const;
export type GuestSource = (typeof GUEST_SOURCES)[number];

export const GUEST_NOTE_TYPES = ['note', 'call', 'email', 'meeting', 'follow_up'] as const;
export type GuestNoteType = (typeof GUEST_NOTE_TYPES)[number];

export const GUEST_TAG_PRESETS = ['VIP', 'corporate', 'repeat', 'influencer', 'production', 'photography', 'music', 'podcast', 'event'] as const;

// --- Quotes Constants ---

export const QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

// --- Contracts Constants ---

export const CONTRACT_STATUSES = ['draft', 'sent', 'signed', 'active', 'expired', 'cancelled'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

// --- Scheduling Constants ---

export const SHIFT_TYPES = ['regular', 'overtime', 'on_call', 'cover'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

export const TIME_OFF_TYPES = ['holiday', 'sick', 'personal', 'other'] as const;
export type TimeOffType = (typeof TIME_OFF_TYPES)[number];

export const TIME_OFF_STATUSES = ['pending', 'approved', 'declined'] as const;
export type TimeOffStatus = (typeof TIME_OFF_STATUSES)[number];

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
  'guests.view',
  'guests.manage',
  'quotes.view',
  'quotes.create',
  'contracts.view',
  'contracts.manage',
  'scheduling.view',
  'scheduling.manage',
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
    'guests.view', 'guests.manage',
    'quotes.view', 'quotes.create',
    'contracts.view', 'contracts.manage',
    'scheduling.view', 'scheduling.manage',
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
    'guests.view',
    'quotes.view',
    'contracts.view',
    'scheduling.view',
  ],
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  scouty: '#3B82F6',
  giggster: '#8B5CF6',
  peerspace: '#10B981',
  tagvenue: '#F97316',
  direct: '#6B7280',
};
