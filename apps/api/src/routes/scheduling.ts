import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateShiftSchema, UpdateShiftSchema, CreateTimeOffSchema, ReviewTimeOffSchema, generateId, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type SchedulingEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const scheduling = new Hono<SchedulingEnv>();

// ==================== SHIFTS ====================

// GET /api/scheduling/shifts - List shifts for a date range
scheduling.get('/shifts', async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.start_date) { conditions.push('s.shift_date >= ?'); params.push(query.start_date); }
  if (query.end_date) { conditions.push('s.shift_date <= ?'); params.push(query.end_date); }
  if (query.staff_id) { conditions.push('s.staff_id = ?'); params.push(query.staff_id); }
  if (query.room_id) { conditions.push('s.room_id = ?'); params.push(query.room_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const results = await c.env.DB.prepare(
    `SELECT s.*, su.display_name as staff_name, su.avatar_r2_key,
            r.name as room_name, r.color_hex as room_color
     FROM staff_shifts s
     LEFT JOIN staff_users su ON s.staff_id = su.id
     LEFT JOIN rooms r ON s.room_id = r.id
     ${where}
     ORDER BY s.shift_date, s.start_time`,
  ).bind(...params).all();

  return c.json({ success: true, data: results.results });
});

// GET /api/scheduling/shifts/summary - Weekly summary
scheduling.get('/shifts/summary', async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const startDate = query.start_date ?? new Date().toISOString().split('T')[0]!;
  const endDate = query.end_date ?? (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0]!; })();

  const [shiftCounts, staffHours, timeOffCount] = await Promise.all([
    c.env.DB.prepare(
      `SELECT shift_date, COUNT(*) as count
       FROM staff_shifts WHERE shift_date >= ? AND shift_date <= ?
       GROUP BY shift_date ORDER BY shift_date`,
    ).bind(startDate, endDate).all(),
    c.env.DB.prepare(
      `SELECT su.display_name, su.id as staff_id, COUNT(s.id) as shift_count,
              SUM((CAST(SUBSTR(s.end_time, 1, 2) AS INTEGER) * 60 + CAST(SUBSTR(s.end_time, 4, 2) AS INTEGER))
                - (CAST(SUBSTR(s.start_time, 1, 2) AS INTEGER) * 60 + CAST(SUBSTR(s.start_time, 4, 2) AS INTEGER))) / 60.0 as total_hours
       FROM staff_shifts s
       LEFT JOIN staff_users su ON s.staff_id = su.id
       WHERE s.shift_date >= ? AND s.shift_date <= ?
       GROUP BY s.staff_id`,
    ).bind(startDate, endDate).all(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM time_off_requests
       WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`,
    ).bind(endDate, startDate).first<{ count: number }>(),
  ]);

  return c.json({
    success: true,
    data: { shifts_by_date: shiftCounts.results, staff_hours: staffHours.results, active_time_off: timeOffCount?.count ?? 0 },
  });
});

// POST /api/scheduling/shifts
scheduling.post('/shifts', zValidator('json', CreateShiftSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();

  // Check for conflicts
  const conflict = await c.env.DB.prepare(
    `SELECT id FROM staff_shifts
     WHERE staff_id = ? AND shift_date = ?
     AND start_time < ? AND end_time > ?`,
  ).bind(data.staff_id, data.shift_date, data.end_time, data.start_time).first();

  if (conflict) {
    return c.json({ success: false, error: { code: 'CONFLICT', message: 'Staff member already has a shift at this time' } }, 409);
  }

  // Check if staff is on approved time off
  const timeOff = await c.env.DB.prepare(
    `SELECT id FROM time_off_requests
     WHERE staff_id = ? AND status = 'approved'
     AND start_date <= ? AND end_date >= ?`,
  ).bind(data.staff_id, data.shift_date, data.shift_date).first();

  if (timeOff) {
    return c.json({ success: false, error: { code: 'CONFLICT', message: 'Staff member is on approved time off for this date' } }, 409);
  }

  await c.env.DB.prepare(
    `INSERT INTO staff_shifts (id, staff_id, room_id, shift_date, start_time, end_time, shift_type, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, data.staff_id, data.room_id ?? null,
    data.shift_date, data.start_time, data.end_time,
    data.shift_type, data.notes ?? null,
    staff.id, now, now,
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// PATCH /api/scheduling/shifts/:id
scheduling.patch('/shifts/:id', zValidator('json', UpdateShiftSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const key of ['staff_id', 'room_id', 'shift_date', 'start_time', 'end_time', 'shift_type', 'notes'] as const) {
    if (data[key] !== undefined) { updates.push(`${key} = ?`); params.push(data[key]!); }
  }

  if (updates.length === 0) return c.json({ success: true, data: { id } });
  updates.push('updated_at = ?'); params.push(nowISO()); params.push(id);
  await c.env.DB.prepare(`UPDATE staff_shifts SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

// DELETE /api/scheduling/shifts/:id
scheduling.delete('/shifts/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM staff_shifts WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// ==================== TIME OFF ====================

// GET /api/scheduling/time-off
scheduling.get('/time-off', async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.staff_id) { conditions.push('t.staff_id = ?'); params.push(query.staff_id); }
  if (query.status) { conditions.push('t.status = ?'); params.push(query.status); }

  // Non-managers only see their own requests
  const staff = c.get('staff');
  if (staff.role === 'staff') { conditions.push('t.staff_id = ?'); params.push(staff.id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const results = await c.env.DB.prepare(
    `SELECT t.*, su.display_name as staff_name, rv.display_name as reviewer_name
     FROM time_off_requests t
     LEFT JOIN staff_users su ON t.staff_id = su.id
     LEFT JOIN staff_users rv ON t.reviewed_by = rv.id
     ${where}
     ORDER BY t.created_at DESC`,
  ).all();

  return c.json({ success: true, data: results.results });
});

// POST /api/scheduling/time-off - Request time off (for self)
scheduling.post('/time-off', zValidator('json', CreateTimeOffSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();

  await c.env.DB.prepare(
    `INSERT INTO time_off_requests (id, staff_id, request_type, start_date, end_date, status, reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
  ).bind(id, staff.id, data.request_type, data.start_date, data.end_date, data.reason ?? null, now, now).run();

  return c.json({ success: true, data: { id } }, 201);
});

// PATCH /api/scheduling/time-off/:id/review - Approve/decline (managers+)
scheduling.patch('/time-off/:id/review', zValidator('json', ReviewTimeOffSchema), async (c) => {
  const id = c.req.param('id');
  const { status } = c.req.valid('json');
  const staff = c.get('staff');

  if (staff.role === 'staff') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only managers can review time-off requests' } }, 403);
  }

  const now = nowISO();
  await c.env.DB.prepare(
    `UPDATE time_off_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`,
  ).bind(status, staff.id, now, now, id).run();

  return c.json({ success: true, data: { id } });
});

// DELETE /api/scheduling/time-off/:id - Cancel own pending request
scheduling.delete('/time-off/:id', async (c) => {
  const id = c.req.param('id');
  const staff = c.get('staff');

  const request = await c.env.DB.prepare('SELECT staff_id, status FROM time_off_requests WHERE id = ?').bind(id).first<{ staff_id: string; status: string }>();
  if (!request) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Request not found' } }, 404);

  // Staff can only cancel their own pending requests; managers/admins can cancel any
  if (staff.role === 'staff') {
    if (request.staff_id !== staff.id) return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot cancel others\' requests' } }, 403);
    if (request.status !== 'pending') return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Can only cancel pending requests' } }, 400);
  }

  await c.env.DB.prepare('DELETE FROM time_off_requests WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default scheduling;
