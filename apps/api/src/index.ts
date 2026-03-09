import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware, requirePermission } from './middleware/auth.js';
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

// Public route: direct website booking ingest
app.route('/api/bookings/ingest', ingest);

// Public route: room availability for public booking page
app.get('/api/public/rooms', async (c) => {
  const rooms = await c.env.DB.prepare(
    'SELECT id, name, description, capacity, hourly_rate, color_hex FROM rooms WHERE active = 1 ORDER BY name',
  ).all();
  return c.json({ success: true, data: rooms.results });
});

// Public route: room availability (booked slots for a given date range)
app.get('/api/public/availability', async (c) => {
  const date = c.req.query('date');
  const roomId = c.req.query('room_id');
  if (!date) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'date required' } }, 400);

  const conditions = [`booking_date = ?`, `status NOT IN ('REJECTED', 'CANCELLED')`];
  const params: unknown[] = [date];
  if (roomId) { conditions.push('room_id = ?'); params.push(roomId); }

  const bookings = await c.env.DB.prepare(
    `SELECT room_id, start_time, end_time FROM bookings WHERE ${conditions.join(' AND ')} ORDER BY start_time`,
  ).bind(...params).all();
  return c.json({ success: true, data: bookings.results });
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
app.post('/api/internal/broadcast', async (c) => {
  const body = await c.req.text();
  const hubId = c.env.BOOKING_HUB.idFromName('global');
  const hub = c.env.BOOKING_HUB.get(hubId);
  await hub.fetch(new Request('https://hub/broadcast', { method: 'POST', body }));
  return c.json({ success: true });
});

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
