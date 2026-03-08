import { Hono } from 'hono';
import type { Env, StaffContext } from '../types.js';

type DashboardEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const dashboard = new Hono<DashboardEnv>();

dashboard.get('/', async (c) => {
  const today = new Date().toISOString().split('T')[0]!;
  const weekLater = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]!;

  const [todayStats, pendingAction, staleApprovals, upcoming, recentActivity, roomOccupancy, studioOverdue] = await Promise.all([
    // Today's bookings + revenue
    c.env.DB.prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_price), 0) as revenue
       FROM bookings WHERE booking_date = ? AND status NOT IN ('REJECTED','CANCELLED')`,
    ).bind(today).first<{ count: number; revenue: number }>(),

    // Pending action items
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM bookings WHERE status IN ('PENDING','NEEDS_REVIEW')`,
    ).first<{ count: number }>(),

    // Approved but not actioned
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM bookings WHERE status = 'APPROVED'`,
    ).first<{ count: number }>(),

    // Upcoming bookings (next 7 days)
    c.env.DB.prepare(
      `SELECT b.id, b.guest_name, b.booking_date, b.start_time, b.end_time, b.status, b.platform, b.total_price, b.currency,
              r.name as room_name, r.color_hex as room_color, su.display_name as coordinator_name
       FROM bookings b
       LEFT JOIN rooms r ON b.room_id = r.id
       LEFT JOIN staff_users su ON b.assigned_to = su.id
       WHERE b.booking_date >= ? AND b.booking_date <= ?
       AND b.status NOT IN ('REJECTED','CANCELLED')
       ORDER BY b.booking_date, b.start_time LIMIT 10`,
    ).bind(today, weekLater).all(),

    // Recent activity
    c.env.DB.prepare(
      `SELECT be.id, be.event_type, be.created_at, be.booking_id,
              b.guest_name, su.display_name as actor_name
       FROM booking_events be
       JOIN bookings b ON be.booking_id = b.id
       LEFT JOIN staff_users su ON be.actor_id = su.id
       ORDER BY be.created_at DESC LIMIT 10`,
    ).all(),

    // Room occupancy today
    c.env.DB.prepare(
      `SELECT r.id, r.name, r.color_hex, COUNT(b.id) as booking_count,
              COALESCE(SUM(b.duration_hours), 0) as booked_hours
       FROM rooms r
       LEFT JOIN bookings b ON r.id = b.room_id
         AND b.booking_date = ? AND b.status NOT IN ('REJECTED','CANCELLED')
       WHERE r.active = 1
       GROUP BY r.id ORDER BY r.name`,
    ).bind(today).all(),

    // Overdue studio items count
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM studio_items
       WHERE due_date < ? AND status NOT IN ('completed','cancelled')`,
    ).bind(today).first<{ count: number }>(),
  ]);

  return c.json({
    success: true,
    data: {
      today: { booking_count: todayStats?.count ?? 0, revenue: todayStats?.revenue ?? 0 },
      pending_action: pendingAction?.count ?? 0,
      stale_approvals: staleApprovals?.count ?? 0,
      upcoming: upcoming.results,
      recent_activity: recentActivity.results,
      room_occupancy: roomOccupancy.results,
      studio_overdue: studioOverdue?.count ?? 0,
    },
  });
});

export default dashboard;
