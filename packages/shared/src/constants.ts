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

export const STALE_APPROVAL_HOURS = 2;

export const PLATFORM_COLORS: Record<Platform, string> = {
  scouty: '#3B82F6',
  giggster: '#8B5CF6',
  peerspace: '#10B981',
  tagvenue: '#F97316',
  direct: '#6B7280',
};
