import { Hono } from 'hono';
import { CreateCapacityTargetSchema } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type RPEnv = { Bindings: Env; Variables: { staff: StaffContext } };

const app = new Hono<RPEnv>();

// GET / — resource planning dashboard data
app.get('/', async (c) => {
  const { date_from, date_to } = c.req.query();
  const now = new Date();
  const from = date_from || now.toISOString().split('T')[0];
  const toDate = date_to || new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0];

  // Room utilization for period
  const roomUtil = await c.env.DB.prepare(`
    SELECT r.id, r.name, r.color_hex, r.hourly_rate, r.capacity,
      COUNT(b.id) as booking_count,
      ROUND(SUM(COALESCE(b.duration_hours,
        (julianday(b.booking_date || 'T' || b.end_time) - julianday(b.booking_date || 'T' || b.start_time)) * 24
      )), 1) as booked_hours,
      ROUND(SUM(COALESCE(b.total_price, 0)), 2) as revenue
    FROM rooms r
    LEFT JOIN bookings b ON b.room_id = r.id
      AND b.booking_date >= ? AND b.booking_date <= ?
      AND b.status NOT IN ('REJECTED', 'CANCELLED')
    WHERE r.active = 1
    GROUP BY r.id ORDER BY r.name
  `).bind(from, toDate).all();

  // Capacity targets
  const targets = await c.env.DB.prepare(`
    SELECT ct.*, r.name as room_name FROM room_capacity_targets ct
    JOIN rooms r ON ct.room_id = r.id
    WHERE ct.effective_from <= ? AND (ct.effective_to IS NULL OR ct.effective_to >= ?)
    ORDER BY r.name
  `).bind(toDate, from).all();

  // Upcoming bookings (next 7 days density)
  const next7 = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];
  const upcomingDensity = await c.env.DB.prepare(`
    SELECT booking_date, COUNT(*) as count, COUNT(DISTINCT room_id) as rooms_used
    FROM bookings
    WHERE booking_date >= ? AND booking_date <= ? AND status NOT IN ('REJECTED', 'CANCELLED')
    GROUP BY booking_date ORDER BY booking_date
  `).bind(from, next7).all();

  // Staff availability (shifts vs time-off)
  const staffAvail = await c.env.DB.prepare(`
    SELECT s.id, s.display_name,
      (SELECT COUNT(*) FROM staff_shifts WHERE staff_id = s.id AND shift_date >= ? AND shift_date <= ?) as scheduled_shifts,
      (SELECT COUNT(*) FROM time_off_requests WHERE staff_id = s.id AND status = 'approved'
        AND start_date <= ? AND end_date >= ?) as time_off_days
    FROM staff_users s WHERE s.active = 1 ORDER BY s.display_name
  `).bind(from, toDate, toDate, from).all();

  // Total rooms count for capacity calc
  const dayCount = Math.max(1, Math.ceil((new Date(toDate!).getTime() - new Date(from!).getTime()) / 86400000) + 1);
  const operatingHoursPerDay = 12;

  const enrichedRooms = (roomUtil.results as Record<string, unknown>[]).map(r => ({
    ...r,
    available_hours: dayCount * operatingHoursPerDay,
    utilization_pct: Math.round(((r.booked_hours as number || 0) / (dayCount * operatingHoursPerDay)) * 100),
  }));

  return c.json({
    success: true,
    data: {
      rooms: enrichedRooms,
      capacity_targets: targets.results,
      upcoming_density: upcomingDensity.results,
      staff_availability: staffAvail.results,
      date_range: { from, to: toDate },
      operating_hours_per_day: operatingHoursPerDay,
      total_days: dayCount,
    },
  });
});

// GET /forecast — simple demand forecast based on historical data
app.get('/forecast', async (c) => {
  const weeksAhead = Number(c.req.query('weeks') || 4);

  // Historical weekly averages (last 12 weeks)
  const historical = await c.env.DB.prepare(`
    SELECT strftime('%w', booking_date) as day_of_week,
      ROUND(AVG(daily_count), 1) as avg_bookings,
      ROUND(AVG(daily_revenue), 2) as avg_revenue
    FROM (
      SELECT booking_date, COUNT(*) as daily_count, SUM(COALESCE(total_price, 0)) as daily_revenue
      FROM bookings
      WHERE booking_date >= date('now', '-84 days') AND status NOT IN ('REJECTED', 'CANCELLED')
      GROUP BY booking_date
    ) GROUP BY day_of_week ORDER BY day_of_week
  `).all();

  // Generate forecast dates
  const forecast: Array<{ date: string; day_of_week: number; expected_bookings: number; expected_revenue: number }> = [];
  const avgByDay = new Map<number, { bookings: number; revenue: number }>();
  for (const row of historical.results as Array<Record<string, unknown>>) {
    avgByDay.set(Number(row.day_of_week), { bookings: Number(row.avg_bookings), revenue: Number(row.avg_revenue) });
  }

  const today = new Date();
  for (let d = 0; d < weeksAhead * 7; d++) {
    const date = new Date(today.getTime() + d * 86400000);
    const dow = date.getDay();
    const avg = avgByDay.get(dow) || { bookings: 0, revenue: 0 };
    forecast.push({
      date: date.toISOString().split('T')[0]!,
      day_of_week: dow,
      expected_bookings: avg.bookings,
      expected_revenue: avg.revenue,
    });
  }

  return c.json({ success: true, data: { forecast, historical: historical.results } });
});

// ==========================================
// CAPACITY TARGETS CRUD
// ==========================================

app.get('/targets', async (c) => {
  const results = await c.env.DB.prepare(`
    SELECT ct.*, r.name as room_name FROM room_capacity_targets ct
    JOIN rooms r ON ct.room_id = r.id ORDER BY r.name, ct.target_type
  `).all();
  return c.json({ success: true, data: results.results });
});

app.post('/targets', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreateCapacityTargetSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);

  const data = parsed.data;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO room_capacity_targets (id, room_id, target_type, target_value, effective_from, effective_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, data.room_id, data.target_type, data.target_value, data.effective_from, data.effective_to ?? null, staff.id).run();
  return c.json({ success: true, data: { id } }, 201);
});

app.delete('/targets/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM room_capacity_targets WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

export default app;
