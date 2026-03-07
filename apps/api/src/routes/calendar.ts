import { Hono } from 'hono';
import { CalendarQuerySchema } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type CalendarEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const calendar = new Hono<CalendarEnv>();

// GET /api/calendar - Room calendar view
calendar.get('/', async (c) => {
  const params = CalendarQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));

  const conditions: string[] = ['b.booking_date >= ?', 'b.booking_date <= ?'];
  const bindParams: unknown[] = [params.start_date, params.end_date];

  if (params.room_ids) {
    const roomIdList = params.room_ids.split(',').map((id) => id.trim());
    conditions.push(`b.room_id IN (${roomIdList.map(() => '?').join(',')})`);
    bindParams.push(...roomIdList);
  }

  // Exclude rejected and cancelled from calendar
  conditions.push("b.status NOT IN ('REJECTED', 'CANCELLED')");

  const where = `WHERE ${conditions.join(' AND ')}`;

  const bookings = await c.env.DB.prepare(
    `SELECT b.id, b.guest_name, b.booking_date, b.start_time, b.end_time, b.status, b.platform,
            b.room_id, r.name as room_name, r.color_hex as room_color
     FROM bookings b
     LEFT JOIN rooms r ON b.room_id = r.id
     ${where}
     ORDER BY b.booking_date, b.start_time`,
  )
    .bind(...bindParams)
    .all();

  // Group by room
  const rooms = await c.env.DB.prepare('SELECT * FROM rooms WHERE active = 1 ORDER BY name').all();

  const calendarData = rooms.results.map((room) => ({
    room,
    bookings: bookings.results.filter(
      (b) => (b as Record<string, unknown>).room_id === (room as Record<string, unknown>).id,
    ),
  }));

  // Unassigned bookings
  const unassigned = bookings.results.filter((b) => !(b as Record<string, unknown>).room_id);

  return c.json({
    success: true,
    data: {
      rooms: calendarData,
      unassigned,
    },
  });
});

export default calendar;
