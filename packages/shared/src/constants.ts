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

// --- Tasks Constants ---

export const TASK_CATEGORIES = ['general', 'maintenance', 'cleaning', 'repair', 'setup', 'teardown', 'admin', 'follow_up'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_STATUSES = ['open', 'in_progress', 'completed', 'cancelled', 'on_hold'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_RECURRENCES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annually'] as const;
export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

// --- Inventory Constants ---

export const INVENTORY_CATEGORIES = ['general', 'cables', 'batteries', 'tape', 'lighting', 'audio', 'cleaning', 'stationery', 'refreshments', 'safety', 'other'] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export const INVENTORY_UNITS = ['pcs', 'boxes', 'rolls', 'packs', 'litres', 'kg', 'metres', 'pairs', 'sets'] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const INVENTORY_TRANSACTION_TYPES = ['restock', 'usage', 'adjustment', 'return', 'write_off'] as const;
export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPES)[number];

// --- Reports & Resource Planning Constants ---

export const REPORT_TYPES = ['revenue', 'occupancy', 'bookings', 'staff_utilization', 'guest_activity', 'financial_summary', 'inventory_usage', 'task_completion', 'custom'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_SCHEDULES = ['daily', 'weekly', 'monthly', 'quarterly'] as const;
export type ReportSchedule = (typeof REPORT_SCHEDULES)[number];

export const CAPACITY_TARGET_TYPES = ['daily_hours', 'weekly_hours', 'monthly_revenue', 'monthly_bookings'] as const;
export type CapacityTargetType = (typeof CAPACITY_TARGET_TYPES)[number];

export const EXPORT_FORMATS = ['csv', 'pdf', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

// --- Automation Constants ---

export const EMAIL_TEMPLATE_TYPES = ['general', 'booking_confirmation', 'booking_reminder', 'booking_followup', 'quote_sent', 'invoice_sent', 'welcome', 'promotional'] as const;
export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number];

export const AUTOMATION_TRIGGER_TYPES = [
  'booking_created', 'booking_approved', 'booking_rejected', 'booking_confirmed', 'booking_cancelled',
  'booking_stale', 'guest_created', 'task_overdue', 'inventory_low_stock', 'contract_signed',
  'quote_accepted', 'time_off_approved', 'scheduled',
] as const;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

export const AUTOMATION_ACTION_TYPES = [
  'send_email', 'send_notification', 'create_task', 'update_booking_status',
  'assign_staff', 'create_invoice', 'webhook', 'log_activity',
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

export const AUTOMATION_LOG_STATUSES = ['success', 'failed', 'skipped'] as const;
export type AutomationLogStatus = (typeof AUTOMATION_LOG_STATUSES)[number];

// --- Marketing & Promotions Constants ---

export const PROMO_TYPES = ['percentage', 'fixed_amount', 'free_hours', 'package'] as const;
export type PromoType = (typeof PROMO_TYPES)[number];

export const CAMPAIGN_TYPES = ['email', 'sms', 'in_app'] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'cancelled'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

// --- Integrations Constants ---

export const INTEGRATION_TYPES = ['google_calendar', 'outlook', 'stripe', 'xero', 'quickbooks', 'slack', 'zapier', 'custom_webhook'] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

export const INTEGRATION_STATUSES = ['inactive', 'active', 'error', 'pending'] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const WEBHOOK_EVENT_TYPES = [
  'booking.created', 'booking.updated', 'booking.approved', 'booking.cancelled',
  'guest.created', 'guest.updated', 'invoice.created', 'invoice.paid',
  'task.created', 'task.completed', 'contract.signed',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_LOG_STATUSES = ['pending', 'success', 'failed', 'retrying'] as const;
export type WebhookLogStatus = (typeof WEBHOOK_LOG_STATUSES)[number];

// --- Documents Constants ---

export const DOCUMENT_CATEGORIES = ['contract', 'invoice', 'receipt', 'photo', 'certificate', 'insurance', 'floor_plan', 'rider', 'release_form', 'other'] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

// --- Notifications Constants ---

export const NOTIFICATION_TYPES = [
  'booking_new', 'booking_status', 'booking_assigned',
  'task_assigned', 'task_due', 'task_completed',
  'time_off_request', 'time_off_reviewed',
  'contract_signed', 'quote_accepted',
  'inventory_low_stock', 'document_uploaded',
  'comment_added', 'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ACTIVITY_ENTITY_TYPES = ['booking', 'task', 'contract', 'quote', 'guest', 'shift', 'time_off', 'inventory', 'document', 'asset'] as const;
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];

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
  'tasks.view',
  'tasks.manage',
  'inventory.view',
  'inventory.manage',
  'documents.view',
  'documents.manage',
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
    'tasks.view', 'tasks.manage',
    'inventory.view', 'inventory.manage',
    'documents.view', 'documents.manage',
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
    'tasks.view',
    'inventory.view',
    'documents.view',
  ],
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  scouty: '#3B82F6',
  giggster: '#8B5CF6',
  peerspace: '#10B981',
  tagvenue: '#F97316',
  direct: '#6B7280',
};
