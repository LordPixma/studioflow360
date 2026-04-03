import { z } from 'zod';
import { BOOKING_STATUSES, PLATFORMS, EVENT_TYPES, STUDIO_ITEM_CATEGORIES, STUDIO_ITEM_STATUSES, STUDIO_ITEM_PRIORITIES, STUDIO_ITEM_RECURRENCES, GUEST_SOURCES, GUEST_NOTE_TYPES, QUOTE_STATUSES, CONTRACT_STATUSES, SHIFT_TYPES, TIME_OFF_TYPES, TIME_OFF_STATUSES, TASK_CATEGORIES, TASK_STATUSES, TASK_PRIORITIES, TASK_RECURRENCES, INVENTORY_CATEGORIES, INVENTORY_UNITS, INVENTORY_TRANSACTION_TYPES, DOCUMENT_CATEGORIES, NOTIFICATION_TYPES, ACTIVITY_ENTITY_TYPES, REPORT_TYPES, REPORT_SCHEDULES, CAPACITY_TARGET_TYPES, EMAIL_TEMPLATE_TYPES, AUTOMATION_TRIGGER_TYPES, AUTOMATION_ACTION_TYPES, PROMO_TYPES, CAMPAIGN_TYPES, CAMPAIGN_STATUSES, INTEGRATION_TYPES, INTEGRATION_STATUSES, WEBHOOK_EVENT_TYPES } from './constants.js';

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
  guest_phone: z.string().max(30).optional(),
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

// --- Contracts Schemas ---

export const CreateContractSchema = z.object({
  guest_id: z.string().uuid().optional(),
  guest_name: z.string().min(1).max(200),
  guest_email: z.string().email().optional().nullable(),
  guest_company: z.string().max(200).optional().nullable(),
  booking_id: z.string().uuid().optional(),
  quote_id: z.string().uuid().optional(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().max(50000).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  value: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional().nullable(),
  template_id: z.string().uuid().optional(),
});

export const UpdateContractSchema = z.object({
  status: z.enum(CONTRACT_STATUSES).optional(),
  guest_name: z.string().min(1).max(200).optional(),
  guest_email: z.string().email().optional().nullable(),
  guest_company: z.string().max(200).optional().nullable(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().max(50000).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  value: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional().nullable(),
  signed_by_name: z.string().max(200).optional(),
  signed_by_email: z.string().email().optional(),
});

export const CreateContractTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  content: z.string().max(50000),
});

export const UpdateContractTemplateSchema = CreateContractTemplateSchema.partial().extend({
  is_active: z.number().int().min(0).max(1).optional(),
});

// --- Scheduling Schemas ---

export const CreateShiftSchema = z.object({
  staff_id: z.string().uuid(),
  room_id: z.string().uuid().optional(),
  shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  shift_type: z.enum(SHIFT_TYPES).default('regular'),
  notes: z.string().max(500).optional(),
});

export const UpdateShiftSchema = CreateShiftSchema.partial();

export const CreateTimeOffSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  request_type: z.enum(TIME_OFF_TYPES).default('holiday'),
  reason: z.string().max(1000).optional(),
});

export const ReviewTimeOffSchema = z.object({
  status: z.enum(TIME_OFF_STATUSES),
});

// --- Tasks Schemas ---

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional().nullable(),
  category: z.enum(TASK_CATEGORIES).default('general'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  due_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  room_id: z.string().uuid().optional().nullable(),
  asset_id: z.string().uuid().optional().nullable(),
  booking_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  is_recurring: z.number().int().min(0).max(1).optional(),
  recurrence_rule: z.enum(TASK_RECURRENCES).optional().nullable(),
  recurrence_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  checklist: z.array(z.object({ label: z.string().min(1).max(300) })).optional(),
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional().nullable(),
  category: z.enum(TASK_CATEGORIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  due_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  room_id: z.string().uuid().optional().nullable(),
  asset_id: z.string().uuid().optional().nullable(),
  booking_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
});

export const CreateTaskCommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const ToggleChecklistItemSchema = z.object({
  is_checked: z.number().int().min(0).max(1),
});

// --- Inventory Schemas ---

export const CreateInventoryItemSchema = z.object({
  sku: z.string().max(50).optional().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(INVENTORY_CATEGORIES).default('general'),
  unit: z.enum(INVENTORY_UNITS).default('pcs'),
  quantity_on_hand: z.number().int().min(0).default(0),
  minimum_stock: z.number().int().min(0).default(0),
  reorder_quantity: z.number().int().min(0).default(0),
  unit_cost: z.number().nonnegative().default(0),
  supplier: z.string().max(200).optional().nullable(),
  supplier_url: z.string().max(500).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  room_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const UpdateInventoryItemSchema = CreateInventoryItemSchema.partial().extend({
  is_active: z.number().int().min(0).max(1).optional(),
});

export const CreateInventoryTransactionSchema = z.object({
  item_id: z.string().uuid(),
  transaction_type: z.enum(INVENTORY_TRANSACTION_TYPES),
  quantity: z.number().int(),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  booking_id: z.string().uuid().optional().nullable(),
});

// --- Documents Schemas ---

export const UploadDocumentSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES).default('other'),
  description: z.string().max(1000).optional().nullable(),
  booking_id: z.string().uuid().optional().nullable(),
  guest_id: z.string().uuid().optional().nullable(),
  contract_id: z.string().uuid().optional().nullable(),
  task_id: z.string().uuid().optional().nullable(),
  asset_id: z.string().uuid().optional().nullable(),
  room_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().max(50)).optional(),
});

