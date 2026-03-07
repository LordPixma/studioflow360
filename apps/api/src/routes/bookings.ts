import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  UpdateBookingStatusSchema,
  AssignRoomSchema,
  AddNoteSchema,
  BookingListQuerySchema,
  isValidStatusTransition,
  generateId,
  nowISO,
} from '@studioflow360/shared';
import type { BookingRow } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type BookingEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const bookings = new Hono<BookingEnv>();

async function broadcastUpdate(env: Env, bookingId: string, type: string) {
  try {
    const hubId = env.BOOKING_HUB.idFromName('global');
    const hub = env.BOOKING_HUB.get(hubId);
    await hub.fetch(new Request('https://hub/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type, booking_id: bookingId, timestamp: new Date().toISOString() }),
    }));
  } catch {
    // Don't fail the request if broadcast fails
  }
}

// GET /api/bookings - List bookings with filters
bookings.get('/', async (c) => {
  const query = BookingListQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.status) {
    conditions.push('b.status = ?');
    params.push(query.status);
  }
  if (query.platform) {
    conditions.push('b.platform = ?');
    params.push(query.platform);
  }
  if (query.room_id) {
    conditions.push('b.room_id = ?');
    params.push(query.room_id);
  }
  if (query.date_from) {
    conditions.push('b.booking_date >= ?');
    params.push(query.date_from);
  }
  if (query.date_to) {
    conditions.push('b.booking_date <= ?');
    params.push(query.date_to);
  }
  if (query.assigned_to) {
    conditions.push('b.assigned_to = ?');
    params.push(query.assigned_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (query.page - 1) * query.per_page;

  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM bookings b ${where}`,
  )
    .bind(...params)
    .first<{ total: number }>();

  const total = countResult?.total ?? 0;

  const results = await c.env.DB.prepare(
    `SELECT b.*, r.name as room_name, r.color_hex as room_color
     FROM bookings b
     LEFT JOIN rooms r ON b.room_id = r.id
     ${where}
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...params, query.per_page, offset)
    .all();

  return c.json({
    success: true,
    data: results.results,
    pagination: {
      page: query.page,
      per_page: query.per_page,
      total,
      total_pages: Math.ceil(total / query.per_page),
    },
  });
});

// GET /api/bookings/:id - Full booking detail with events
bookings.get('/:id', async (c) => {
  const id = c.req.param('id');

  const booking = await c.env.DB.prepare(
    `SELECT b.*, r.name as room_name, r.color_hex as room_color, r.capacity as room_capacity
     FROM bookings b
     LEFT JOIN rooms r ON b.room_id = r.id
     WHERE b.id = ?`,
  )
    .bind(id)
    .first();

  if (!booking) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }

  const events = await c.env.DB.prepare(
    `SELECT be.*, su.display_name as actor_name
     FROM booking_events be
     LEFT JOIN staff_users su ON be.actor_id = su.id
     WHERE be.booking_id = ?
     ORDER BY be.created_at ASC`,
  )
    .bind(id)
    .all();

  const assignedStaff = (booking as Record<string, unknown>).assigned_to
    ? await c.env.DB.prepare('SELECT id, display_name, access_email FROM staff_users WHERE id = ?')
        .bind((booking as Record<string, unknown>).assigned_to)
        .first()
    : null;

  return c.json({
    success: true,
    data: {
      ...booking,
      events: events.results,
      assigned_staff: assignedStaff,
    },
  });
});

// PATCH /api/bookings/:id/status - Update booking status
bookings.patch('/:id/status', zValidator('json', UpdateBookingStatusSchema), async (c) => {
  const id = c.req.param('id');
  const { status: newStatus } = c.req.valid('json');
  const staff = c.get('staff');

  const booking = await c.env.DB.prepare('SELECT id, status FROM bookings WHERE id = ?')
    .bind(id)
    .first<{ id: string; status: string }>();

  if (!booking) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }

  if (!isValidStatusTransition(booking.status as BookingRow['status'], newStatus)) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_TRANSITION',
          message: `Cannot transition from ${booking.status} to ${newStatus}`,
        },
      },
      400,
    );
  }

  const now = nowISO();
  const updates: string[] = ['status = ?', 'updated_at = ?'];
  const updateParams: unknown[] = [newStatus, now];

  if (newStatus === 'APPROVED') {
    updates.push('approved_at = ?', 'approved_by = ?');
    updateParams.push(now, staff.id);
  }

  updateParams.push(id);

  await c.env.DB.prepare(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...updateParams)
    .run();

  // Insert audit event
  await c.env.DB.prepare(
    'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(generateId(), id, newStatus, staff.id, JSON.stringify({ from: booking.status, to: newStatus }), now)
    .run();

  await broadcastUpdate(c.env, id, 'BOOKING_UPDATED');
  return c.json({ success: true, data: { id, status: newStatus } });
});

