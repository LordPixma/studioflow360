import PostalMime from 'postal-mime';
import {
  BookingCandidateSchema,
  QueueMessageSchema,
  generateId,
  nowISO,
  AI_CONFIDENCE_THRESHOLD,
  calculateDurationHours,
} from '@studioflow360/shared';
import type { Platform, BookingCandidate, QueueMessage } from '@studioflow360/shared';

interface Env {
  DB: D1Database;
  EMAIL_ARCHIVE: R2Bucket;
  AI: Ai;
  API_WORKER: Fetcher;
}

function buildExtractionPrompt(platform: Platform, emailBody: string): string {
  const platformHints: Record<Platform, string> = {
    giggster:
      'Giggster emails use branded HTML templates with time slots and room details. Look for booking reference numbers, dates, times, and guest information.',
    peerspace:
      'Peerspace emails are rich HTML with pricing breakdowns and guest profiles. Extract booking dates, times, prices, and guest details.',
    scouty:
      'Scouty emails have structured HTML with booking reference in the subject line. Dates and location details are in the body.',
    tagvenue:
      'TagVenue emails may be plain-text or minimal HTML in an enquiry-style format. Extract whatever booking details are available.',
    direct: 'Direct booking with all fields provided.',
  };

  return `You are a booking data extraction system for a studio management platform.
Extract booking information from the following ${platform} platform email.

${platformHints[platform]}

Return ONLY a valid JSON object with these fields (use null for any field you cannot find):
{
  "platform": "${platform}",
  "platformRef": "booking reference number or ID",
  "guestName": "name of the person booking",
  "guestEmail": "their email if visible",
  "requestedDate": "YYYY-MM-DD format",
  "startTime": "HH:MM in 24-hour format",
  "endTime": "HH:MM in 24-hour format",
  "durationHours": null,
  "roomHint": "any room or space name mentioned",
  "guestCount": null,
  "totalPrice": null,
  "currency": "GBP",
  "notes": "any special requests or additional context",
  "confidence": 0.0 to 1.0 based on how confident you are in the extraction
}

Be conservative with the confidence score. If key fields like date, time, or guest name are unclear, set confidence below 0.6.

EMAIL CONTENT:
${emailBody}`;
}

async function parseEmailBody(rawEmail: string): Promise<string> {
  const parser = new PostalMime();
  const parsed = await parser.parse(rawEmail);

  // Prefer HTML for richer content, fall back to text
  return parsed.html || parsed.text || '';
}

async function extractBookingWithAI(
  env: Env,
  platform: Platform,
  emailBody: string,
): Promise<BookingCandidate | null> {
  const prompt = buildExtractionPrompt(platform, emailBody);

  // Model name may update — cast to satisfy type checker
  const response = await (env.AI as { run(model: string, input: unknown): Promise<unknown> }).run('@cf/meta/llama-3.1-70b-instruct', {
    messages: [
      {
        role: 'system',
        content: 'You are a precise data extraction assistant. Return only valid JSON, no explanations.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 1024,
    temperature: 0.1,
  });

  if (!response || typeof response !== 'object' || !('response' in response)) {
    console.error('Unexpected AI response format');
    return null;
  }

  const responseText = (response as { response: string }).response;

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON found in AI response:', responseText);
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const validated = BookingCandidateSchema.parse(parsed);
    return validated;
  } catch (error) {
    console.error('Failed to parse AI extraction:', error);
    return null;
  }
}

export default {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const queueMsg = QueueMessageSchema.parse(message.body);
        await processBookingEmail(env, queueMsg);
        message.ack();
      } catch (error) {
        console.error('Failed to process queue message:', error);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;

async function processBookingEmail(env: Env, msg: QueueMessage): Promise<void> {
  // 1. Fetch raw email from R2
  const r2Object = await env.EMAIL_ARCHIVE.get(msg.r2Key);
  if (!r2Object) {
    throw new Error(`Email not found in R2: ${msg.r2Key}`);
  }

  const rawEmail = await r2Object.text();

  // 2. Parse MIME to extract body
  const emailBody = await parseEmailBody(rawEmail);
  if (!emailBody) {
    throw new Error('Empty email body after parsing');
  }

  // 3. Extract booking fields with Workers AI
  const candidate = await extractBookingWithAI(env, msg.platform, emailBody);

  if (!candidate) {
    // AI extraction failed — create a NEEDS_REVIEW booking with minimal data
    const id = generateId();
    const now = nowISO();

    await env.DB.prepare(
      `INSERT INTO bookings (id, platform, status, guest_name, booking_date, start_time, end_time,
       ai_confidence, raw_email_r2_key, created_at, updated_at)
       VALUES (?, ?, 'NEEDS_REVIEW', 'Unknown (AI extraction failed)', '1970-01-01', '00:00', '00:00',
       0.0, ?, ?, ?)`,
    )
      .bind(id, msg.platform, msg.r2Key, now, now)
      .run();

    await insertEvent(env, id, 'RECEIVED', null, { source: 'email', messageId: msg.messageId });
    await insertEvent(env, id, 'PARSED', null, { ai_failed: true, platform: msg.platform });

    try {
      await env.API_WORKER.fetch(new Request('https://internal/api/internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({ type: 'BOOKING_CREATED', booking_id: id, timestamp: now }),
      }));
    } catch { /* broadcast failure is non-critical */ }

    console.log(`Created NEEDS_REVIEW booking ${id} — AI extraction failed`);
    return;
  }

  // 4. Determine status based on confidence
  const status = candidate.confidence < AI_CONFIDENCE_THRESHOLD ? 'NEEDS_REVIEW' : 'PENDING';

  // 5. Calculate duration if not provided
  const duration =
    candidate.durationHours ?? calculateDurationHours(candidate.startTime, candidate.endTime);

  // 6. Insert booking into D1
  const id = generateId();
  const now = nowISO();

  await env.DB.prepare(
    `INSERT INTO bookings (id, platform, platform_ref, status, guest_name, guest_email,
     booking_date, start_time, end_time, duration_hours, guest_count, total_price, currency,
     notes, ai_confidence, raw_email_r2_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      candidate.platform,
      candidate.platformRef ?? null,
      status,
      candidate.guestName,
      candidate.guestEmail ?? null,
      candidate.requestedDate,
      candidate.startTime,
      candidate.endTime,
      duration,
      candidate.guestCount ?? null,
      candidate.totalPrice ?? null,
      candidate.currency ?? 'GBP',
      candidate.notes ?? null,
      candidate.confidence,
      msg.r2Key,
      now,
      now,
    )
    .run();

  // 7. Insert audit events
  await insertEvent(env, id, 'RECEIVED', null, {
    source: 'email',
    platform: msg.platform,
    messageId: msg.messageId,
  });

  await insertEvent(env, id, 'PARSED', null, {
    confidence: candidate.confidence,
    status,
    fields_extracted: Object.keys(candidate).filter(
      (k) => candidate[k as keyof BookingCandidate] != null,
    ),
  });

  // Broadcast new booking to connected clients
  try {
    await env.API_WORKER.fetch(new Request('https://internal/api/internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'BOOKING_CREATED', booking_id: id, timestamp: now }),
    }));
  } catch { /* broadcast failure is non-critical */ }

  console.log(`Created ${status} booking ${id} from ${msg.platform} (confidence: ${candidate.confidence})`);
}

async function insertEvent(
  env: Env,
  bookingId: string,
  eventType: string,
  actorId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO booking_events (id, booking_id, event_type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(generateId(), bookingId, eventType, actorId, JSON.stringify(payload), nowISO())
    .run();
}
