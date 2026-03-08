import { Hono } from 'hono';
import type { Env, StaffContext } from '../types.js';

type AnalyticsEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const analytics = new Hono<AnalyticsEnv>();

// GET /api/analytics/summary
analytics.get('/summary', async (c) => {
  const dateFrom = c.req.query('date_from');
  const dateTo = c.req.query('date_to');

  const dateFilter = dateFrom && dateTo ? 'WHERE created_at >= ? AND created_at <= ?' : '';
  const dateParams = dateFrom && dateTo ? [dateFrom, dateTo] : [];

  const [statusCounts, platformCounts, totalCount, avgConfidence] = await Promise.all([
    c.env.DB.prepare(`SELECT status, COUNT(*) as count FROM bookings ${dateFilter} GROUP BY status`)
      .bind(...dateParams)
      .all(),
    c.env.DB.prepare(`SELECT platform, COUNT(*) as count FROM bookings ${dateFilter} GROUP BY platform`)
      .bind(...dateParams)
      .all(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM bookings ${dateFilter}`)
      .bind(...dateParams)
      .first<{ total: number }>(),
    c.env.DB.prepare(`SELECT AVG(ai_confidence) as avg_confidence FROM bookings WHERE ai_confidence IS NOT NULL ${dateFrom && dateTo ? 'AND created_at >= ? AND created_at <= ?' : ''}`)
      .bind(...dateParams)
      .first<{ avg_confidence: number | null }>(),
  ]);

  // Approval rate
  const approved = (statusCounts.results.find(
    (r) => (r as Record<string, unknown>).status === 'APPROVED' || (r as Record<string, unknown>).status === 'PLATFORM_ACTIONED' || (r as Record<string, unknown>).status === 'CONFIRMED',
  ) as Record<string, unknown> | undefined);
  const rejected = (statusCounts.results.find(
    (r) => (r as Record<string, unknown>).status === 'REJECTED',
  ) as Record<string, unknown> | undefined);

  const approvedCount = Number(approved?.count ?? 0);
  const rejectedCount = Number(rejected?.count ?? 0);
  const approvalRate = approvedCount + rejectedCount > 0
    ? approvedCount / (approvedCount + rejectedCount)
    : null;

  return c.json({
    success: true,
    data: {
      total: totalCount?.total ?? 0,
      by_status: statusCounts.results,
      by_platform: platformCounts.results,
      approval_rate: approvalRate,
      avg_ai_confidence: avgConfidence?.avg_confidence,
    },
  });
});

// GET /api/analytics/timeline
analytics.get('/timeline', async (c) => {
  const dateFrom = c.req.query('date_from') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const dateTo = c.req.query('date_to') ?? new Date().toISOString().split('T')[0];

  const results = await c.env.DB.prepare(
    `SELECT DATE(created_at) as date, COUNT(*) as count, platform
     FROM bookings
     WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
     GROUP BY DATE(created_at), platform
     ORDER BY date`,
  )
    .bind(dateFrom, dateTo)
    .all();

  return c.json({ success: true, data: results.results });
});

// GET /api/analytics/revenue - Revenue over time
analytics.get('/revenue', async (c) => {
  const granularity = c.req.query('granularity') ?? 'daily';
  const dateFrom = c.req.query('date_from') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!;
  const dateTo = c.req.query('date_to') ?? new Date().toISOString().split('T')[0]!;

  let groupExpr: string;
  if (granularity === 'monthly') groupExpr = "strftime('%Y-%m', booking_date)";
  else if (granularity === 'weekly') groupExpr = "strftime('%Y-W%W', booking_date)";
  else groupExpr = 'DATE(booking_date)';

  const results = await c.env.DB.prepare(
    `SELECT ${groupExpr} as period,
            COALESCE(SUM(total_price), 0) as revenue,
            COUNT(*) as booking_count
     FROM bookings
     WHERE booking_date >= ? AND booking_date <= ?
     AND status NOT IN ('REJECTED','CANCELLED')
     GROUP BY period ORDER BY period`,
  ).bind(dateFrom, dateTo).all();

  return c.json({ success: true, data: results.results });
});

// GET /api/analytics/utilization - Room utilization rates
analytics.get('/utilization', async (c) => {
  const dateFrom = c.req.query('date_from') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!;
  const dateTo = c.req.query('date_to') ?? new Date().toISOString().split('T')[0]!;

  const results = await c.env.DB.prepare(
    `SELECT r.id, r.name, r.color_hex,
            COUNT(b.id) as total_bookings,
            COALESCE(SUM(b.duration_hours), 0) as total_hours
     FROM rooms r
     LEFT JOIN bookings b ON r.id = b.room_id
       AND b.booking_date >= ? AND b.booking_date <= ?
       AND b.status NOT IN ('REJECTED','CANCELLED')
     WHERE r.active = 1
     GROUP BY r.id ORDER BY r.name`,
  ).bind(dateFrom, dateTo).all();

  return c.json({ success: true, data: results.results });
});

// GET /api/analytics/peak-hours - Booking distribution by hour
analytics.get('/peak-hours', async (c) => {
  const dateFrom = c.req.query('date_from') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!;
  const dateTo = c.req.query('date_to') ?? new Date().toISOString().split('T')[0]!;

  const results = await c.env.DB.prepare(
    `SELECT CAST(SUBSTR(start_time, 1, 2) AS INTEGER) as hour,
            COUNT(*) as count
     FROM bookings
     WHERE booking_date >= ? AND booking_date <= ?
     AND status NOT IN ('REJECTED','CANCELLED')
     GROUP BY hour ORDER BY hour`,
  ).bind(dateFrom, dateTo).all();

  return c.json({ success: true, data: results.results });
});

// GET /api/analytics/average-value - Average booking value by platform
analytics.get('/average-value', async (c) => {
  const dateFrom = c.req.query('date_from') ?? new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]!;
  const dateTo = c.req.query('date_to') ?? new Date().toISOString().split('T')[0]!;

  const results = await c.env.DB.prepare(
    `SELECT platform, AVG(total_price) as avg_value, COUNT(*) as count,
            COALESCE(SUM(total_price), 0) as total_revenue
     FROM bookings
     WHERE total_price IS NOT NULL AND status NOT IN ('REJECTED','CANCELLED')
     AND booking_date >= ? AND booking_date <= ?
     GROUP BY platform`,
  ).bind(dateFrom, dateTo).all();

  return c.json({ success: true, data: results.results });
});

export default analytics;
