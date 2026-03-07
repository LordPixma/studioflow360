import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authMiddleware, requireRole } from './middleware/auth.js';
import bookings from './routes/bookings.js';
import rooms from './routes/rooms.js';
import calendar from './routes/calendar.js';
import staff from './routes/staff.js';
import analytics from './routes/analytics.js';
import ingest from './routes/ingest.js';
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

// WebSocket endpoint for real-time updates
app.get('/api/ws', async (c) => {
  const id = c.env.BOOKING_HUB.idFromName('global');
  const hub = c.env.BOOKING_HUB.get(id);
  return hub.fetch(new Request('https://hub/websocket', {
    headers: { Upgrade: 'websocket' },
  }));
});

// All other API routes require authentication
app.use('/api/*', authMiddleware);

// Mount routes
app.route('/api/bookings', bookings);
app.route('/api/rooms', rooms);
app.route('/api/calendar', calendar);
app.route('/api/analytics', analytics);

// Staff routes — /api/me is available to all authenticated, /api/staff is admin-only
app.get('/api/me', async (c) => {
  const staffUser = c.get('staff');
  return c.json({ success: true, data: staffUser });
});
app.use('/api/staff/*', requireRole('admin'));
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
