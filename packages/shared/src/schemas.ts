import { z } from 'zod';
import { BOOKING_STATUSES, PLATFORMS, EVENT_TYPES, STUDIO_ITEM_CATEGORIES, STUDIO_ITEM_STATUSES, STUDIO_ITEM_PRIORITIES, STUDIO_ITEM_RECURRENCES, GUEST_SOURCES, GUEST_NOTE_TYPES, QUOTE_STATUSES } from './constants.js';

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

export const StaffBookingSchema = z.object({
  guest_name: z.string().min(1).max(200),
  guest_email: z.string().email().optional(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  guest_count: z.number().int().positive().optional(),
  total_price: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
  room_id: z.string().uuid().optional(),
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

// --- Studio Management Schemas ---

export const CreateStudioItemSchema = z.object({
  category: z.enum(STUDIO_ITEM_CATEGORIES),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(STUDIO_ITEM_STATUSES).default('pending'),
  priority: z.enum(STUDIO_ITEM_PRIORITIES).default('medium'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cost: z.number().nonnegative().optional(),
  vendor: z.string().max(200).optional(),
  recurrence: z.enum(STUDIO_ITEM_RECURRENCES).default('none'),
  notes: z.string().max(2000).optional(),
  assigned_to: z.string().uuid().optional(),
});

export const UpdateStudioItemSchema = CreateStudioItemSchema.partial();

export const StudioItemListQuerySchema = z.object({
  category: z.enum(STUDIO_ITEM_CATEGORIES).optional(),
  status: z.enum(STUDIO_ITEM_STATUSES).optional(),
  priority: z.enum(STUDIO_ITEM_PRIORITIES).optional(),
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
});

// --- Finance Schemas ---

const BUDGET_CATEGORIES = ['operations', 'maintenance', 'marketing', 'equipment', 'supplies', 'other'] as const;
const BUDGET_PERIODS = ['monthly', 'quarterly', 'annually'] as const;
const PURCHASE_STATUSES = ['pending', 'approved', 'paid', 'rejected', 'refunded'] as const;
const ASSET_CATEGORIES = ['equipment', 'furniture', 'electronics', 'software', 'vehicle', 'other'] as const;
const ASSET_STATUSES = ['active', 'maintenance', 'retired', 'disposed', 'lost'] as const;
const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'] as const;

export const CreateBudgetSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(BUDGET_CATEGORIES),
  amount: z.number().positive(),
  period: z.enum(BUDGET_PERIODS),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional(),
});

export const UpdateBudgetSchema = CreateBudgetSchema.partial();

export const CreatePurchaseSchema = z.object({
  budget_id: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  vendor: z.string().max(200).optional(),
  amount: z.number().positive(),
  category: z.enum(BUDGET_CATEGORIES),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional(),
});

export const UpdatePurchaseSchema = z.object({
  status: z.enum(PURCHASE_STATUSES).optional(),
  description: z.string().min(1).max(500).optional(),
  vendor: z.string().max(200).optional(),
  amount: z.number().positive().optional(),
  category: z.enum(BUDGET_CATEGORIES).optional(),
  notes: z.string().max(2000).optional(),
});

export const CreateAssetSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(ASSET_CATEGORIES),
  serial_number: z.string().max(100).optional(),
  model: z.string().max(200).optional(),
  manufacturer: z.string().max(200).optional(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  purchase_price: z.number().nonnegative().optional(),
  current_value: z.number().nonnegative().optional(),
  location: z.string().max(200).optional(),
  room_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  warranty_expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
});

export const UpdateAssetSchema = CreateAssetSchema.partial().extend({
  status: z.enum(ASSET_STATUSES).optional(),
});

export const InvoiceLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

export const CreateInvoiceSchema = z.object({
  booking_id: z.string().uuid().optional(),
  guest_name: z.string().min(1).max(200),
  guest_email: z.string().email().optional(),
  guest_address: z.string().max(500).optional(),
  line_items: z.array(InvoiceLineItemSchema).min(1),
  tax_rate: z.number().min(0).max(100).default(20),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional(),
});

export const UpdateInvoiceSchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  guest_name: z.string().min(1).max(200).optional(),
  guest_email: z.string().email().optional(),
  guest_address: z.string().max(500).optional(),
  line_items: z.array(InvoiceLineItemSchema).min(1).optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
});

