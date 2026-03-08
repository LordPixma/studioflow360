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

/** Strip HTML tags to plain text, preserving whitespace structure */
function htmlToPlainText(html: string): string {
  return html
    // Replace <br>, <p>, <div>, <tr>, <li> with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<(p|div|tr|li|h[1-6])[^>]*>/gi, '\n')
    // Replace <td> and <th> with tab for table structure
    .replace(/<\/?(td|th)[^>]*>/gi, '\t')
    // Decode common entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&pound;/gi, '£')
    .replace(/&#163;/gi, '£')
    // Strip remaining HTML tags
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    // Collapse excessive whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Try to extract booking data using regex patterns before AI */
function regexFallbackExtraction(text: string, platform: Platform): Partial<BookingCandidate> | null {
  const result: Partial<BookingCandidate> = { platform };

  // Date patterns: "13 Mar 2026", "13/03/2026", "2026-03-13", "Friday 13 March 2026"
  const datePatterns = [
    /(\d{4})-(\d{2})-(\d{2})/, // ISO
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, // DD/MM/YYYY
    /(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i, // 13 Mar 2026
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i, // Fri, 13 Mar 2026
  ];

  const monthMap: Record<string, string> = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
    apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', august: '08', sep: '09', september: '09', oct: '10', october: '10',
    nov: '11', november: '11', dec: '12', december: '12',
  };

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      if (pattern === datePatterns[0]) {
        result.requestedDate = `${match[1]}-${match[2]}-${match[3]}`;
      } else if (pattern === datePatterns[1]) {
        const d = match[1]!.padStart(2, '0');
        const m = match[2]!.padStart(2, '0');
        result.requestedDate = `${match[3]}-${m}-${d}`;
      } else {
        const d = match[1]!.padStart(2, '0');
        const m = monthMap[match[2]!.toLowerCase().slice(0, 3)] ?? '01';
        result.requestedDate = `${match[3]}-${m}-${d}`;
      }
      break;
    }
  }

  // Time patterns: "12:00 - 13:00", "12:00 to 13:00", "at 12:00 - 13:00"
  const timeMatch = text.match(/(\d{1,2}:\d{2})\s*[-–—to]+\s*(\d{1,2}:\d{2})/i);
  if (timeMatch) {
    result.startTime = timeMatch[1]!.padStart(5, '0');
    result.endTime = timeMatch[2]!.padStart(5, '0');
  }

  // Guest count: "Guests: 5", "5 guests", "Number of guests: 5"
  const guestMatch = text.match(/(?:guests?|attendees?|pax|people)\s*[:=]?\s*(\d+)/i)
    || text.match(/(\d+)\s+(?:guests?|attendees?|pax|people)/i);
  if (guestMatch) {
    result.guestCount = parseInt(guestMatch[1]!, 10);
  }

  // Price: "£250", "Total: £250.00", "Price: 250 GBP"
  const priceMatch = text.match(/[£$€]\s*(\d+(?:[.,]\d{2})?)/i)
    || text.match(/(?:price|total|cost|amount)\s*[:=]?\s*[£$€]?\s*(\d+(?:[.,]\d{2})?)/i);
  if (priceMatch) {
    result.totalPrice = parseFloat(priceMatch[1]!.replace(',', ''));
  }

  // Guest name patterns: "Name: John Smith", "Booked by: John Smith"
  const nameMatch = text.match(/(?:(?:guest|client|customer|booked by|contact|name)\s*[:=]\s*)([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i);
  if (nameMatch) {
    result.guestName = nameMatch[1]!.trim();
  }

  // Email
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    result.guestEmail = emailMatch[1]!;
  }

  // Location/room hint
  const locationMatch = text.match(/(?:location|venue|studio|room|space)\s*[:=]\s*([^\n]+)/i);
  if (locationMatch) {
    result.roomHint = locationMatch[1]!.trim();
  }

  // Only return if we found at least date and time
  if (result.requestedDate && result.startTime && result.endTime) {
    return result;
  }

  return null;
}

function buildExtractionPrompt(platform: Platform, emailText: string): string {
  const platformHints: Record<Platform, string> = {
    giggster:
      'Giggster emails contain booking reference numbers, dates, time slots, guest details, and pricing. Look for structured data fields.',
    peerspace:
      'Peerspace emails include pricing breakdowns, guest profiles, booking dates, times, and space details.',
    scouty:
      'Scouty emails have structured booking data with reference numbers in the subject. Extract dates, times, and location details.',
    tagvenue:
      'TagVenue emails are enquiry-style with booking dates, times, guest counts, and venue/location details. May include pricing.',
    direct:
      'This email is from an unknown or unrecognized sender but has been classified as a booking-related email. Carefully scan ALL text for any booking details: dates, times, guest names, guest counts, locations, pricing, and reference numbers. Be thorough — the data may be in any format.',
  };

  return `You are a booking data extraction system for a studio/venue management platform.
Extract ALL booking information from the email text below.

Platform context: ${platformHints[platform]}

Return ONLY a valid JSON object with these fields (use null for fields you cannot find):
{
  "platform": "${platform}",
  "platformRef": "booking reference number or ID if found, else null",
  "guestName": "full name of the person making the booking",
  "guestEmail": "their email address if visible, else null",
  "requestedDate": "MUST be in YYYY-MM-DD format (e.g. 2026-03-13 for 13th March 2026)",
  "startTime": "MUST be in HH:MM 24-hour format (e.g. 12:00)",
  "endTime": "MUST be in HH:MM 24-hour format (e.g. 13:00)",
  "durationHours": null,
  "roomHint": "any venue, room, studio, or space name mentioned",
  "guestCount": number or null,
  "totalPrice": number or null,
  "currency": "GBP",
  "notes": "any special requests, location details, or additional context",
  "confidence": 0.0 to 1.0 based on how many fields you successfully extracted
}

IMPORTANT RULES:
- Dates like "Fri, 13 Mar 2026" should become "2026-03-13"
- Times like "12:00 - 13:00" should map to startTime "12:00" and endTime "13:00"
- If you see "Guests: 5" then guestCount is 5
- Set confidence above 0.7 if you found date + time + at least one other field
- Set confidence below 0.5 if you could not find date or time

EMAIL TEXT:
${emailText}`;
}

async function parseEmailBody(rawEmail: string): Promise<{ html: string; text: string }> {
  const parser = new PostalMime();
  const parsed = await parser.parse(rawEmail);

  const html = parsed.html || '';
  const text = parsed.text || (html ? htmlToPlainText(html) : '');

  return { html, text };
}

async function extractBookingWithAI(
  env: Env,
  platform: Platform,
  emailText: string,
): Promise<BookingCandidate | null> {
  // Truncate to ~4000 chars to avoid overwhelming the model
  const truncated = emailText.slice(0, 4000);
  const prompt = buildExtractionPrompt(platform, truncated);

  // Model name may update — cast to satisfy type checker
  const response = await (env.AI as { run(model: string, input: unknown): Promise<unknown> }).run('@cf/meta/llama-3.1-70b-instruct', {
    messages: [
      {
        role: 'system',
        content: 'You are a precise data extraction assistant for a studio booking system. Return ONLY valid JSON with no markdown formatting, no explanations, no code blocks — just the raw JSON object.',
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
    // Coerce null strings to actual nulls
    for (const key of Object.keys(parsed)) {
      if (parsed[key] === 'null' || parsed[key] === 'N/A' || parsed[key] === 'n/a' || parsed[key] === '') {
        parsed[key] = null;
      }
    }
    // Fix common AI mistakes: remove optional fields that are null so Zod doesn't reject them
    if (parsed.guestEmail === null) delete parsed.guestEmail;
    if (parsed.platformRef === null) delete parsed.platformRef;
    if (parsed.durationHours === null) delete parsed.durationHours;
    if (parsed.roomHint === null) delete parsed.roomHint;
    if (parsed.guestCount === null) delete parsed.guestCount;
    if (parsed.totalPrice === null) delete parsed.totalPrice;
    if (parsed.notes === null) delete parsed.notes;
    // Ensure numeric types
    if (typeof parsed.guestCount === 'string') parsed.guestCount = parseInt(parsed.guestCount, 10) || undefined;
    if (typeof parsed.totalPrice === 'string') parsed.totalPrice = parseFloat(parsed.totalPrice) || undefined;
    if (typeof parsed.confidence === 'string') parsed.confidence = parseFloat(parsed.confidence) || 0;

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

  // 2. Parse MIME to extract body — get both HTML and plain text
  const { html, text: emailText } = await parseEmailBody(rawEmail);
  if (!emailText && !html) {
    throw new Error('Empty email body after parsing');
  }

  // Use plain text for AI (HTML confuses LLMs), fall back to stripping HTML
  const textForAI = emailText || htmlToPlainText(html);

  // 3. Try regex fallback first for structured data
  const regexResult = regexFallbackExtraction(textForAI, msg.platform);
  if (regexResult) {
    console.log(`Regex pre-extraction found: date=${regexResult.requestedDate}, time=${regexResult.startTime}-${regexResult.endTime}, guests=${regexResult.guestCount}`);
  }

  // 4. Extract booking fields with Workers AI (using plain text, not HTML)
  let candidate = await extractBookingWithAI(env, msg.platform, textForAI);

  // 5. If AI failed but regex found data, build a candidate from regex
  if (!candidate && regexResult && regexResult.requestedDate && regexResult.startTime && regexResult.endTime) {
    console.log('AI extraction failed, using regex fallback');
    candidate = {
      platform: msg.platform,
      guestName: regexResult.guestName ?? 'Unknown (extracted from email)',
      requestedDate: regexResult.requestedDate,
      startTime: regexResult.startTime,
      endTime: regexResult.endTime,
      guestCount: regexResult.guestCount,
      totalPrice: regexResult.totalPrice,
      guestEmail: regexResult.guestEmail,
      roomHint: regexResult.roomHint,
      currency: 'GBP',
      notes: regexResult.roomHint ? `Location: ${regexResult.roomHint}` : undefined,
      confidence: 0.4, // Lower confidence for regex-only extraction
    };
  }

  // 6. If AI succeeded but missed fields that regex found, merge them
  if (candidate && regexResult) {
    if (!candidate.guestCount && regexResult.guestCount) candidate = { ...candidate, guestCount: regexResult.guestCount };
    if (!candidate.totalPrice && regexResult.totalPrice) candidate = { ...candidate, totalPrice: regexResult.totalPrice };
    if (!candidate.guestEmail && regexResult.guestEmail) candidate = { ...candidate, guestEmail: regexResult.guestEmail };
    if (!candidate.roomHint && regexResult.roomHint) candidate = { ...candidate, roomHint: regexResult.roomHint };
  }

  if (!candidate) {
    // Both AI and regex extraction failed — create a NEEDS_REVIEW booking with minimal data
    const id = generateId();
    const now = nowISO();

    await env.DB.prepare(
      `INSERT INTO bookings (id, platform, status, guest_name, booking_date, start_time, end_time,
       ai_confidence, raw_email_r2_key, notes, created_at, updated_at)
       VALUES (?, ?, 'NEEDS_REVIEW', 'Unknown (AI extraction failed)', '1970-01-01', '00:00', '00:00',
       0.0, ?, ?, ?, ?)`,
    )
      .bind(id, msg.platform, msg.r2Key, `Auto-extraction failed. Please review the original email and manually update this booking.`, now, now)
      .run();

    await insertEvent(env, id, 'RECEIVED', null, { source: 'email', messageId: msg.messageId });
    await insertEvent(env, id, 'PARSED', null, { ai_failed: true, platform: msg.platform, email_text_length: textForAI.length });

    try {
      await env.API_WORKER.fetch(new Request('https://internal/api/internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({ type: 'BOOKING_CREATED', booking_id: id, timestamp: now }),
      }));
    } catch { /* broadcast failure is non-critical */ }

    console.log(`Created NEEDS_REVIEW booking ${id} — AI + regex extraction both failed`);
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
