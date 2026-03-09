import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateGuestSchema, UpdateGuestSchema, CreateGuestNoteSchema, LinkGuestBookingSchema, generateId, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type GuestsEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const guests = new Hono<GuestsEnv>();

// GET /api/guests - List guests with search/filter
guests.get('/', async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.search) {
    conditions.push(`(g.name LIKE ? OR g.email LIKE ? OR g.company LIKE ?)`);
    const term = `%${query.search}%`;
    params.push(term, term, term);
  }
  if (query.tag) {
    conditions.push(`g.tags LIKE ?`);
    params.push(`%"${query.tag}"%`);
  }
  if (query.source) {
    conditions.push('g.source = ?');
    params.push(query.source);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.per_page) || 25));
  const offset = (page - 1) * perPage;

  const sortField = query.sort === 'revenue' ? 'g.total_revenue' : query.sort === 'bookings' ? 'g.total_bookings' : 'g.updated_at';
  const sortDir = query.order === 'asc' ? 'ASC' : 'DESC';

  const [countResult, results] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM guests g ${where}`).bind(...params).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT g.*, sc.display_name as creator_name
       FROM guests g
       LEFT JOIN staff_users sc ON g.created_by = sc.id
       ${where}
       ORDER BY ${sortField} ${sortDir}
       LIMIT ? OFFSET ?`,
    ).bind(...params, perPage, offset).all(),
  ]);

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total: countResult?.total ?? 0, total_pages: Math.ceil((countResult?.total ?? 0) / perPage) },
  });
});

// GET /api/guests/summary - Quick stats
guests.get('/summary', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT
       COUNT(*) as total_guests,
       SUM(total_bookings) as total_bookings,
       SUM(total_revenue) as total_revenue,
       COUNT(CASE WHEN tags LIKE '%"VIP"%' THEN 1 END) as vip_count,
       COUNT(CASE WHEN tags LIKE '%"corporate"%' THEN 1 END) as corporate_count,
       COUNT(CASE WHEN last_booking_date >= date('now', '-30 days') THEN 1 END) as active_last_30d
     FROM guests`,
  ).first();
  return c.json({ success: true, data: result });
});

// POST /api/guests - Create guest manually
guests.post('/', zValidator('json', CreateGuestSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();

  await c.env.DB.prepare(
    `INSERT INTO guests (id, name, email, phone, company, address, tags, source, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, data.name, data.email ?? null, data.phone ?? null,
    data.company ?? null, data.address ?? null,
    JSON.stringify(data.tags ?? []),
    data.source ?? 'manual',
    data.notes ?? null, staff.id, now, now,
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// POST /api/guests/sync-from-bookings - Auto-create guests from booking data
guests.post('/sync-from-bookings', async (c) => {
  // Find bookings with guest emails not yet linked to any guest
  const unlinked = await c.env.DB.prepare(
    `SELECT b.guest_name, b.guest_email, COUNT(*) as booking_count,
            SUM(COALESCE(b.total_price, 0)) as total_revenue,
            MAX(b.booking_date) as last_date
     FROM bookings b
     LEFT JOIN guest_bookings gb ON gb.booking_id = b.id
     WHERE gb.guest_id IS NULL AND b.guest_email IS NOT NULL
     GROUP BY LOWER(b.guest_email)`,
  ).all();

  const staff = c.get('staff');
  const now = nowISO();
  let created = 0;

  for (const row of unlinked.results as Array<Record<string, unknown>>) {
    const guestId = generateId();
    await c.env.DB.prepare(
      `INSERT INTO guests (id, name, email, tags, source, total_bookings, total_revenue, last_booking_date, created_by, created_at, updated_at)
       VALUES (?, ?, ?, '[]', 'booking', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      guestId, row.guest_name as string, row.guest_email as string,
      row.booking_count as number, row.total_revenue as number,
      row.last_date as string, staff.id, now, now,
    ).run();

    // Link all bookings for this email
    const bookings = await c.env.DB.prepare(
      `SELECT id FROM bookings WHERE LOWER(guest_email) = LOWER(?)`,
    ).bind(row.guest_email as string).all();

    for (const b of bookings.results as Array<{ id: string }>) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO guest_bookings (guest_id, booking_id) VALUES (?, ?)`,
      ).bind(guestId, b.id).run();
    }
    created++;
  }

  return c.json({ success: true, data: { created } });
});

// GET /api/guests/:id - Guest detail with booking history
guests.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [guest, notes, bookings] = await Promise.all([
    c.env.DB.prepare(
      `SELECT g.*, sc.display_name as creator_name
       FROM guests g LEFT JOIN staff_users sc ON g.created_by = sc.id
       WHERE g.id = ?`,
    ).bind(id).first(),
    c.env.DB.prepare(
      `SELECT gn.*, su.display_name as author_name
       FROM guest_notes gn
       LEFT JOIN staff_users su ON gn.created_by = su.id
       WHERE gn.guest_id = ?
       ORDER BY gn.created_at DESC LIMIT 50`,
    ).bind(id).all(),
    c.env.DB.prepare(
      `SELECT b.id, b.booking_date, b.start_time, b.end_time, b.status, b.total_price, b.platform,
              r.name as room_name
       FROM bookings b
       INNER JOIN guest_bookings gb ON gb.booking_id = b.id
       LEFT JOIN rooms r ON b.room_id = r.id
       WHERE gb.guest_id = ?
       ORDER BY b.booking_date DESC LIMIT 50`,
    ).bind(id).all(),
  ]);

  if (!guest) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Guest not found' } }, 404);

  return c.json({
    success: true,
    data: { ...guest, notes: notes.results, bookings: bookings.results },
  });
});