// PATCH /api/bookings/:id/room - Assign room
bookings.patch('/:id/room', zValidator('json', AssignRoomSchema), async (c) => {
  const id = c.req.param('id');
  const { room_id } = c.req.valid('json');
  const staff = c.get('staff');

  const booking = await c.env.DB.prepare('SELECT id, booking_date, start_time, end_time, status FROM bookings WHERE id = ?')
    .bind(id)
    .first<{ id: string; booking_date: string; start_time: string; end_time: string; status: string }>();

  if (!booking) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }

  // Verify room exists
  const room = await c.env.DB.prepare('SELECT id, name FROM rooms WHERE id = ? AND active = 1')
    .bind(room_id)
    .first<{ id: string; name: string }>();

  if (!room) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } }, 404);
  }

  // Check for conflicts
  const conflicts = await c.env.DB.prepare(
    `SELECT id, guest_name, start_time, end_time, status FROM bookings
     WHERE room_id = ? AND booking_date = ?
     AND status NOT IN ('REJECTED', 'CANCELLED')
     AND start_time < ? AND end_time > ?
     AND id != ?`,
  )
    .bind(room_id, booking.booking_date, booking.end_time, booking.start_time, id)
    .all();

  if (conflicts.results.length > 0) {
    const hasHardConflict = conflicts.results.some((c) => {
      const s = (c as Record<string, unknown>).status as string;
      return ['APPROVED', 'PLATFORM_ACTIONED', 'CONFIRMED'].includes(s);
    });

    if (hasHardConflict) {
      return c.json(
        {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Room has conflicting bookings',
          },
          data: { conflicts: conflicts.results },
        },
        409,
      );
    }

    // Soft conflicts — warn but allow
    const now = nowISO();
    await c.env.DB.prepare('UPDATE bookings SET room_id = ?, updated_at = ? WHERE id = ?')
      .bind(room_id, now, id)
      .run();

    await c.env.DB.prepare(
      'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(generateId(), id, 'ASSIGNED', staff.id, JSON.stringify({ room_id, room_name: room.name, soft_conflicts: conflicts.results }), now)
      .run();

    await broadcastUpdate(c.env, id, 'BOOKING_UPDATED');
    return c.json({
      success: true,
      data: { id, room_id },
      warnings: conflicts.results,
    });
  }

  const now = nowISO();
  await c.env.DB.prepare('UPDATE bookings SET room_id = ?, updated_at = ? WHERE id = ?')
    .bind(room_id, now, id)
    .run();

  await c.env.DB.prepare(
    'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(generateId(), id, 'ASSIGNED', staff.id, JSON.stringify({ room_id, room_name: room.name }), now)
    .run();

  await broadcastUpdate(c.env, id, 'BOOKING_UPDATED');
  return c.json({ success: true, data: { id, room_id } });
});

// PATCH /api/bookings/:id/platform-action - Mark platform actioned
bookings.patch('/:id/platform-action', async (c) => {
  const id = c.req.param('id');
  const staff = c.get('staff');

  const booking = await c.env.DB.prepare('SELECT id, status FROM bookings WHERE id = ?')
    .bind(id)
    .first<{ id: string; status: string }>();

  if (!booking) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }

  if (booking.status !== 'APPROVED') {
    return c.json(
      { success: false, error: { code: 'INVALID_STATE', message: 'Booking must be APPROVED to mark as platform actioned' } },
      400,
    );
  }

  const now = nowISO();

  await c.env.DB.prepare(
    'UPDATE bookings SET status = ?, platform_actioned = 1, platform_actioned_at = ?, updated_at = ? WHERE id = ?',
  )
    .bind('PLATFORM_ACTIONED', now, now, id)
    .run();

  await c.env.DB.prepare(
    'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(generateId(), id, 'PLATFORM_ACTIONED', staff.id, JSON.stringify({ actioned_at: now }), now)
    .run();

  await broadcastUpdate(c.env, id, 'BOOKING_UPDATED');
  return c.json({ success: true, data: { id, status: 'PLATFORM_ACTIONED' } });
});

// POST /api/bookings/:id/notes - Add staff note
bookings.post('/:id/notes', zValidator('json', AddNoteSchema), async (c) => {
  const id = c.req.param('id');
  const { note } = c.req.valid('json');
  const staff = c.get('staff');

  const booking = await c.env.DB.prepare('SELECT id FROM bookings WHERE id = ?')
    .bind(id)
    .first();

  if (!booking) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }

  const now = nowISO();

  // Append to staff_notes
  await c.env.DB.prepare(
    `UPDATE bookings SET staff_notes = CASE
       WHEN staff_notes IS NULL OR staff_notes = '' THEN ?
       ELSE staff_notes || char(10) || ?
     END, updated_at = ? WHERE id = ?`,
  )
    .bind(`[${staff.displayName} ${now}] ${note}`, `[${staff.displayName} ${now}] ${note}`, now, id)
    .run();

  await c.env.DB.prepare(
    'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(generateId(), id, 'NOTE_ADDED', staff.id, JSON.stringify({ note }), now)
    .run();

  await broadcastUpdate(c.env, id, 'BOOKING_UPDATED');
  return c.json({ success: true, data: { id, note } });
});

// GET /api/bookings/:id/raw-email - Fetch raw email from R2
bookings.get('/:id/raw-email', async (c) => {
  const id = c.req.param('id');

  const booking = await c.env.DB.prepare('SELECT raw_email_r2_key FROM bookings WHERE id = ?')
    .bind(id)
    .first<{ raw_email_r2_key: string | null }>();

  if (!booking?.raw_email_r2_key) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'No raw email available' } }, 404);
  }

  const object = await c.env.EMAIL_ARCHIVE.get(booking.raw_email_r2_key);
  if (!object) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Email archive not found' } }, 404);
  }

  const body = await object.text();
  return c.text(body, 200, { 'Content-Type': 'text/html; charset=utf-8' });
});

export default bookings;
