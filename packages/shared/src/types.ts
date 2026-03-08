import type { BookingStatus, Platform, EventType, StaffRole, StudioItemCategory, StudioItemStatus, StudioItemPriority, StudioItemRecurrence } from './constants.js';

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