// PATCH /api/guests/:id - Update guest
guests.patch('/:id', zValidator('json', UpdateGuestSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const key of ['name', 'email', 'phone', 'company', 'address', 'notes'] as const) {
    if (data[key] !== undefined) { updates.push(`${key} = ?`); params.push(data[key]!); }
  }
  if (data.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(data.tags)); }
  if (data.source !== undefined) { updates.push('source = ?'); params.push(data.source); }

  if (updates.length === 0) return c.json({ success: true, data: { id } });

  updates.push('updated_at = ?'); params.push(nowISO()); params.push(id);
  await c.env.DB.prepare(`UPDATE guests SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

// DELETE /api/guests/:id
guests.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM guests WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// POST /api/guests/:id/notes - Add interaction note
guests.post('/:id/notes', zValidator('json', CreateGuestNoteSchema), async (c) => {
  const guestId = c.req.param('id');
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();

  await c.env.DB.prepare(
    `INSERT INTO guest_notes (id, guest_id, note_type, content, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, guestId, data.note_type, data.content, staff.id, nowISO()).run();

  return c.json({ success: true, data: { id } }, 201);
});

// POST /api/guests/:id/link-booking - Link a booking to a guest
guests.post('/:id/link-booking', zValidator('json', LinkGuestBookingSchema), async (c) => {
  const guestId = c.req.param('id');
  const { booking_id } = c.req.valid('json');

  // Verify booking exists
  const booking = await c.env.DB.prepare('SELECT id, total_price, booking_date FROM bookings WHERE id = ?').bind(booking_id).first<{ id: string; total_price: number | null; booking_date: string }>();
  if (!booking) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO guest_bookings (guest_id, booking_id) VALUES (?, ?)`,
  ).bind(guestId, booking_id).run();

  // Update guest stats
  const stats = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt, SUM(COALESCE(b.total_price, 0)) as rev, MAX(b.booking_date) as last_date
     FROM bookings b INNER JOIN guest_bookings gb ON gb.booking_id = b.id
     WHERE gb.guest_id = ?`,
  ).bind(guestId).first<{ cnt: number; rev: number; last_date: string }>();

  if (stats) {
    await c.env.DB.prepare(
      `UPDATE guests SET total_bookings = ?, total_revenue = ?, last_booking_date = ?, updated_at = ? WHERE id = ?`,
    ).bind(stats.cnt, stats.rev, stats.last_date, nowISO(), guestId).run();
  }

  return c.json({ success: true });
});

export default guests;
