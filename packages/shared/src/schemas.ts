import { z } from 'zod';
import { BOOKING_STATUSES, PLATFORMS, EVENT_TYPES } from './constants.js';

// --- AI Extraction Schema (output from Workers AI) ---

export const BookingCandidateSchema = z.object({
  platform: z.enum(PLATFORMS),
  platformRef: z.string().optional(),
  guestName: z.string(),
  guestEmail: z.string().email().optional(),
  requestedDate: z.string(), // ISO date YYYY-MM-DD
  startTime: z.string(), // HH:MM 24hr
  endTime: z.string(), // HH:MM 24hr
  durationHours: z.number().positive().optional(),
  roomHint: z.string().optional(),
  guestCount: z.number().int().positive().optional(),
  totalPrice: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  notes: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export type BookingCandidate = z.infer<typeof BookingCandidateSchema>;

// --- API Request Schemas ---

export const UpdateBookingStatusSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
});

export const AssignRoomSchema = z.object({
  room_id: z.string().uuid(),
});

export const AddNoteSchema = z.object({
  note: z.string().min(1).max(2000),
});

export const CreateRoomSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  capacity: z.number().int().positive(),
  hourly_rate: z.number().nonnegative(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const UpdateRoomSchema = CreateRoomSchema.partial().extend({
  active: z.number().int().min(0).max(1).optional(),
});

export const DirectBookingSchema = z.object({
  guest_name: z.string().min(1).max(200),
  guest_email: z.string().email(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  guest_count: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional(),
  room_id: z.string().uuid().optional(),
  turnstile_token: z.string().min(1),
});

export const BookingListQuerySchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  platform: z.enum(PLATFORMS).optional(),
  room_id: z.string().uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assigned_to: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

export const CalendarQuerySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  room_ids: z.string().optional(), // comma-separated UUIDs
});

// --- Queue Message Schema ---

export const QueueMessageSchema = z.object({
  r2Key: z.string(),
  platform: z.enum(PLATFORMS),
  senderDomain: z.string(),
  receivedAt: z.string(),
  messageId: z.string(),
});

export type QueueMessage = z.infer<typeof QueueMessageSchema>;

// --- Event Schema ---

export const BookingEventSchema = z.object({
  event_type: z.enum(EVENT_TYPES),
  actor_id: z.string().uuid().nullable(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
