import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware, requirePermission } from './middleware/auth.js';
import { rateLimit } from './middleware/rate-limit.js';
import bookings from './routes/bookings.js';
import rooms from './routes/rooms.js';
import calendar from './routes/calendar.js';
import staff from './routes/staff.js';
import analytics from './routes/analytics.js';
import ingest from './routes/ingest.js';
import dashboard from './routes/dashboard.js';
import studioItems from './routes/studio-items.js';
import finance from './routes/finance.js';
import assets from './routes/assets.js';
import invoicesRoute from './routes/invoices.js';
import profileRoute from './routes/profile.js';
import messagingRoute from './routes/messaging.js';
import settingsRoute from './routes/settings.js';
import guestsRoute from './routes/guests.js';
import quotesRoute from './routes/quotes.js';
import contractsRoute from './routes/contracts.js';
import schedulingRoute from './routes/scheduling.js';
import tasksRoute from './routes/tasks.js';
import inventoryRoute from './routes/inventory.js';
import documentsRoute from './routes/documents.js';
import notificationsRoute from './routes/notifications.js';
import reportsRoute from './routes/reports.js';
import resourcePlanningRoute from './routes/resource-planning.js';
import automationRoute from './routes/automation.js';
import marketingRoute from './routes/marketing.js';
import integrationsRoute from './routes/integrations.js';
import emailClassificationsRoute from './routes/email-classifications.js';
import acuityWebhook from './routes/webhooks-acuity.js';
import { ROLE_PERMISSIONS } from '@studioflow360/shared';
import type { Env, StaffContext } from './types.js';

export { BookingHub } from './durable-objects/booking-hub.js';

type AppEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const app = new Hono<AppEnv>();

// Global middleware
app.use('*', logger());
app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      const allowed = [
        'https://app.studiomgr360.com',
        'https://studioflow360.pages.dev',
        'http://localhost:5173',
      ];
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Cf-Access-Jwt-Assertion', 'X-Dev-Email', 'X-Dev-Secret'],
    credentials: true,
  }),
);

// Health check (unauthenticated)
app.get('/api/health', (c) => c.json({ success: true, data: { status: 'ok', environment: c.env.ENVIRONMENT } }));

// Rate limiting for public endpoints
const publicRateLimit = rateLimit({ limit: 30, windowSeconds: 60, prefix: 'pub' });
const ingestRateLimit = rateLimit({ limit: 5, windowSeconds: 60, prefix: 'ingest' });

// Public route: direct website booking ingest (stricter rate limit)
app.use('/api/bookings/ingest/*', ingestRateLimit);
app.route('/api/bookings/ingest', ingest);

// Public route: room availability for public booking page
app.use('/api/public/*', publicRateLimit);
app.get('/api/public/rooms', async (c) => {
  const rooms = await c.env.DB.prepare(
    'SELECT id, name, description, capacity, hourly_rate, color_hex FROM rooms WHERE active = 1 ORDER BY name',
  ).all();
  return c.json({ success: true, data: rooms.results });
});

// Public route: room availability — returns booked slots AND computed open time slots
app.get('/api/public/availability', async (c) => {
  const date = c.req.query('date');
  const roomId = c.req.query('room_id');
  if (!date) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'date required' } }, 400);

  // Operating hours: 08:00 - 22:00 (configurable later via settings)
  const OPEN_HOUR = 8;
  const CLOSE_HOUR = 22;

  const conditions = [`booking_date = ?`, `status NOT IN ('REJECTED', 'CANCELLED')`];
  const params: unknown[] = [date];
  if (roomId) { conditions.push('room_id = ?'); params.push(roomId); }

  const bookings = await c.env.DB.prepare(
    `SELECT room_id, start_time, end_time FROM bookings WHERE ${conditions.join(' AND ')} ORDER BY start_time`,
  ).bind(...params).all();

  // Compute open 30-minute slots
  const booked = bookings.results as Array<{ room_id: string; start_time: string; end_time: string }>;
  const slots: Array<{ time: string; available: boolean }> = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    for (const m of [0, 30]) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const slotEnd = m === 30
        ? `${String(h + 1).padStart(2, '0')}:00`
        : `${String(h).padStart(2, '0')}:30`;
      const isBooked = booked.some(b => b.start_time < slotEnd && b.end_time > time);
      slots.push({ time, available: !isBooked });
    }
  }

  return c.json({
    success: true,
    data: {
      booked: booked,
      slots,
      operating_hours: { open: `${String(OPEN_HOUR).padStart(2, '0')}:00`, close: `${String(CLOSE_HOUR).padStart(2, '0')}:00` },
    },
  });
});

// WebSocket endpoint for real-time updates
app.get('/api/ws', async (c) => {
  const id = c.env.BOOKING_HUB.idFromName('global');
  const hub = c.env.BOOKING_HUB.get(id);
  return hub.fetch(new Request('https://hub/websocket', {
    headers: { Upgrade: 'websocket' },
  }));
});

// Internal broadcast endpoint (called by queue-consumer via service binding)
// Protected: only accessible via service bindings (request URL starts with https://internal/)
// or with a valid INTERNAL_SECRET header
app.post('/api/internal/broadcast', async (c) => {
  // Service binding requests use a synthetic URL like https://internal/...
  // External requests come from real hostnames. Block them unless they have the secret.
  const url = new URL(c.req.url);
  const isServiceBinding = url.hostname === 'internal' || url.hostname === 'fake-host';
  const internalSecret = (c.env as unknown as Record<string, unknown>).INTERNAL_SECRET as string | undefined;
  const providedSecret = c.req.header('X-Internal-Secret');

  if (!isServiceBinding && !(internalSecret && providedSecret === internalSecret)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Internal only' } }, 403);
  }

  const body = await c.req.text();
  const hubId = c.env.BOOKING_HUB.idFromName('global');
  const hub = c.env.BOOKING_HUB.get(hubId);
  await hub.fetch(new Request('https://hub/broadcast', { method: 'POST', body }));
  return c.json({ success: true });
});

