export interface Env {
  DB: D1Database;
  SESSION_STORE: KVNamespace;
  RATE_LIMIT: KVNamespace;
  GRAPH_STATE: KVNamespace;
  EMAIL_ARCHIVE: R2Bucket;
  AVATARS: R2Bucket;
  BOOKING_HUB: DurableObjectNamespace;
  AI: Ai;
  ENVIRONMENT: string;
  TURNSTILE_SECRET_KEY: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_PHONE_NUMBER: string;
  TWILIO_WHATSAPP_NUMBER: string;
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
  AZURE_MAILBOX_USER_ID: string;
  ACUITY_USER_ID: string;
  ACUITY_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PUBLIC_KEY: string;
}

export interface StaffContext {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'staff';
}
