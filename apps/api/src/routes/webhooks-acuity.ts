import { Hono } from 'hono';
import { generateId, nowISO } from '@studioflow360/shared';
import type { Env } from '../types.js';

type AcuityEnv = {
  Bindings: Env;
};

const acuityWebhook = new Hono<AcuityEnv>();

// --- Acuity API helpers ---

async function fetchAppointment(env: Env, appointmentId: string): Promise<AcuityAppointment | null> {
  const credentials = btoa(`${env.ACUITY_USER_ID}:${env.ACUITY_API_KEY}`);
  const res = await fetch(`https://acuityscheduling.com/api/v1/appointments/${appointmentId}`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) {
    console.error(`Acuity API error (${res.status}): ${await res.text()}`);
    return null;
  }
  return res.json() as Promise<AcuityAppointment>;
}

async function verifySignatureAsync(body: string, signature: string, apiKey: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return computed === signature;
  } catch {
    return false;
  }
}

// --- Types ---

interface AcuityAppointment {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  datetime: string;       // ISO 8601: "2026-04-15T10:15:00-0700"
  endTime: string;        // "11:15am"
  duration: string;       // minutes as string
  type: string;           // appointment type name
  appointmentTypeID: number;
  calendarID: number;
  calendar: string;       // calendar name
  location: string;
  price: string;          // e.g. "150.00"
  paid: string;           // "yes" | "no"
  amountPaid: string;
  notes: string;
  forms: AcuityForm[];
  canceled: boolean;
  canClientCancel: boolean;
  canClientReschedule: boolean;
  dateCreated: string;
  confirmationPage: string;
  labels: Array<{ id: number; name: string; color: string }>;
}

interface AcuityForm {
  id: number;
  name: string;
  values: Array<{ id: number; fieldID: number; name: string; value: string }>;
}

// --- Webhook handler ---

// POST /api/webhooks/acuity
// Acuity sends: application/x-www-form-urlencoded with fields: action, id, calendarID, appointmentTypeID
acuityWebhook.post('/', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('x-acuity-signature');

  // Verify HMAC signature
  if (c.env.ACUITY_API_KEY) {
    const valid = await verifySignatureAsync(rawBody, signature ?? '', c.env.ACUITY_API_KEY);
    if (!valid) {
      console.error('Acuity webhook signature verification failed');
      return c.json({ success: false, error: 'Invalid signature' }, 401);
    }
  }

  // Parse URL-encoded body
  const params = new URLSearchParams(rawBody);
  const action = params.get('action');
  const appointmentId = params.get('id');

  if (!action || !appointmentId) {
    return c.json({ success: false, error: 'Missing action or id' }, 400);
  }

  console.log(`Acuity webhook: action=${action} id=${appointmentId}`);

  switch (action) {
    case 'scheduled':
      return handleScheduled(c.env, appointmentId);
    case 'rescheduled':
      return handleRescheduled(c.env, appointmentId);
    case 'canceled':
      return handleCanceled(c.env, appointmentId);
    case 'changed':
      return handleChanged(c.env, appointmentId);
    default:
      // Acknowledge unknown events gracefully
      return c.json({ success: true, message: `Ignored action: ${action}` });
  }
});

// --- Event handlers ---

