import { Hono } from 'hono';
import { generateId, nowISO } from '@studioflow360/shared';
import type { Env } from '../types.js';

type StripeEnv = {
  Bindings: Env;
};

const stripe = new Hono<StripeEnv>();

// --- Stripe API helpers (no SDK needed — raw fetch) ---

async function stripeRequest(
  secretKey: string,
  method: string,
  path: string,
  body?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  return res.json() as Promise<Record<string, unknown>>;
}

// --- Checkout Session Creation ---

// POST /api/public/checkout — Create a Stripe Checkout Session for a booking
stripe.post('/checkout', async (c) => {
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'Payments are not configured' } }, 503);
  }

  const body = await c.req.json<{
    booking_id: string;
    guest_name: string;
    guest_email: string;
    room_name: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    amount: number; // total in GBP (e.g. 150.00)
    return_url?: string;
  }>();

  if (!body.booking_id || !body.amount || body.amount <= 0) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing booking_id or amount' } }, 400);
  }

  // Verify the booking exists and is unpaid
  const booking = await c.env.DB.prepare(
    'SELECT id, payment_status FROM bookings WHERE id = ?',
  ).bind(body.booking_id).first<{ id: string; payment_status: string }>();

  if (!booking) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }

  if (booking.payment_status === 'paid') {
    return c.json({ success: false, error: { code: 'ALREADY_PAID', message: 'This booking has already been paid' } }, 400);
  }

  // Amount in pence (Stripe uses smallest currency unit)
  const amountPence = Math.round(body.amount * 100);

  const origin = c.req.header('origin') || c.req.header('referer')?.replace(/\/[^/]*$/, '') || 'https://app.studiomgr360.com';
  const successUrl = `${origin}/book?payment=success&booking_id=${body.booking_id}`;
  const cancelUrl = `${origin}/book?payment=cancelled&booking_id=${body.booking_id}`;

  const session = await stripeRequest(c.env.STRIPE_SECRET_KEY, 'POST', '/checkout/sessions', {
    'mode': 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][price_data][currency]': 'gbp',
    'line_items[0][price_data][unit_amount]': String(amountPence),
    'line_items[0][price_data][product_data][name]': `${body.room_name} — ${body.booking_date}`,
    'line_items[0][price_data][product_data][description]': `${body.start_time} - ${body.end_time} • ${body.guest_name}`,
    'line_items[0][quantity]': '1',
    'customer_email': body.guest_email,
    'success_url': successUrl,
    'cancel_url': cancelUrl,
    'metadata[booking_id]': body.booking_id,
    'metadata[guest_name]': body.guest_name,
  });

  if (session.error) {
    console.error('Stripe checkout error:', JSON.stringify(session.error));
    return c.json({ success: false, error: { code: 'STRIPE_ERROR', message: 'Failed to create checkout session' } }, 502);
  }

  const sessionId = session.id as string;
  const checkoutUrl = session.url as string;

  // Store session ID on the booking
  await c.env.DB.prepare(
    'UPDATE bookings SET stripe_checkout_session_id = ?, payment_status = ?, updated_at = ? WHERE id = ?',
  ).bind(sessionId, 'pending', nowISO(), body.booking_id).run();

  return c.json({ success: true, data: { checkout_url: checkoutUrl, session_id: sessionId } });
});

// GET /api/public/stripe-key — Return Stripe publishable key (for frontend)
stripe.get('/stripe-key', async (c) => {
  return c.json({
    success: true,
    data: { publishable_key: c.env.STRIPE_PUBLIC_KEY || null },
  });
});

// --- Stripe Webhook ---

// POST /api/webhooks/stripe — Handle Stripe webhook events
stripe.post('/webhook', async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header('stripe-signature');

  // Verify webhook signature
  if (c.env.STRIPE_WEBHOOK_SECRET && sig) {
    const verified = await verifyStripeSignature(rawBody, sig, c.env.STRIPE_WEBHOOK_SECRET);
    if (!verified) {
      console.error('Stripe webhook signature verification failed');
      return c.json({ error: 'Invalid signature' }, 401);
    }
  }

  const event = JSON.parse(rawBody) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  console.log(`Stripe webhook: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const bookingId = (session.metadata as Record<string, string>)?.booking_id;
      const paymentIntent = session.payment_intent as string;
      const amountTotal = session.amount_total as number;

      if (!bookingId) {
        console.error('Stripe webhook: no booking_id in metadata');
        break;
      }

      const now = nowISO();
      await c.env.DB.prepare(
        `UPDATE bookings SET payment_status = 'paid', stripe_payment_intent_id = ?, amount_paid = ?, paid_at = ?, updated_at = ? WHERE id = ?`,
      ).bind(paymentIntent, (amountTotal ?? 0) / 100, now, now, bookingId).run();

      // Audit event
      await c.env.DB.prepare(
        'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
      ).bind(
        generateId(), bookingId, 'PAYMENT_RECEIVED',
        JSON.stringify({
          source: 'stripe',
          payment_intent: paymentIntent,
          amount: (amountTotal ?? 0) / 100,
          currency: 'GBP',
        }),
        now,
      ).run();

      // Broadcast update
      try {
        const hubId = c.env.BOOKING_HUB.idFromName('global');
        const hub = c.env.BOOKING_HUB.get(hubId);
        await hub.fetch(new Request('https://hub/broadcast', {
          method: 'POST',
          body: JSON.stringify({ type: 'BOOKING_UPDATED', booking_id: bookingId, timestamp: now }),
        }));
      } catch { /* non-critical */ }

      console.log(`Payment received for booking ${bookingId}: £${(amountTotal ?? 0) / 100}`);
      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object;
      const bookingId = (session.metadata as Record<string, string>)?.booking_id;
      if (bookingId) {
        await c.env.DB.prepare(
          `UPDATE bookings SET payment_status = 'failed', updated_at = ? WHERE id = ? AND payment_status = 'pending'`,
        ).bind(nowISO(), bookingId).run();
      }
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      const paymentIntent = charge.payment_intent as string;
      if (paymentIntent) {
        const now = nowISO();
        await c.env.DB.prepare(
          `UPDATE bookings SET payment_status = 'refunded', updated_at = ? WHERE stripe_payment_intent_id = ?`,
        ).bind(now, paymentIntent).run();
      }
      break;
    }
  }

  return c.json({ received: true });
});

// --- Signature verification ---

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  try {
    const parts = header.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      if (key && value) acc[key.trim()] = value.trim();
      return acc;
    }, {} as Record<string, string>);

    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;

    // Check timestamp is within 5 minutes
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > 300) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computed === signature;
  } catch {
    return false;
  }
}

export default stripe;
