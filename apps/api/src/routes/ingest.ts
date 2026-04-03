import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { DirectBookingSchema, generateId, nowISO, calculateDurationHours } from '@studioflow360/shared';
import type { Env } from '../types.js';

type IngestEnv = {
  Bindings: Env;
};

const ingest = new Hono<IngestEnv>();

// POST /api/bookings/ingest - Direct website booking (public, Turnstile-protected)
ingest.post('/', zValidator('json', DirectBookingSchema), async (c) => {
  const data = c.req.valid('json');

  // Validate Turnstile token
  const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: c.env.TURNSTILE_SECRET_KEY,
      response: data.turnstile_token,
      remoteip: c.req.header('CF-Connecting-IP'),
    }),
  });

  const turnstileResult = (await turnstileResponse.json()) as { success: boolean };
  if (!turnstileResult.success) {
    return c.json(
      { success: false, error: { code: 'TURNSTILE_FAILED', message: 'Bot verification failed' } },
      403,
    );
  }

  // Duplicate check: same guest email + date + overlapping time
  if (data.guest_email) {
    const dup = await c.env.DB.prepare(
      `SELECT id FROM bookings
       WHERE guest_email = ? AND booking_date = ?
       AND start_time < ? AND end_time > ?
       AND status NOT IN ('REJECTED','CANCELLED')
       LIMIT 1`,
    ).bind(data.guest_email, data.booking_date, data.end_time, data.start_time).first();
    if (dup) {
      return c.json({ success: false, error: { code: 'DUPLICATE', message: 'A booking already exists for this guest at the requested time' } }, 409);
    }
  }

  // Room conflict check: prevent double-booking of the same room
  if (data.room_id) {
    const conflict = await c.env.DB.prepare(
      `SELECT id FROM bookings
       WHERE room_id = ? AND booking_date = ?
       AND start_time < ? AND end_time > ?
       AND status NOT IN ('REJECTED','CANCELLED')
       LIMIT 1`,
    ).bind(data.room_id, data.booking_date, data.end_time, data.start_time).first();
    if (conflict) {
      return c.json({ success: false, error: { code: 'ROOM_CONFLICT', message: 'This room is already booked for the requested time slot' } }, 409);
    }
  }

  const id = generateId();
  const now = nowISO();
  const duration = calculateDurationHours(data.start_time, data.end_time);

  await c.env.DB.prepare(
    `INSERT INTO bookings (id, platform, platform_ref, status, room_id, guest_name, guest_email, guest_phone,
     booking_date, start_time, end_time, duration_hours, guest_count, notes, ai_confidence,
     created_at, updated_at)
     VALUES (?, 'direct', NULL, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.0, ?, ?)`,
  )
    .bind(
      id,
      data.room_id ?? null,
      data.guest_name,
      data.guest_email,
      data.guest_phone ?? null,
      data.booking_date,
      data.start_time,
      data.end_time,
      duration,
      data.guest_count ?? null,
      data.notes ?? null,
      now,
      now,
    )
    .run();

  // Insert RECEIVED event
  await c.env.DB.prepare(
    'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
  )
    .bind(generateId(), id, 'RECEIVED', JSON.stringify({ source: 'direct_website' }), now)
    .run();

  return c.json({ success: true, data: { id, status: 'PENDING' } }, 201);
});

export default ingest;
