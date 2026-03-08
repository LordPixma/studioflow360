export interface Env {
  DB: D1Database;
  SESSION_STORE: KVNamespace;
  RATE_LIMIT: KVNamespace;
  EMAIL_ARCHIVE: R2Bucket;
  AVATARS: R2Bucket;
  BOOKING_HUB: DurableObjectNamespace;
  ENVIRONMENT: string;
  TURNSTILE_SECRET_KEY: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  TWILIO_WHATSAPP_NUMBER: string;
}

export interface StaffContext {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'staff';
}
