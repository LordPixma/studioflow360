import { Hono } from 'hono';
import { CreateSavedReportSchema } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type ReportEnv = { Bindings: Env; Variables: { staff: StaffContext } };

const app = new Hono<ReportEnv>();

// Helper: default date range (last 30 days)
function defaultDateRange() {
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  return { from, to };
}

// Helper: generate CSV from rows
function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => {
      const v = row[h];
      const s = v === null || v === undefined ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
  }
  return lines.join('\n');
}

// ==========================================
// REPORT DATA ENDPOINTS
// ==========================================

// GET /revenue — revenue report
app.get('/revenue', async (c) => {
  const { date_from, date_to, room_id, platform, group_by = 'day', format } = c.req.query();
  const dr = defaultDateRange();
  const from = date_from || dr.from;
  const to = date_to || dr.to;

  const conditions = [`booking_date >= ?`, `booking_date <= ?`, `status NOT IN ('REJECTED', 'CANCELLED')`];
  const params: unknown[] = [from, to];
  if (room_id) { conditions.push('room_id = ?'); params.push(room_id); }
  if (platform) { conditions.push('platform = ?'); params.push(platform); }

  const groupExpr = group_by === 'month' ? `substr(booking_date, 1, 7)` : group_by === 'week' ? `strftime('%Y-W%W', booking_date)` : 'booking_date';

  const rows = await c.env.DB.prepare(`
    SELECT ${groupExpr} as period,
      COUNT(*) as booking_count,
      ROUND(SUM(COALESCE(total_price, 0)), 2) as total_revenue,
      ROUND(AVG(COALESCE(total_price, 0)), 2) as avg_revenue,
      COUNT(DISTINCT guest_email) as unique_guests
    FROM bookings
    WHERE ${conditions.join(' AND ')}
    GROUP BY period ORDER BY period
  `).bind(...params).all();

  // Totals
  const totals = await c.env.DB.prepare(`
    SELECT COUNT(*) as total_bookings,
      ROUND(SUM(COALESCE(total_price, 0)), 2) as total_revenue,
      ROUND(AVG(COALESCE(total_price, 0)), 2) as avg_booking_value,
      COUNT(DISTINCT guest_email) as unique_guests
    FROM bookings
    WHERE ${conditions.join(' AND ')}
  `).bind(...params).first();

  const data = { periods: rows.results, totals, date_range: { from, to } };

  if (format === 'csv') {
    return new Response(toCSV(rows.results as Record<string, unknown>[]), {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="revenue-report.csv"' },
    });
  }
  return c.json({ success: true, data });
});

// GET /occupancy — room occupancy/utilization
app.get('/occupancy', async (c) => {
  const { date_from, date_to, room_id, format } = c.req.query();
  const dr = defaultDateRange();
  const from = date_from || dr.from;
  const to = date_to || dr.to;

  const conditions = [`b.booking_date >= ?`, `b.booking_date <= ?`, `b.status NOT IN ('REJECTED', 'CANCELLED')`];
  const params: unknown[] = [from, to];
  if (room_id) { conditions.push('b.room_id = ?'); params.push(room_id); }

  const rows = await c.env.DB.prepare(`
    SELECT r.id as room_id, r.name as room_name, r.hourly_rate,
      COUNT(b.id) as booking_count,
      ROUND(SUM(COALESCE(b.duration_hours,
        (julianday(b.booking_date || 'T' || b.end_time) - julianday(b.booking_date || 'T' || b.start_time)) * 24
      )), 1) as total_hours,
      ROUND(SUM(COALESCE(b.total_price, 0)), 2) as total_revenue
    FROM rooms r
    LEFT JOIN bookings b ON b.room_id = r.id AND ${conditions.join(' AND ')}
    WHERE r.active = 1
    GROUP BY r.id ORDER BY total_hours DESC
  `).bind(...params).all();

  // Calculate total available hours (assume 12hr operating day)
  const dayCount = Math.max(1, Math.ceil((new Date(to!).getTime() - new Date(from!).getTime()) / 86400000) + 1);
  const operatingHoursPerDay = 12;
  const totalAvailablePerRoom = dayCount * operatingHoursPerDay;

  const enriched = (rows.results as Record<string, unknown>[]).map(r => ({
    ...r,
    available_hours: totalAvailablePerRoom,
    utilization_pct: Math.round(((r.total_hours as number) / totalAvailablePerRoom) * 100),
  }));

  if (format === 'csv') {
    return new Response(toCSV(enriched), {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="occupancy-report.csv"' },
    });
  }
  return c.json({ success: true, data: { rooms: enriched, date_range: { from, to }, operating_hours_per_day: operatingHoursPerDay } });
});

