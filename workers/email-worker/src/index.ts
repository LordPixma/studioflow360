import { sha256 } from '@studioflow360/shared';
import type { Platform } from '@studioflow360/shared';

interface Env {
  DB: D1Database;
  EMAIL_DEDUP: KVNamespace;
  EMAIL_ARCHIVE: R2Bucket;
  BOOKING_PARSE_QUEUE: Queue;
}

interface PlatformRule {
  platform: Platform;
  sender_domain: string;
}

async function identifyPlatform(senderDomain: string, env: Env): Promise<Platform | null> {
  const result = await env.DB.prepare(
    'SELECT platform FROM platform_email_rules WHERE sender_domain = ? AND active = 1 LIMIT 1',
  )
    .bind(senderDomain)
    .first<PlatformRule>();

  return result?.platform ?? null;
}

function extractSenderDomain(from: string): string {
  const match = from.match(/@([a-zA-Z0-9.-]+)/);
  return match?.[1]?.toLowerCase() ?? '';
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const messageId = message.headers.get('Message-ID') ?? `${Date.now()}-${Math.random()}`;
    const from = message.from;
    const receivedAt = new Date().toISOString();

    try {
      // 1. Extract sender domain and identify platform
      const senderDomain = extractSenderDomain(from);
      const platform = await identifyPlatform(senderDomain, env);

      if (!platform) {
        console.log(`Unknown sender domain: ${senderDomain} from ${from}. Archiving but not parsing.`);
      }

      // 2. Deduplication check via KV
      const fingerprint = await sha256(messageId);
      const existing = await env.EMAIL_DEDUP.get(fingerprint);

      if (existing) {
        console.log(`Duplicate email detected: ${messageId}`);
        return;
      }

      // Set dedup key with 7-day TTL
      await env.EMAIL_DEDUP.put(fingerprint, '1', { expirationTtl: 7 * 24 * 60 * 60 });

      // 3. Read the raw email body
      const rawEmail = await new Response(message.raw).text();

      // 4. Archive to R2
      const date = new Date().toISOString().split('T')[0];
      const r2Key = `emails/${platform ?? 'unknown'}/${date}/${fingerprint}.eml`;

      await env.EMAIL_ARCHIVE.put(r2Key, rawEmail, {
        customMetadata: {
          from,
          messageId,
          senderDomain,
          platform: platform ?? 'unknown',
          receivedAt,
        },
      });

      // 5. Enqueue for AI parsing (only if platform is recognized)
      if (platform) {
        await env.BOOKING_PARSE_QUEUE.send({
          r2Key,
          platform,
          senderDomain,
          receivedAt,
          messageId,
        });
        console.log(`Enqueued email from ${platform} for parsing: ${r2Key}`);
      }
    } catch (error) {
      console.error(`Error processing email from ${from}:`, error);

      // Attempt to archive even on error
      try {
        const rawEmail = await new Response(message.raw).text();
        const fingerprint = await sha256(messageId);
        const r2Key = `emails/error/${new Date().toISOString().split('T')[0]}/${fingerprint}.eml`;
        await env.EMAIL_ARCHIVE.put(r2Key, rawEmail, {
          customMetadata: { from, messageId, error: String(error) },
        });
      } catch (archiveError) {
        console.error('Failed to archive errored email:', archiveError);
      }
    }
  },
} satisfies ExportedHandler<Env>;
