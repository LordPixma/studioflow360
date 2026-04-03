import { sha256, generateId } from '@studioflow360/shared';
import type { Platform } from '@studioflow360/shared';
import type { Env, PlatformRule, GraphMessage } from './types.js';
import { checkBackoff, getAccessToken, fetchNewEmails, updatePollCursor } from './graph-client.js';

type EmailCategory = 'booking' | 'update' | 'marketing' | 'informational' | 'unknown';

interface ClassificationResult {
  category: EmailCategory;
  confidence: number;
}

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

/**
 * AI email classifier — returns a category and confidence score.
 * Used for ALL emails (known platform senders AND unknown senders).
 */
async function classifyEmail(env: Env, subject: string, bodySnippet: string): Promise<ClassificationResult> {
  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        {
          role: 'system',
          content: `You classify emails for a studio/venue booking management system.
Reply with ONLY one word from these categories, followed by a confidence score 0-100:
BOOKING - New booking inquiry, reservation confirmation, booking modification, or cancellation with rebooking
UPDATE - Status update on an existing booking (cancellation notice, date change, amendment, booking reminder)
MARKETING - Promotional content, newsletters, platform tips, feature announcements, discount offers
INFORMATIONAL - Account notices, receipts, payout summaries, policy changes, platform terms, security alerts

Format: CATEGORY SCORE
Example: BOOKING 85`,
        },
        {
          role: 'user',
          content: `Subject: ${subject}\n\nBody excerpt: ${bodySnippet}`,
        },
      ],
      max_tokens: 10,
    });

    const answer = (response as { response?: string }).response?.trim().toUpperCase() ?? '';
    const match = answer.match(/^(BOOKING|UPDATE|MARKETING|INFORMATIONAL)\s*(\d+)?/);
    if (match) {
      return {
        category: match[1]!.toLowerCase() as EmailCategory,
        confidence: match[2] ? parseInt(match[2], 10) / 100 : 0.7,
      };
    }
    // Fallback: legacy YES/NO format compatibility
    if (answer.startsWith('YES')) return { category: 'booking', confidence: 0.6 };
    if (answer.startsWith('NO')) return { category: 'unknown', confidence: 0.5 };
    return { category: 'unknown', confidence: 0.3 };
  } catch (err) {
    console.error('AI classification failed:', err);
    return { category: 'unknown', confidence: 0 };
  }
}

/** Log the classification result to D1 for non-booking emails */
async function logClassification(
  env: Env,
  r2Key: string,
  platform: string | null,
  senderDomain: string,
  subject: string,
  classification: ClassificationResult,
  messageId: string,
  receivedAt: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO email_classifications (id, r2_key, platform, sender_domain, subject, category, ai_confidence, message_id, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).bind(
      generateId(),
      r2Key,
      platform,
      senderDomain,
      subject.slice(0, 500),
      classification.category,
      classification.confidence,
      messageId,
      receivedAt,
    ).run();
  } catch {
    // Non-critical — don't fail the email processing
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
    let classified = 0;
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
      const knownPlatform: Platform | null = platformRules.get(senderDomain) ?? null;

      // Classify ALL emails with AI (known and unknown senders)
      const bodySnippet = (msg.body.content ?? '').replace(/<[^>]*>/g, '').slice(0, 500);
      const classification = await classifyEmail(env, msg.subject, bodySnippet);

      // Archive the email to R2 regardless of classification
      const syntheticMime = buildSyntheticMime(msg);
      const date = msg.receivedDateTime.split('T')[0];
      const archivePlatform = knownPlatform ?? (classification.category === 'booking' ? 'direct' : 'non-booking');
      const r2Key = `emails/${archivePlatform}/${date}/${fingerprint}.eml`;

      await env.EMAIL_ARCHIVE.put(r2Key, syntheticMime, {
        customMetadata: {
          from: msg.from.emailAddress.address,
          messageId,
          senderDomain,
          platform: knownPlatform ?? 'unknown',
          category: classification.category,
          receivedAt: msg.receivedDateTime,
          source: 'graph-monitor',
        },
      });

      // Mark as seen
      await env.EMAIL_DEDUP.put(fingerprint, classification.category, { expirationTtl: 7 * 24 * 60 * 60 });

      // Decision: only enqueue booking emails for parsing
      if (classification.category === 'booking') {
        const platform: Platform = knownPlatform ?? 'direct';

        await env.BOOKING_PARSE_QUEUE.send({
          r2Key,
          platform,
          senderDomain,
          receivedAt: msg.receivedDateTime,
          messageId,
        });

        // Also log as booking classification
        await logClassification(env, r2Key, platform, senderDomain, msg.subject, classification, messageId, msg.receivedDateTime);
        enqueued++;
        console.log(`Enqueued booking email (confidence: ${classification.confidence})`);
      } else if (classification.category === 'update') {
        // Updates are logged but not queued — could be booking amendments
        // TODO: In future, match to existing booking and update status
        await logClassification(env, r2Key, knownPlatform, senderDomain, msg.subject, classification, messageId, msg.receivedDateTime);
        classified++;
        console.log(`Classified as update (confidence: ${classification.confidence})`);
      } else {
        // Marketing / informational / unknown — log and skip
        await logClassification(env, r2Key, knownPlatform, senderDomain, msg.subject, classification, messageId, msg.receivedDateTime);
        classified++;
        console.log(`Classified as ${classification.category} — skipped`);
      }

      lastReceivedAt = msg.receivedDateTime;
    }

    // 5. Update poll cursor
    if (lastReceivedAt) {
      await updatePollCursor(env, lastReceivedAt);
    }

    console.log(`Done: ${enqueued} enqueued, ${classified} classified, ${skipped} deduped`);
  },
} satisfies ExportedHandler<Env>;