// GET /bookings — bookings breakdown
app.get('/bookings', async (c) => {
  const { date_from, date_to, format } = c.req.query();
  const dr = defaultDateRange();
  const from = date_from || dr.from;
  const to = date_to || dr.to;

  // By status
  const byStatus = await c.env.DB.prepare(`
    SELECT status, COUNT(*) as count FROM bookings
    WHERE booking_date >= ? AND booking_date <= ?
    GROUP BY status ORDER BY count DESC
  `).bind(from, to).all();

  // By platform
  const byPlatform = await c.env.DB.prepare(`
    SELECT platform, COUNT(*) as count, ROUND(SUM(COALESCE(total_price, 0)), 2) as revenue FROM bookings
    WHERE booking_date >= ? AND booking_date <= ? AND status NOT IN ('REJECTED', 'CANCELLED')
    GROUP BY platform ORDER BY count DESC
  `).bind(from, to).all();

  // By room
  const byRoom = await c.env.DB.prepare(`
    SELECT r.name as room_name, COUNT(b.id) as count, ROUND(SUM(COALESCE(b.total_price, 0)), 2) as revenue
    FROM bookings b LEFT JOIN rooms r ON b.room_id = r.id
    WHERE b.booking_date >= ? AND b.booking_date <= ? AND b.status NOT IN ('REJECTED', 'CANCELLED')
    GROUP BY b.room_id ORDER BY count DESC
  `).bind(from, to).all();

  // Approval metrics
  const approvalMetrics = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('APPROVED', 'PLATFORM_ACTIONED', 'CONFIRMED') THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
      ROUND(AVG(CASE WHEN approved_at IS NOT NULL THEN (julianday(approved_at) - julianday(created_at)) * 24 END), 1) as avg_hours_to_approve
    FROM bookings WHERE booking_date >= ? AND booking_date <= ?
  `).bind(from, to).first();

  const data = { by_status: byStatus.results, by_platform: byPlatform.results, by_room: byRoom.results, approval_metrics: approvalMetrics, date_range: { from, to } };

  if (format === 'csv') {
    return new Response(toCSV(byPlatform.results as Record<string, unknown>[]), {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="bookings-report.csv"' },
    });
  }
  return c.json({ success: true, data });
});

// GET /staff-utilization — staff workload
app.get('/staff-utilization', async (c) => {
  const { date_from, date_to, format } = c.req.query();
  const dr = defaultDateRange();
  const from = date_from || dr.from;
  const to = date_to || dr.to;

  const rows = await c.env.DB.prepare(`
    SELECT s.id, s.display_name, s.role,
      (SELECT COUNT(*) FROM bookings WHERE assigned_to = s.id AND booking_date >= ? AND booking_date <= ? AND status NOT IN ('REJECTED', 'CANCELLED')) as bookings_handled,
      (SELECT COUNT(*) FROM tasks WHERE assigned_to = s.id AND created_at >= ? AND created_at <= ?) as tasks_assigned,
      (SELECT COUNT(*) FROM tasks WHERE assigned_to = s.id AND status = 'completed' AND completed_at >= ? AND completed_at <= ?) as tasks_completed,
      (SELECT ROUND(SUM(
        (julianday(shift_date || 'T' || end_time) - julianday(shift_date || 'T' || start_time)) * 24
      ), 1) FROM staff_shifts WHERE staff_id = s.id AND shift_date >= ? AND shift_date <= ?) as shift_hours
    FROM staff_users s WHERE s.active = 1
    ORDER BY bookings_handled DESC
  `).bind(from, to, from, to + 'T23:59:59', from, to + 'T23:59:59', from, to).all();

  if (format === 'csv') {
    return new Response(toCSV(rows.results as Record<string, unknown>[]), {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="staff-utilization.csv"' },
    });
  }
  return c.json({ success: true, data: { staff: rows.results, date_range: { from, to } } });
});

// GET /financial-summary — P&L style overview
app.get('/financial-summary', async (c) => {
  const { date_from, date_to, format } = c.req.query();
  const dr = defaultDateRange();
  const from = date_from || dr.from;
  const to = date_to || dr.to;

  // Revenue from bookings
  const revenue = await c.env.DB.prepare(`
    SELECT ROUND(SUM(COALESCE(total_price, 0)), 2) as booking_revenue, COUNT(*) as booking_count
    FROM bookings WHERE booking_date >= ? AND booking_date <= ? AND status NOT IN ('REJECTED', 'CANCELLED')
  `).bind(from, to).first();

  // Invoice totals
  const invoices = await c.env.DB.prepare(`
    SELECT ROUND(SUM(total), 2) as invoiced_total,
      ROUND(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 2) as collected,
      ROUND(SUM(CASE WHEN status IN ('sent', 'overdue') THEN total ELSE 0 END), 2) as outstanding
    FROM invoices WHERE issued_date >= ? AND issued_date <= ?
  `).bind(from, to).first();

  // Expenses (purchases)
  const expenses = await c.env.DB.prepare(`
    SELECT ROUND(SUM(amount), 2) as total_expenses, COUNT(*) as expense_count,
      category, ROUND(SUM(amount), 2) as cat_total
    FROM purchases WHERE purchase_date >= ? AND purchase_date <= ? AND status IN ('approved', 'paid')
    GROUP BY category ORDER BY cat_total DESC
  `).bind(from, to).all();

  const totalExpenses = (expenses.results as Array<{ cat_total: number }>).reduce((s, r) => s + (r.cat_total || 0), 0);
  const bookingRev = (revenue as Record<string, unknown>)?.booking_revenue as number ?? 0;

  const data = {
    revenue: revenue,
    invoices: invoices,
    expenses: { total: totalExpenses, by_category: expenses.results },
    net_income: Math.round((bookingRev - totalExpenses) * 100) / 100,
    date_range: { from, to },
  };

  if (format === 'csv') {
    const summary = [
      { metric: 'Booking Revenue', value: bookingRev },
      { metric: 'Total Expenses', value: totalExpenses },
      { metric: 'Net Income', value: data.net_income },
      { metric: 'Invoiced', value: (invoices as Record<string, unknown>)?.invoiced_total ?? 0 },
      { metric: 'Collected', value: (invoices as Record<string, unknown>)?.collected ?? 0 },
      { metric: 'Outstanding', value: (invoices as Record<string, unknown>)?.outstanding ?? 0 },
    ];
    return new Response(toCSV(summary), {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="financial-summary.csv"' },
    });
  }
  return c.json({ success: true, data });
});

// GET /guest-activity — top guests
app.get('/guest-activity', async (c) => {
  const { date_from, date_to, format } = c.req.query();
  const dr = defaultDateRange();
  const from = date_from || dr.from;
  const to = date_to || dr.to;

  const rows = await c.env.DB.prepare(`
    SELECT g.id, g.name, g.email, g.company, g.total_bookings, g.total_revenue, g.tags,
      (SELECT COUNT(*) FROM guest_bookings gb JOIN bookings b ON gb.booking_id = b.id
       WHERE gb.guest_id = g.id AND b.booking_date >= ? AND b.booking_date <= ?) as period_bookings
    FROM guests g
    ORDER BY period_bookings DESC, g.total_revenue DESC
    LIMIT 50
  `).bind(from, to).all();

  if (format === 'csv') {
    return new Response(toCSV(rows.results as Record<string, unknown>[]), {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="guest-activity.csv"' },
    });
  }
  return c.json({ success: true, data: { guests: rows.results, date_range: { from, to } } });
});

// ==========================================
// SAVED REPORTS CRUD
// ==========================================

app.get('/saved', async (c) => {
  const staff = c.get('staff');
  const results = await c.env.DB.prepare(
    'SELECT * FROM saved_reports WHERE created_by = ? ORDER BY is_pinned DESC, updated_at DESC',
  ).bind(staff.id).all();
  return c.json({ success: true, data: results.results });
});

app.post('/saved', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreateSavedReportSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);

  const data = parsed.data;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO saved_reports (id, name, description, report_type, filters, schedule, is_pinned, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, data.name, data.description ?? null, data.report_type, JSON.stringify(data.filters ?? {}), data.schedule ?? null, data.is_pinned ?? 0, staff.id).run();
  return c.json({ success: true, data: { id } }, 201);
});

app.delete('/saved/:id', async (c) => {
  const staff = c.get('staff');
  await c.env.DB.prepare('DELETE FROM saved_reports WHERE id = ? AND created_by = ?').bind(c.req.param('id'), staff.id).run();
  return c.json({ success: true });
});

export default app;
