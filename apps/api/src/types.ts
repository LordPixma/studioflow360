export interface Env {
  DB: D1Database;
  SESSION_STORE: KVNamespace;
  RATE_LIMIT: KVNamespace;
  EMAIL_ARCHIVE: R2Bucket;
  BOOKING_HUB: DurableObjectNamespace;
  ENVIRONMENT: string;
  TURNSTILE_SECRET_KEY: string;
  CF_ACCESS_TEAM_DOMAIN: string;
}

export interface StaffContext {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'staff';
}