// Acuity Scheduling webhook (public, HMAC-verified)
app.route('/api/webhooks/acuity', acuityWebhook);

// All other API routes require authentication
app.use('/api/*', authMiddleware);

// Mount routes
app.route('/api/bookings', bookings);
app.route('/api/rooms', rooms);
app.route('/api/calendar', calendar);
app.route('/api/analytics', analytics);
app.route('/api/dashboard', dashboard);
app.route('/api/studio-items', studioItems);

// Finance routes — require finance permissions
app.use('/api/finance/*', requirePermission('finance.view'));
app.route('/api/finance', finance);

// Assets routes — require assets permissions
app.use('/api/assets/*', requirePermission('assets.view'));
app.route('/api/assets', assets);

// Invoices routes — require invoices permissions
app.use('/api/invoices/*', requirePermission('invoices.view'));
app.route('/api/invoices', invoicesRoute);

// CRM / Guests routes — require guests permissions
app.use('/api/guests/*', requirePermission('guests.view'));
app.route('/api/guests', guestsRoute);

// Quotes routes — require quotes permissions
app.use('/api/quotes/*', requirePermission('quotes.view'));
app.route('/api/quotes', quotesRoute);

// Contracts routes — require contracts permissions
app.use('/api/contracts/*', requirePermission('contracts.view'));
app.route('/api/contracts', contractsRoute);

// Scheduling routes — require scheduling permissions
app.use('/api/scheduling/*', requirePermission('scheduling.view'));
app.route('/api/scheduling', schedulingRoute);

// Tasks routes — require tasks permissions
app.use('/api/tasks/*', requirePermission('tasks.view'));
app.route('/api/tasks', tasksRoute);

// Inventory routes — require inventory permissions
app.use('/api/inventory/*', requirePermission('inventory.view'));
app.route('/api/inventory', inventoryRoute);

// Documents routes — require documents permissions
app.use('/api/documents/*', requirePermission('documents.view'));
app.route('/api/documents', documentsRoute);

// Notifications routes — available to all authenticated (user sees own)
app.route('/api/notifications', notificationsRoute);

// Reports routes — require analytics permissions
app.use('/api/reports/*', requirePermission('analytics.view'));
app.route('/api/reports', reportsRoute);

// Resource Planning routes — require analytics permissions
app.use('/api/resource-planning/*', requirePermission('analytics.view'));
app.route('/api/resource-planning', resourcePlanningRoute);

// Automation routes — require settings.manage permission
app.use('/api/automation/*', requirePermission('settings.manage'));
app.route('/api/automation', automationRoute);

// Marketing routes — require settings.manage permission
app.use('/api/marketing/*', requirePermission('settings.manage'));
app.route('/api/marketing', marketingRoute);

// Integrations routes — require settings.manage permission
app.use('/api/integrations/*', requirePermission('settings.manage'));
app.route('/api/integrations', integrationsRoute);

// Email Classifications routes — require settings.manage permission
app.use('/api/email-classifications/*', requirePermission('settings.manage'));
app.route('/api/email-classifications', emailClassificationsRoute);

// Staff routes — /api/me is available to all authenticated
app.get('/api/me', async (c) => {
  const staffUser = c.get('staff');
  const permissions = ROLE_PERMISSIONS[staffUser.role];
  // Include profile fields
  const row = await c.env.DB.prepare(
    'SELECT phone_number, bio, avatar_r2_key, job_title FROM staff_users WHERE id = ?',
  ).bind(staffUser.id).first();
  const profile = row as Record<string, unknown> | null;
  return c.json({
    success: true,
    data: {
      ...staffUser,
      permissions,
      phone_number: profile?.phone_number ?? null,
      bio: profile?.bio ?? null,
      avatar_url: profile?.avatar_r2_key ? '/api/me/profile/avatar' : null,
      job_title: profile?.job_title ?? null,
    },
  });
});

// Profile management routes
app.route('/api/me/profile', profileRoute);

// Messaging routes
app.route('/api/messaging', messagingRoute);

// Settings routes — settings.view permission is checked in the page, but studio settings are readable by all staff
app.route('/api/settings', settingsRoute);

// /api/staff/list — all authenticated users can see active staff (for assignment dropdowns)
app.get('/api/staff/list', async (c) => {
  const results = await c.env.DB.prepare(
    'SELECT id, display_name, role, avatar_r2_key, job_title, phone_number FROM staff_users WHERE active = 1 ORDER BY display_name',
  ).all();
  // Add avatar URLs
  const data = results.results.map((s) => {
    const staff = s as Record<string, unknown>;
    return { ...staff, avatar_url: staff.avatar_r2_key ? `/api/me/profile/staff-avatar/${staff.id}` : null };
  });
  return c.json({ success: true, data });
});
// /api/staff — admin-only full CRUD
app.use('/api/staff/*', requirePermission('staff.manage'));
app.route('/api/staff', staff);

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: c.env.ENVIRONMENT === 'production' ? 'Internal server error' : err.message,
      },
    },
    500,
  );
});

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
});

export default app;