async function handleScheduled(env: Env, appointmentId: string) {
  const appt = await fetchAppointment(env, appointmentId);
  if (!appt) {
    return new Response(JSON.stringify({ success: false, error: 'Failed to fetch appointment' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check if we already have this booking (idempotency)
  const existing = await env.DB.prepare(
    `SELECT id FROM bookings WHERE platform = 'acuity' AND platform_ref = ?`,
  ).bind(String(appt.id)).first();

  if (existing) {
    return new Response(JSON.stringify({ success: true, message: 'Already ingested' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const booking = mapAppointmentToBooking(appt);
  const id = generateId();
  const now = nowISO();

  // Duplicate check: same guest email + date + overlapping time
  if (booking.guest_email) {
    const dup = await env.DB.prepare(
      `SELECT id FROM bookings
       WHERE guest_email = ? AND booking_date = ?
       AND start_time < ? AND end_time > ?
       AND status NOT IN ('REJECTED','CANCELLED')
       LIMIT 1`,
    ).bind(booking.guest_email, booking.booking_date, booking.end_time, booking.start_time).first();
    if (dup) {
      console.log(`Acuity booking ${appt.id} is a duplicate of ${(dup as { id: string }).id}, skipping`);
      return new Response(JSON.stringify({ success: true, message: 'Duplicate detected, skipped' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  await env.DB.prepare(
    `INSERT INTO bookings (id, platform, platform_ref, status, guest_name, guest_email,
     booking_date, start_time, end_time, duration_hours, guest_count, total_price, currency,
     notes, ai_confidence, created_at, updated_at)
     VALUES (?, 'acuity', ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, 'GBP', ?, 1.0, ?, ?)`,
  )
    .bind(
      id,
      String(appt.id),
      booking.guest_name,
      booking.guest_email,
      booking.booking_date,
      booking.start_time,
      booking.end_time,
      booking.duration_hours,
      booking.guest_count,
      booking.total_price,
      booking.notes,
      now,
      now,
    )
    .run();

  // Audit event
  await env.DB.prepare(
    'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
  ).bind(
    generateId(), id, 'RECEIVED',
    JSON.stringify({
      source: 'acuity_webhook',
      acuity_id: appt.id,
      appointment_type: appt.type,
      calendar: appt.calendar,
      paid: appt.paid,
    }),
    now,
  ).run();

  // Broadcast via WebSocket
  try {
    const hubId = env.BOOKING_HUB.idFromName('global');
    const hub = env.BOOKING_HUB.get(hubId);
    await hub.fetch(new Request('https://hub/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'BOOKING_CREATED', booking_id: id, timestamp: now }),
    }));
  } catch { /* non-critical */ }

  console.log(`Acuity booking ${appt.id} ingested as ${id}`);
  return new Response(JSON.stringify({ success: true, data: { id } }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleRescheduled(env: Env, appointmentId: string) {
  const appt = await fetchAppointment(env, appointmentId);
  if (!appt) {
    return new Response(JSON.stringify({ success: false, error: 'Failed to fetch appointment' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Find existing booking by platform_ref
  const existing = await env.DB.prepare(
    `SELECT id, status FROM bookings WHERE platform = 'acuity' AND platform_ref = ?`,
  ).bind(String(appt.id)).first<{ id: string; status: string }>();

  if (!existing) {
    // If we don't have it, treat as a new booking
    return handleScheduled(env, appointmentId);
  }

  const booking = mapAppointmentToBooking(appt);
  const now = nowISO();

  await env.DB.prepare(
    `UPDATE bookings SET guest_name = ?, guest_email = ?, booking_date = ?, start_time = ?,
     end_time = ?, duration_hours = ?, total_price = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(
    booking.guest_name,
    booking.guest_email,
    booking.booking_date,
    booking.start_time,
    booking.end_time,
    booking.duration_hours,
    booking.total_price,
    booking.notes,
    now,
    existing.id,
  ).run();

  // Audit event
  await env.DB.prepare(
    'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
  ).bind(
    generateId(), existing.id, 'EDITED',
    JSON.stringify({
      source: 'acuity_webhook',
      action: 'rescheduled',
      acuity_id: appt.id,
      new_date: booking.booking_date,
      new_start: booking.start_time,
      new_end: booking.end_time,
    }),
    now,
  ).run();

  // Broadcast
  try {
    const hubId = env.BOOKING_HUB.idFromName('global');
    const hub = env.BOOKING_HUB.get(hubId);
    await hub.fetch(new Request('https://hub/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'BOOKING_UPDATED', booking_id: existing.id, timestamp: now }),
    }));
  } catch { /* non-critical */ }

  console.log(`Acuity booking ${appt.id} rescheduled, updated ${existing.id}`);
  return new Response(JSON.stringify({ success: true, data: { id: existing.id, action: 'rescheduled' } }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleCanceled(env: Env, appointmentId: string) {
  // Find existing booking
  const existing = await env.DB.prepare(
    `SELECT id, status, calendar_event_id FROM bookings WHERE platform = 'acuity' AND platform_ref = ?`,
  ).bind(appointmentId).first<{ id: string; status: string; calendar_event_id: string | null }>();

  if (!existing) {
    return new Response(JSON.stringify({ success: true, message: 'Booking not found, nothing to cancel' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Don't re-cancel already-cancelled bookings
  if (existing.status === 'CANCELLED' || existing.status === 'REJECTED') {
    return new Response(JSON.stringify({ success: true, message: 'Already cancelled' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = nowISO();

  await env.DB.prepare(
    `UPDATE bookings SET status = 'CANCELLED', updated_at = ? WHERE id = ?`,
  ).bind(now, existing.id).run();

  // If there's a calendar event, delete it
  if (existing.calendar_event_id) {
    try {
      const { deleteCalendarEvent } = await import('../services/outlook-calendar.js');
      await deleteCalendarEvent(env, existing.calendar_event_id);
      await env.DB.prepare('UPDATE bookings SET calendar_event_id = NULL WHERE id = ?')
        .bind(existing.id).run();
    } catch (err) {
      console.error('Failed to delete calendar event for cancelled Acuity booking:', err);
    }
  }

  // Audit event
  await env.DB.prepare(
    'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
  ).bind(
    generateId(), existing.id, 'CANCELLED',
    JSON.stringify({ source: 'acuity_webhook', acuity_id: appointmentId }),
    now,
  ).run();

  // Broadcast
  try {
    const hubId = env.BOOKING_HUB.idFromName('global');
    const hub = env.BOOKING_HUB.get(hubId);
    await hub.fetch(new Request('https://hub/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'BOOKING_UPDATED', booking_id: existing.id, timestamp: now }),
    }));
  } catch { /* non-critical */ }

  console.log(`Acuity booking ${appointmentId} cancelled, updated ${existing.id}`);
  return new Response(JSON.stringify({ success: true, data: { id: existing.id, action: 'cancelled' } }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleChanged(env: Env, appointmentId: string) {
  // "changed" is a catch-all — fetch the appointment and decide what to do
  const appt = await fetchAppointment(env, appointmentId);
  if (!appt) {
    return new Response(JSON.stringify({ success: false, error: 'Failed to fetch appointment' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (appt.canceled) {
    return handleCanceled(env, appointmentId);
  }

  // Check if exists — if so, update; if not, create
  const existing = await env.DB.prepare(
    `SELECT id FROM bookings WHERE platform = 'acuity' AND platform_ref = ?`,
  ).bind(String(appt.id)).first();

  if (existing) {
    return handleRescheduled(env, appointmentId);
  }
  return handleScheduled(env, appointmentId);
}

// --- Mapping ---

interface MappedBooking {
  guest_name: string;
  guest_email: string | null;
  booking_date: string;     // YYYY-MM-DD
  start_time: string;       // HH:MM
  end_time: string;         // HH:MM
  duration_hours: number;
  guest_count: number | null;
  total_price: number | null;
  notes: string | null;
}

function mapAppointmentToBooking(appt: AcuityAppointment): MappedBooking {
  // Parse the ISO datetime from Acuity
  const dt = new Date(appt.datetime);

  // Extract date as YYYY-MM-DD in London time
  // Acuity sends the datetime in the calendar's timezone
  const booking_date = formatDateLondon(dt);
  const start_time = formatTimeLondon(dt);

  // Calculate end time from duration
  const durationMinutes = parseInt(appt.duration, 10) || 60;
  const endDt = new Date(dt.getTime() + durationMinutes * 60 * 1000);
  const end_time = formatTimeLondon(endDt);

  // Parse price
  const price = parseFloat(appt.price);
  const total_price = isNaN(price) ? null : price;

  // Extract guest count from forms if available
  let guest_count: number | null = null;
  for (const form of appt.forms ?? []) {
    for (const val of form.values ?? []) {
      const name = val.name.toLowerCase();
      if (name.includes('guest') || name.includes('attendee') || name.includes('people') || name.includes('pax')) {
        const parsed = parseInt(val.value, 10);
        if (!isNaN(parsed)) guest_count = parsed;
      }
    }
  }

  // Build notes from appointment type, location, form data, and Acuity notes
  const notesParts: string[] = [];
  if (appt.type) notesParts.push(`Type: ${appt.type}`);
  if (appt.location) notesParts.push(`Location: ${appt.location}`);
  if (appt.calendar) notesParts.push(`Calendar: ${appt.calendar}`);
  if (appt.paid === 'yes') notesParts.push(`Paid: ${appt.amountPaid}`);
  if (appt.notes) notesParts.push(`Client notes: ${appt.notes}`);

  // Include custom form responses
  for (const form of appt.forms ?? []) {
    for (const val of form.values ?? []) {
      if (val.value && val.value.trim()) {
        notesParts.push(`${val.name}: ${val.value}`);
      }
    }
  }

  return {
    guest_name: `${appt.firstName} ${appt.lastName}`.trim(),
    guest_email: appt.email || null,
    booking_date,
    start_time,
    end_time,
    duration_hours: durationMinutes / 60,
    guest_count,
    total_price,
    notes: notesParts.length > 0 ? notesParts.join('\n') : null,
  };
}

// Format date/time for London timezone
// Since Workers don't have full Intl in all runtimes, we use a simple approach
function formatDateLondon(dt: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
  return parts; // Returns YYYY-MM-DD
}

function formatTimeLondon(dt: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(dt);
  return parts; // Returns HH:MM
}

export default acuityWebhook;
