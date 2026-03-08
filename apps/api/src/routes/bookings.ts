import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  UpdateBookingStatusSchema,
  AssignRoomSchema,
  AddNoteSchema,
  BookingListQuerySchema,
  StaffBookingSchema,
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

// POST /api/bookings - Staff-created booking (walk-ins, phone bookings)
bookings.post('/', zValidator('json', StaffBookingSchema), async (c) => {
  const body = c.req.valid('json');
  const staff = c.get('staff');
  const now = nowISO();
  const id = generateId();

  await c.env.DB.prepare(
    `INSERT INTO bookings (id, platform, platform_ref, guest_name, guest_email, booking_date, start_time, end_time,
     duration_hours, guest_count, total_price, currency, notes, room_id, status, ai_confidence, assigned_to, created_at, updated_at)
     VALUES (?, 'direct', NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'GBP', ?, ?, 'CONFIRMED', 1.0, ?, ?, ?)`,
  )
    .bind(
      id,
      body.guest_name,
      body.guest_email ?? null,
      body.booking_date,
      body.start_time,
      body.end_time,
      // Calculate duration
      (() => {
        const parts = body.start_time.split(':').map(Number);
        const endParts = body.end_time.split(':').map(Number);
        return ((endParts[0]! * 60 + endParts[1]!) - (parts[0]! * 60 + parts[1]!)) / 60;
      })(),
      body.guest_count ?? null,
      body.total_price ?? null,
      body.notes ?? null,
      body.room_id ?? null,
      staff.id,
      now,
      now,
    )
    .run();

  // Insert audit event
  await c.env.DB.prepare(
    'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(generateId(), id, 'RECEIVED', staff.id, JSON.stringify({ source: 'staff_manual', created_by: staff.displayName }), now)
    .run();

  await broadcastUpdate(c.env, id, 'BOOKING_CREATED');
  return c.json({ success: true, data: { id } }, 201);
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

// PATCH /api/bookings/:id/assign - Assign coordinator staff
bookings.patch('/:id/assign', async (c) => {
  const id = c.req.param('id');
  const staff = c.get('staff');
  const { staff_id } = await c.req.json<{ staff_id: string | null }>();

  const booking = await c.env.DB.prepare('SELECT id FROM bookings WHERE id = ?')
    .bind(id)
    .first();

  if (!booking) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }

  // Validate target staff exists if not unassigning
  let assigneeName = 'Unassigned';
  if (staff_id) {
    const targetStaff = await c.env.DB.prepare('SELECT id, display_name FROM staff_users WHERE id = ? AND active = 1')
      .bind(staff_id)
      .first<{ id: string; display_name: string }>();

    if (!targetStaff) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Staff member not found' } }, 404);
    }
    assigneeName = targetStaff.display_name;
  }

  const now = nowISO();
  await c.env.DB.prepare('UPDATE bookings SET assigned_to = ?, updated_at = ? WHERE id = ?')
    .bind(staff_id, now, id)
    .run();

  await c.env.DB.prepare(
    'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(generateId(), id, 'ASSIGNED', staff.id, JSON.stringify({ assigned_to: staff_id, assignee_name: assigneeName }), now)
    .run();

  await broadcastUpdate(c.env, id, 'BOOKING_UPDATED');
  return c.json({ success: true, data: { id, assigned_to: staff_id } });
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

// POST /api/bookings/:id/re-extract - Re-run AI extraction on stored email
bookings.post('/:id/re-extract', async (c) => {
  const id = c.req.param('id');
  const staff = c.get('staff');

  const booking = await c.env.DB.prepare(
    'SELECT id, platform, raw_email_r2_key, status FROM bookings WHERE id = ?',
  )
    .bind(id)
    .first<{ id: string; platform: string; raw_email_r2_key: string | null; status: string }>();

  if (!booking) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }

  if (!booking.raw_email_r2_key) {
    return c.json({ success: false, error: { code: 'NO_EMAIL', message: 'No raw email stored for this booking' } }, 400);
  }

  // Fetch raw email from R2
  const r2Object = await c.env.EMAIL_ARCHIVE.get(booking.raw_email_r2_key);
  if (!r2Object) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Email archive not found in R2' } }, 404);
  }

  const rawEmail = await r2Object.text();

  // Parse email body - strip HTML to plain text for better AI extraction
  const htmlContent = rawEmail.includes('Content-Type:')
    ? rawEmail.split(/\r?\n\r?\n/).slice(1).join('\n\n')
    : rawEmail;

  const plainText = htmlContent
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<(p|div|tr|li|h[1-6])[^>]*>/gi, '\n')
    .replace(/<\/?(td|th)[^>]*>/gi, '\t')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&pound;/gi, '£')
    .replace(/&#163;/gi, '£')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!plainText) {
    return c.json({ success: false, error: { code: 'EMPTY_EMAIL', message: 'Could not extract text from email' } }, 400);
  }

  // Run AI extraction
  const platform = booking.platform as 'giggster' | 'peerspace' | 'scouty' | 'tagvenue' | 'direct';

  const platformHints: Record<string, string> = {
    giggster: 'Giggster booking platform email with structured data fields.',
    peerspace: 'Peerspace booking platform email with pricing and guest details.',
    scouty: 'Scouty booking platform email with reference numbers and location details.',
    tagvenue: 'TagVenue enquiry-style email with booking dates, times, and venue details.',
    direct: 'Email from an unknown sender classified as booking-related. Carefully scan ALL text for dates, times, guest names, guest counts, locations, and pricing.',
  };

  const prompt = `You are a booking data extraction system for a studio/venue management platform.
Extract ALL booking information from the email text below.

Platform context: ${platformHints[platform] ?? platformHints.direct}

Return ONLY a valid JSON object with these fields (use null for fields you cannot find):
{
  "guestName": "full name of the person making the booking",
  "guestEmail": "their email address if visible, else null",
  "requestedDate": "MUST be in YYYY-MM-DD format (e.g. 2026-03-13 for 13th March 2026)",
  "startTime": "MUST be in HH:MM 24-hour format (e.g. 12:00)",
  "endTime": "MUST be in HH:MM 24-hour format (e.g. 13:00)",
  "roomHint": "any venue, room, studio, or space name mentioned",
  "guestCount": number or null,
  "totalPrice": number or null,
  "notes": "any special requests, location details, or additional context",
  "confidence": 0.0 to 1.0 based on how many fields you successfully extracted
}

IMPORTANT:
- Dates like "Fri, 13 Mar 2026" → "2026-03-13"
- Times like "12:00 - 13:00" → startTime "12:00", endTime "13:00"
- Set confidence above 0.7 if you found date + time + at least one other field

EMAIL TEXT:
${plainText.slice(0, 4000)}`;

  try {
    const response = await (c.env.AI as unknown as { run(model: string, input: unknown): Promise<unknown> }).run(
      '@cf/meta/llama-3.1-70b-instruct',
      {
        messages: [
          { role: 'system', content: 'You are a precise data extraction assistant. Return ONLY valid JSON, no markdown, no code blocks, no explanations.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1024,
        temperature: 0.1,
      },
    );

    if (!response || typeof response !== 'object' || !('response' in response)) {
      return c.json({ success: false, error: { code: 'AI_ERROR', message: 'Unexpected AI response format' } }, 500);
    }

    const responseText = (response as { response: string }).response;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return c.json({
        success: false,
        error: { code: 'AI_NO_JSON', message: 'AI did not return valid JSON' },
        data: { ai_response: responseText.slice(0, 500), email_preview: plainText.slice(0, 300) },
      }, 500);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Clean up AI response
    for (const key of Object.keys(parsed)) {
      if (parsed[key] === 'null' || parsed[key] === 'N/A' || parsed[key] === '') parsed[key] = null;
    }
    if (typeof parsed.guestCount === 'string') parsed.guestCount = parseInt(parsed.guestCount, 10) || null;
    if (typeof parsed.totalPrice === 'string') parsed.totalPrice = parseFloat(parsed.totalPrice) || null;
    if (typeof parsed.confidence === 'string') parsed.confidence = parseFloat(parsed.confidence) || 0;

    // Update the booking with extracted data
    const now = nowISO();
    const updates: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (parsed.guestName && parsed.guestName !== 'null') {
      updates.push('guest_name = ?');
      params.push(parsed.guestName);
    }
    if (parsed.guestEmail && parsed.guestEmail !== 'null') {
      updates.push('guest_email = ?');
      params.push(parsed.guestEmail);
    }
    if (parsed.requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.requestedDate)) {
      updates.push('booking_date = ?');
      params.push(parsed.requestedDate);
    }
    if (parsed.startTime && /^\d{2}:\d{2}$/.test(parsed.startTime)) {
      updates.push('start_time = ?');
      params.push(parsed.startTime);
    }
    if (parsed.endTime && /^\d{2}:\d{2}$/.test(parsed.endTime)) {
      updates.push('end_time = ?');
      params.push(parsed.endTime);
    }
    if (parsed.guestCount != null) {
      updates.push('guest_count = ?');
      params.push(parsed.guestCount);
    }
    if (parsed.totalPrice != null) {
      updates.push('total_price = ?');
      params.push(parsed.totalPrice);
    }
    if (parsed.notes) {
      updates.push('notes = ?');
      params.push(parsed.notes);
    }

    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
    updates.push('ai_confidence = ?');
    params.push(confidence);

    // Calculate duration if we have times
    if (parsed.startTime && parsed.endTime) {
      const startParts = parsed.startTime.split(':').map(Number);
      const endParts = parsed.endTime.split(':').map(Number);
      const duration = ((endParts[0] * 60 + endParts[1]) - (startParts[0] * 60 + startParts[1])) / 60;
      if (duration > 0) {
        updates.push('duration_hours = ?');
        params.push(duration);
      }
    }

    params.push(id);

    await c.env.DB.prepare(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();

    // Add audit event
    await c.env.DB.prepare(
      'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(
        generateId(), id, 'EDITED', staff.id,
        JSON.stringify({ action: 're-extract', confidence, fields_updated: updates.filter(u => u !== 'updated_at = ?' && u !== 'ai_confidence = ?').map(u => u.split(' =')[0]) }),
        now,
      )
      .run();

    await broadcastUpdate(c.env, id, 'BOOKING_UPDATED');

    return c.json({
      success: true,
      data: { extracted: parsed, confidence, fields_updated: updates.length - 2 },
    });
  } catch (err) {
    console.error('Re-extraction failed:', err);
    return c.json({ success: false, error: { code: 'EXTRACTION_ERROR', message: String(err) } }, 500);
  }
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
