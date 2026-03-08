import { sha256 } from '@studioflow360/shared';
import type { Platform } from '@studioflow360/shared';
import type { Env, PlatformRule, GraphMessage } from './types.js';
import { checkBackoff, getAccessToken, fetchNewEmails, updatePollCursor } from './graph-client.js';

function extractSenderDomain(emailAddress: string): string {
  const match = emailAddress.match(/@([a-zA-Z0-9.-]+)/);
  return match?.[1]?.toLowerCase() ?? '';
}

async function loadPlatformRules(env: Env): Promise<Map<string, Platform>> {
  const results = await env.DB.prepare(
    'SELECT platform, sender_domain FROM platform_email_rules WHERE active = 1',
  ).all<PlatformRule>();

  const map = new Map<string, Platform>();
  for (const rule of results.results) {
    map.set(rule.sender_domain.toLowerCase(), rule.platform);
  }
  return map;
}

async function isBookingEmail(env: Env, subject: string, bodySnippet: string): Promise<boolean> {
  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        {
          role: 'system',
          content: 'You classify emails. Reply with ONLY "YES" or "NO". No other text.',
        },
        {
          role: 'user',
          content: `Is this email a studio/venue booking inquiry, reservation confirmation, or booking-related message?\n\nSubject: ${subject}\n\nBody excerpt: ${bodySnippet}`,
        },
      ],
      max_tokens: 5,
    });

    const answer = (response as { response?: string }).response?.trim().toUpperCase() ?? '';
    return answer.startsWith('YES');
  } catch (err) {
    console.error('AI pre-filter failed:', err);
    return false;
  }
}

function buildSyntheticMime(msg: GraphMessage): string {
  const from = msg.from.emailAddress.address;
  const subject = msg.subject ?? '(no subject)';
  const date = msg.receivedDateTime;
  const messageId = msg.internetMessageId ?? msg.id;
  const body = msg.body.content;

  return [
    `From: ${from}`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    `Message-ID: ${messageId}`,
    `Content-Type: text/html; charset=utf-8`,
    `MIME-Version: 1.0`,
    '',
    body,
  ].join('\r\n');
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // 1. Check backoff
    if (await checkBackoff(env)) return;

    let token: string;
    try {
      token = await getAccessToken(env);
    } catch (err) {
      console.error('Failed to get access token:', err);
      return;
    }

    // 2. Fetch new emails
    let emails: GraphMessage[];
    try {
      emails = await fetchNewEmails(env, token);
    } catch (err) {
      console.error('Failed to fetch emails:', err);
      return;
    }

    if (emails.length === 0) {
      console.log('No new emails');
      return;
    }

    console.log(`Fetched ${emails.length} emails from Graph API`);

    // 3. Load platform rules once
    const platformRules = await loadPlatformRules(env);

    let enqueued = 0;
    let skipped = 0;
    let lastReceivedAt: string | null = null;

    // 4. Process each email
    for (const msg of emails) {
      const messageId = msg.internetMessageId ?? msg.id;
      const fingerprint = await sha256(messageId);

      // Dedup check
      const existing = await env.EMAIL_DEDUP.get(fingerprint);
      if (existing) {
        skipped++;
        continue;
      }

      const senderDomain = extractSenderDomain(msg.from.emailAddress.address);
      let platform: Platform | null = platformRules.get(senderDomain) ?? null;

      // AI pre-filter for unknown senders
      if (!platform) {
        const bodySnippet = (msg.body.content ?? '').replace(/<[^>]*>/g, '').slice(0, 500);
        const isBooking = await isBookingEmail(env, msg.subject, bodySnippet);
        if (isBooking) {
          platform = 'direct';
          console.log(`AI classified email from ${senderDomain} as booking`);
        } else {
          console.log(`Skipping non-booking email from ${senderDomain}: "${msg.subject}"`);
          // Still mark as seen to avoid re-processing
          await env.EMAIL_DEDUP.put(fingerprint, 'skip', { expirationTtl: 7 * 24 * 60 * 60 });
          skipped++;
          continue;
        }
      }

      // Build synthetic MIME and store in R2
      const syntheticMime = buildSyntheticMime(msg);
      const date = msg.receivedDateTime.split('T')[0];
      const r2Key = `emails/${platform}/${date}/${fingerprint}.eml`;

      await env.EMAIL_ARCHIVE.put(r2Key, syntheticMime, {
        customMetadata: {
          from: msg.from.emailAddress.address,
          messageId,
          senderDomain,
          platform,
          receivedAt: msg.receivedDateTime,
          source: 'graph-monitor',
        },
      });

      // Set dedup key
      await env.EMAIL_DEDUP.put(fingerprint, '1', { expirationTtl: 7 * 24 * 60 * 60 });

      // Enqueue for AI parsing
      await env.BOOKING_PARSE_QUEUE.send({
        r2Key,
        platform,
        senderDomain,
        receivedAt: msg.receivedDateTime,
        messageId,
      });

      enqueued++;
      lastReceivedAt = msg.receivedDateTime;
    }

    // 5. Update poll cursor
    if (lastReceivedAt) {
      await updatePollCursor(env, lastReceivedAt);
    }

    console.log(`Done: ${enqueued} enqueued, ${skipped} skipped`);
  },
} satisfies ExportedHandler<Env>;
