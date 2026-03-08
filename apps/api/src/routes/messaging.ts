import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { SendMessageSchema, UpdateBookingChatSchema, generateId, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type MsgEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const messaging = new Hono<MsgEnv>();

// POST /api/messaging/send - Send SMS or WhatsApp message via Twilio
messaging.post('/send', zValidator('json', SendMessageSchema), async (c) => {
  const body = c.req.valid('json');

  // Verify booking exists
  const booking = await c.env.DB.prepare('SELECT id, guest_name FROM bookings WHERE id = ?')
    .bind(body.booking_id)
    .first<{ id: string; guest_name: string }>();

  if (!booking) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }

  const fromNumber = body.channel === 'whatsapp'
    ? `whatsapp:${c.env.TWILIO_WHATSAPP_NUMBER}`
    : c.env.TWILIO_PHONE_NUMBER;

  const toNumber = body.channel === 'whatsapp'
    ? `whatsapp:${body.to_number}`
    : body.to_number;

  // Send via Twilio REST API
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${c.env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = btoa(`${c.env.TWILIO_ACCOUNT_SID}:${c.env.TWILIO_AUTH_TOKEN}`);

  const formData = new URLSearchParams();
  formData.set('From', fromNumber);
  formData.set('To', toNumber);
  formData.set('Body', body.body);

  const twilioResponse = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  const twilioData = await twilioResponse.json() as Record<string, unknown>;
  const now = nowISO();
  const msgId = generateId();

  if (!twilioResponse.ok) {
    // Log failed attempt
    await c.env.DB.prepare(
      `INSERT INTO messages (id, booking_id, direction, channel, from_number, to_number, body, twilio_sid, status, created_at)
       VALUES (?, ?, 'outbound', ?, ?, ?, ?, NULL, 'failed', ?)`,
    )
      .bind(msgId, body.booking_id, body.channel, fromNumber, toNumber, body.body, now)
      .run();

    return c.json({
      success: false,
      error: { code: 'TWILIO_ERROR', message: (twilioData.message as string) ?? 'Failed to send message' },
    }, 502);
  }

  // Log successful send
  await c.env.DB.prepare(
    `INSERT INTO messages (id, booking_id, direction, channel, from_number, to_number, body, twilio_sid, status, created_at)
     VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, 'sent', ?)`,
  )
    .bind(msgId, body.booking_id, body.channel, fromNumber, toNumber, body.body, twilioData.sid as string, now)
    .run();

  return c.json({
    success: true,
    data: { id: msgId, twilio_sid: twilioData.sid, status: 'sent' },
  });
});

// GET /api/messaging/booking/:id - Get message history for a booking
messaging.get('/booking/:id', async (c) => {
  const bookingId = c.req.param('id');

  const messages = await c.env.DB.prepare(
    'SELECT * FROM messages WHERE booking_id = ? ORDER BY created_at DESC LIMIT 100',
  )
    .bind(bookingId)
    .all();

  return c.json({ success: true, data: messages.results });
});

// PATCH /api/bookings/:id/chat-link - Update booking's external chat link
messaging.patch('/booking/:id/chat-link', zValidator('json', UpdateBookingChatSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const now = nowISO();

  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (body.external_chat_link !== undefined) {
    updates.push('external_chat_link = ?');
    params.push(body.external_chat_link);
  }
  if (body.coordinator_phone !== undefined) {
    updates.push('coordinator_phone = ?');
    params.push(body.coordinator_phone);
  }

  params.push(id);
  const result = await c.env.DB.prepare(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  if (!result.meta.changes) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }

  return c.json({ success: true, data: { id } });
});

export default messaging;