// --- Staff Profile Schemas ---

export const UpdateProfileSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  phone_number: z.string().max(20).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  job_title: z.string().max(100).optional().nullable(),
});

// --- Messaging Schemas ---

export const SendMessageSchema = z.object({
  booking_id: z.string().uuid(),
  channel: z.enum(['sms', 'whatsapp'] as const),
  to_number: z.string().min(10).max(20),
  body: z.string().min(1).max(1600),
});

export const UpdateBookingChatSchema = z.object({
  external_chat_link: z.string().url().optional().nullable(),
  coordinator_phone: z.string().max(20).optional().nullable(),
});

// --- CRM Schemas ---

export const CreateGuestSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  tags: z.array(z.string().max(50)).optional(),
  source: z.enum(GUEST_SOURCES).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export const UpdateGuestSchema = CreateGuestSchema.partial();

export const CreateGuestNoteSchema = z.object({
  note_type: z.enum(GUEST_NOTE_TYPES).default('note'),
  content: z.string().min(1).max(5000),
});

export const LinkGuestBookingSchema = z.object({
  booking_id: z.string().uuid(),
});

// --- Quotes Schemas ---

export const QuoteLineItemInputSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

export const CreateQuoteSchema = z.object({
  guest_id: z.string().uuid().optional(),
  guest_name: z.string().min(1).max(200),
  guest_email: z.string().email().optional().nullable(),
  guest_company: z.string().max(200).optional().nullable(),
  guest_address: z.string().max(500).optional().nullable(),
  booking_id: z.string().uuid().optional(),
  title: z.string().min(1).max(300).optional(),
  line_items: z.array(QuoteLineItemInputSchema).min(1),
  discount_percent: z.number().min(0).max(100).optional(),
  tax_rate: z.number().min(0).max(100).default(20),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional().nullable(),
  terms: z.string().max(5000).optional().nullable(),
  template_id: z.string().uuid().optional(),
});

export const UpdateQuoteSchema = z.object({
  status: z.enum(QUOTE_STATUSES).optional(),
  guest_name: z.string().min(1).max(200).optional(),
  guest_email: z.string().email().optional().nullable(),
  guest_company: z.string().max(200).optional().nullable(),
  guest_address: z.string().max(500).optional().nullable(),
  title: z.string().min(1).max(300).optional(),
  line_items: z.array(QuoteLineItemInputSchema).min(1).optional(),
  discount_percent: z.number().min(0).max(100).optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  terms: z.string().max(5000).optional().nullable(),
});

export const CreateQuoteTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  line_items: z.array(QuoteLineItemInputSchema).min(1),
  discount_percent: z.number().min(0).max(100).optional(),
  tax_rate: z.number().min(0).max(100).default(20),
  terms: z.string().max(5000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const UpdateQuoteTemplateSchema = CreateQuoteTemplateSchema.partial().extend({
  is_active: z.number().int().min(0).max(1).optional(),
});

// --- Studio Settings Schema ---

export const UpdateStudioSettingsSchema = z.object({
  studio_name: z.string().min(1).max(200).optional(),
  studio_subtitle: z.string().max(300).optional().nullable(),
  studio_address: z.string().max(500).optional().nullable(),
  studio_email: z.string().email().optional().nullable(),
  studio_phone: z.string().max(30).optional().nullable(),
  studio_website: z.string().max(300).optional().nullable(),
  invoice_payment_terms: z.string().max(1000).optional().nullable(),
  invoice_bank_details: z.string().max(1000).optional().nullable(),
  invoice_notes: z.string().max(2000).optional().nullable(),
  invoice_tax_rate: z.number().min(0).max(100).optional(),
  invoice_currency: z.string().length(3).optional(),
  invoice_due_days: z.number().int().min(1).max(365).optional(),
});
