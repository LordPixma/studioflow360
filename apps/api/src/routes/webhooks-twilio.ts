import { Hono } from 'hono';
import { generateId, nowISO } from '@studioflow360/shared';
import type { Env } from '../types.js';

type TwilioEnv = {
  Bindings: Env;
};

const twilioWebhook = new Hono<TwilioEnv>();

// POST /api/webhooks/twilio/sms — Inbound SMS from Twilio
twilioWebhook.post('/sms', async (c) => {
  return handleInbound(c, 'sms');
});

// POST /api/webhooks/twilio/whatsapp — Inbound WhatsApp from Twilio
twilioWebhook.post('/whatsapp', async (c) => {
  return handleInbound(c, 'whatsapp');
});

async function handleInbound(c: { env: Env; req: { text: () => Promise<string>; header: (name: string) => string | undefined } }, channel: 'sms' | 'whatsapp') {
  const rawBody = await c.req.text();
  const params = new URLSearchParams(rawBody);

  const from = params.get('From') ?? '';
  const to = params.get('To') ?? '';
  const body = params.get('Body') ?? '';
  const twilioSid = params.get('MessageSid') ?? '';

  // Strip whatsapp: prefix for matching
  const cleanFrom = from.replace('whatsapp:', '');
  const cleanTo = to.replace('whatsapp:', '');

  if (!body.trim()) {
    // Empty message — acknowledge but don't store
    return twimlResponse('');
  }

  const now = nowISO();
  const msgId = generateId();

  // Try to match to a booking by guest phone, coordinator phone, or guest email pattern
  const matchedBooking = await findBookingByPhone(c.env, cleanFrom);

  const bookingId = matchedBooking?.id ?? null;

  // Store the inbound message
  if (bookingId) {
    await c.env.DB.prepare(
      `INSERT INTO messages (id, booking_id, direction, channel, from_number, to_number, body, twilio_sid, status, is_read, created_at)
       VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, 'received', 0, ?)`,
    ).bind(msgId, bookingId, channel, cleanFrom, cleanTo, body, twilioSid, now).run();
  } else {
    // No matching booking — store as unlinked message with a placeholder booking_id
    // We use a special 'UNLINKED' booking reference so they still show up
    await c.env.DB.prepare(
      `INSERT INTO messages (id, booking_id, direction, channel, from_number, to_number, body, twilio_sid, status, is_read, created_at)
       VALUES (?, '__UNLINKED__', 'inbound', ?, ?, ?, ?, ?, 'received', 0, ?)`,
    ).bind(msgId, channel, cleanFrom, cleanTo, body, twilioSid, now).run();
  }

  // Broadcast via WebSocket for real-time dashboard update
  try {
    const hubId = c.env.BOOKING_HUB.idFromName('global');
    const hub = c.env.BOOKING_HUB.get(hubId);
    await hub.fetch(new Request('https://hub/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        type: 'MESSAGE_RECEIVED',
        message_id: msgId,
        booking_id: bookingId,
        channel,
        from: cleanFrom,
        preview: body.slice(0, 100),
        timestamp: now,
      }),
    }));
  } catch { /* non-critical */ }

  console.log(`Inbound ${channel} from ${cleanFrom}: "${body.slice(0, 50)}" → booking ${bookingId ?? 'unlinked'}`);

  // Return empty TwiML response (acknowledge receipt)
  return twimlResponse('');
}

// Find a booking by matching the phone number
async function findBookingByPhone(env: Env, phone: string): Promise<{ id: string; guest_name: string } | null> {
  // Normalise: strip spaces, dashes, and leading 0 → +44 for UK
  const variants = [phone];
  const digits = phone.replace(/[\s\-()]/g, '');
  if (!variants.includes(digits)) variants.push(digits);
  // Also try without country code prefix
  if (digits.startsWith('+44')) variants.push('0' + digits.slice(3));
  if (digits.startsWith('0')) variants.push('+44' + digits.slice(1));

  for (const p of variants) {
    // Check guest_phone on bookings
    const booking = await env.DB.prepare(
      `SELECT id, guest_name FROM bookings WHERE guest_phone = ? AND status NOT IN ('REJECTED','CANCELLED') ORDER BY created_at DESC LIMIT 1`,
    ).bind(p).first<{ id: string; guest_name: string }>();
    if (booking) return booking;

    // Check coordinator_phone
    const coordBooking = await env.DB.prepare(
      `SELECT id, guest_name FROM bookings WHERE coordinator_phone = ? AND status NOT IN ('REJECTED','CANCELLED') ORDER BY created_at DESC LIMIT 1`,
    ).bind(p).first<{ id: string; guest_name: string }>();
    if (coordBooking) return coordBooking;
  }

  // Check previous messages from this number
  for (const p of variants) {
    const prevMsg = await env.DB.prepare(
      `SELECT booking_id FROM messages WHERE from_number = ? AND booking_id != '__UNLINKED__' ORDER BY created_at DESC LIMIT 1`,
    ).bind(p).first<{ booking_id: string }>();
    if (prevMsg) {
      const booking = await env.DB.prepare('SELECT id, guest_name FROM bookings WHERE id = ?')
        .bind(prevMsg.booking_id).first<{ id: string; guest_name: string }>();
      if (booking) return booking;
    }
  }

  return null;
}

function twimlResponse(message: string): Response {
  const twiml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default twilioWebhook;
