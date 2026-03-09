import type { BookingStatus, Platform, EventType, StaffRole, StudioItemCategory, StudioItemStatus, StudioItemPriority, StudioItemRecurrence, GuestSource, GuestNoteType, QuoteStatus, ContractStatus, ShiftType, TimeOffType, TimeOffStatus, TaskCategory, TaskStatus, TaskPriority, TaskRecurrence, InventoryCategory, InventoryUnit, InventoryTransactionType } from './constants.js';

// --- D1 Row Types ---

export interface RoomRow {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  hourly_rate: number;
  color_hex: string;
  active: number; // 0 or 1
  created_at: string;
}

export interface BookingRow {
  id: string;
  platform: Platform;
  platform_ref: string | null;
  status: BookingStatus;
  room_id: string | null;
  guest_name: string;
  guest_email: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number | null;
  guest_count: number | null;
  total_price: number | null;
  currency: string | null;
  notes: string | null;
  ai_confidence: number | null;
  staff_notes: string | null;
  assigned_to: string | null;
  approved_at: string | null;
  approved_by: string | null;
  platform_actioned: number; // 0 or 1
  platform_actioned_at: string | null;
  raw_email_r2_key: string | null;
  external_chat_link: string | null;
  coordinator_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffUserRow {
  id: string;
  access_email: string;
  display_name: string;
  role: StaffRole;
  active: number; // 0 or 1
  phone_number: string | null;
  bio: string | null;
  avatar_r2_key: string | null;
  job_title: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface BookingEventRow {
  id: string;
  booking_id: string;
  event_type: EventType;
  actor_id: string | null;
  payload: string | null; // JSON string
  created_at: string;
}

export interface PlatformEmailRuleRow {
  id: string;
  platform: Platform;
  sender_domain: string;
  subject_pattern: string | null;
  active: number; // 0 or 1
}

// --- API Response Types ---

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  pagination?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface BookingDetail extends BookingRow {
  room?: RoomRow | null;
  events?: BookingEventRow[];
  assigned_staff?: StaffUserRow | null;
}

export interface MessageRow {
  id: string;
  booking_id: string;
  direction: 'inbound' | 'outbound';
  channel: 'sms' | 'whatsapp';
  from_number: string;
  to_number: string;
  body: string;
  twilio_sid: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'received';
  created_at: string;
}

export interface StudioItemRow {
  id: string;
  category: StudioItemCategory;
  title: string;
  description: string | null;
  status: StudioItemStatus;
  priority: StudioItemPriority;
  due_date: string | null;
  cost: number | null;
  currency: string | null;
  vendor: string | null;
  recurrence: StudioItemRecurrence;
  notes: string | null;
  created_by: string;
  assigned_to: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConflictInfo {
  booking_id: string;
  guest_name: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
}

// --- Finance Types ---

export type BudgetCategory = 'operations' | 'maintenance' | 'marketing' | 'equipment' | 'supplies' | 'other';
export type BudgetPeriod = 'monthly' | 'quarterly' | 'annually';
export type PurchaseStatus = 'pending' | 'approved' | 'paid' | 'rejected' | 'refunded';
export type AssetCategory = 'equipment' | 'furniture' | 'electronics' | 'software' | 'vehicle' | 'other';
export type AssetStatus = 'active' | 'maintenance' | 'retired' | 'disposed' | 'lost';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'refunded';

export interface BudgetRow {
  id: string;
  name: string;
  category: BudgetCategory;
  amount: number;
  spent: number;
  period: BudgetPeriod;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseRow {
  id: string;
  budget_id: string | null;
  description: string;
  vendor: string | null;
  amount: number;
  currency: string;
  category: BudgetCategory;
  status: PurchaseStatus;
  receipt_r2_key: string | null;
  purchase_date: string;
  paid_date: string | null;
  approved_by: string | null;
  created_by: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetRow {
  id: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  serial_number: string | null;
  model: string | null;
  manufacturer: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  current_value: number | null;
  currency: string;
  location: string | null;
  room_id: string | null;
  assigned_to: string | null;
  warranty_expiry: string | null;
  notes: string | null;
  photo_r2_key: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  booking_id: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_address: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  issued_date: string;
  due_date: string;
  paid_date: string | null;
  notes: string | null;
  line_items: string; // JSON string of InvoiceLineItem[]
  created_by: string;
  created_at: string;
  updated_at: string;
}

// --- CRM Types ---

export interface GuestRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  tags: string; // JSON array of tag strings
  source: GuestSource;
  total_bookings: number;
  total_revenue: number;
  last_booking_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuestNoteRow {
  id: string;
  guest_id: string;
  note_type: GuestNoteType;
  content: string;
  created_by: string;
  created_at: string;
}

export interface GuestBookingLink {
  guest_id: string;
  booking_id: string;
  linked_at: string;
}

// --- Quotes Types ---

export interface QuoteRow {
  id: string;
  quote_number: string;
  guest_id: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_company: string | null;
  guest_address: string | null;
  booking_id: string | null;
  title: string;
  status: QuoteStatus;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  valid_until: string | null;
  accepted_at: string | null;
  converted_invoice_id: string | null;
  notes: string | null;
  terms: string | null;
  template_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface QuoteLineItemRow {
  id: string;
  quote_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
}

export interface QuoteTemplateRow {
  id: string;
  name: string;
  description: string | null;
  line_items: string; // JSON
  discount_percent: number;
  tax_rate: number;
  terms: string | null;
  notes: string | null;
  is_active: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// --- Contracts Types ---

export interface ContractRow {
  id: string;
  contract_number: string;
  guest_id: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_company: string | null;
  booking_id: string | null;
  quote_id: string | null;
  title: string;
  status: ContractStatus;
  content: string;
  start_date: string | null;
  end_date: string | null;
  value: number;
  currency: string;
  signed_at: string | null;
  signed_by_name: string | null;
  signed_by_email: string | null;
  notes: string | null;
  template_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContractTemplateRow {
  id: string;
  name: string;
  description: string | null;
  content: string;
  is_active: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// --- Scheduling Types ---

export interface StaffShiftRow {
  id: string;
  staff_id: string;
  room_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type: ShiftType;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TimeOffRequestRow {
  id: string;
  staff_id: string;
  request_type: TimeOffType;
  start_date: string;
  end_date: string;
  status: TimeOffStatus;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- Tasks Types ---

export interface TaskRow {
  id: string;
  task_number: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  due_time: string | null;
  room_id: string | null;
  asset_id: string | null;
  booking_id: string | null;
  assigned_to: string | null;
  is_recurring: number;
  recurrence_rule: TaskRecurrence | null;
  recurrence_end_date: string | null;
  parent_task_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskCommentRow {
  id: string;
  task_id: string;
  content: string;
  created_by: string;
  created_at: string;
}

export interface TaskChecklistItemRow {
  id: string;
  task_id: string;
  label: string;
  is_checked: number;
  sort_order: number;
  checked_at: string | null;
  checked_by: string | null;
  created_at: string;
}

// --- Inventory Types ---

export interface InventoryItemRow {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: InventoryCategory;
  unit: InventoryUnit;
  quantity_on_hand: number;
  minimum_stock: number;
  reorder_quantity: number;
  unit_cost: number;
  currency: string;
  supplier: string | null;
  supplier_url: string | null;
  location: string | null;
  room_id: string | null;
  notes: string | null;
  is_active: number;
  last_restocked_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransactionRow {
  id: string;
  item_id: string;
  transaction_type: InventoryTransactionType;
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  reference: string | null;
  notes: string | null;
  booking_id: string | null;
  created_by: string;
  created_at: string;
}

export interface StudioSettingsRow {
  id: string;
  studio_name: string;
  studio_subtitle: string | null;
  studio_address: string | null;
  studio_email: string | null;
  studio_phone: string | null;
  studio_website: string | null;
  logo_r2_key: string | null;
  invoice_payment_terms: string | null;
  invoice_bank_details: string | null;
  invoice_notes: string | null;
  invoice_tax_rate: number;
  invoice_currency: string;
  invoice_due_days: number;
  updated_at: string;
  updated_by: string | null;
}
