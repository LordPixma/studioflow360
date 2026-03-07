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

export default analytics;