export const UpdateDocumentSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES).optional(),
  description: z.string().max(1000).optional().nullable(),
  booking_id: z.string().uuid().optional().nullable(),
  guest_id: z.string().uuid().optional().nullable(),
  contract_id: z.string().uuid().optional().nullable(),
  task_id: z.string().uuid().optional().nullable(),
  asset_id: z.string().uuid().optional().nullable(),
  room_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().max(50)).optional(),
});

// --- Notifications Schemas ---

export const CreateNotificationSchema = z.object({
  recipient_id: z.string().uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().min(1).max(300),
  body: z.string().max(1000).optional().nullable(),
  link: z.string().max(500).optional().nullable(),
  entity_type: z.enum(ACTIVITY_ENTITY_TYPES).optional().nullable(),
  entity_id: z.string().uuid().optional().nullable(),
});

// --- Reports & Resource Planning Schemas ---

export const CreateSavedReportSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  report_type: z.enum(REPORT_TYPES),
  filters: z.record(z.string(), z.unknown()).optional(),
  schedule: z.enum(REPORT_SCHEDULES).optional().nullable(),
  is_pinned: z.number().int().min(0).max(1).optional(),
});

export const UpdateSavedReportSchema = CreateSavedReportSchema.partial();

export const CreateCapacityTargetSchema = z.object({
  room_id: z.string().uuid(),
  target_type: z.enum(CAPACITY_TARGET_TYPES),
  target_value: z.number().positive(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const ReportQuerySchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  room_id: z.string().uuid().optional(),
  platform: z.enum(PLATFORMS).optional(),
  group_by: z.enum(['day', 'week', 'month'] as const).optional(),
  format: z.enum(['json', 'csv'] as const).optional(),
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

// --- Automation Schemas ---

export const CreateEmailTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  body_html: z.string().min(1).max(50000),
  body_text: z.string().max(50000).optional().nullable(),
  template_type: z.enum(EMAIL_TEMPLATE_TYPES).default('general'),
  variables: z.array(z.string().max(100)).optional(),
});

export const UpdateEmailTemplateSchema = CreateEmailTemplateSchema.partial().extend({
  is_active: z.number().int().min(0).max(1).optional(),
});

export const CreateAutomationRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  trigger_type: z.enum(AUTOMATION_TRIGGER_TYPES),
  trigger_config: z.record(z.string(), z.unknown()).optional(),
  action_type: z.enum(AUTOMATION_ACTION_TYPES),
  action_config: z.record(z.string(), z.unknown()).optional(),
  email_template_id: z.string().uuid().optional().nullable(),
  is_active: z.number().int().min(0).max(1).optional(),
});

export const UpdateAutomationRuleSchema = CreateAutomationRuleSchema.partial();

// --- Marketing & Promotions Schemas ---

export const CreatePromotionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  promo_type: z.enum(PROMO_TYPES).default('percentage'),
  discount_value: z.number().min(0),
  min_booking_value: z.number().min(0).optional().nullable(),
  max_discount: z.number().min(0).optional().nullable(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valid_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  usage_limit: z.number().int().min(1).optional().nullable(),
  applicable_rooms: z.array(z.string().uuid()).optional(),
  applicable_platforms: z.array(z.enum(PLATFORMS)).optional(),
});

export const UpdatePromotionSchema = CreatePromotionSchema.partial().extend({
  is_active: z.number().int().min(0).max(1).optional(),
});

export const CreatePromoCodeSchema = z.object({
  promotion_id: z.string().uuid(),
  code: z.string().min(3).max(30).regex(/^[A-Z0-9_-]+$/),
  max_uses: z.number().int().min(1).optional().nullable(),
});

export const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  campaign_type: z.enum(CAMPAIGN_TYPES).default('email'),
  target_audience: z.record(z.string(), z.unknown()).optional(),
  content: z.string().max(50000).optional().nullable(),
  subject: z.string().max(500).optional().nullable(),
  email_template_id: z.string().uuid().optional().nullable(),
  promotion_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.string().optional().nullable(),
});

export const UpdateCampaignSchema = CreateCampaignSchema.partial().extend({
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});

export const UpdateGuestPortalSchema = z.object({
  welcome_message: z.string().max(2000).optional().nullable(),
  booking_instructions: z.string().max(2000).optional().nullable(),
  cancellation_policy: z.string().max(5000).optional().nullable(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  custom_css: z.string().max(10000).optional().nullable(),
  show_pricing: z.number().int().min(0).max(1).optional(),
  show_availability: z.number().int().min(0).max(1).optional(),
  require_approval: z.number().int().min(0).max(1).optional(),
});

// --- Integrations Schemas ---

export const CreateIntegrationSchema = z.object({
  name: z.string().min(1).max(200),
  integration_type: z.enum(INTEGRATION_TYPES),
  config: z.record(z.string(), z.unknown()).optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateIntegrationSchema = CreateIntegrationSchema.partial().extend({
  status: z.enum(INTEGRATION_STATUSES).optional(),
  is_active: z.number().int().min(0).max(1).optional(),
});

export const CreateWebhookEndpointSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().max(1000),
  secret: z.string().max(200).optional().nullable(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
});

export const UpdateWebhookEndpointSchema = CreateWebhookEndpointSchema.partial().extend({
  is_active: z.number().int().min(0).max(1).optional(),
});
