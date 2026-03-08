import type { Env, GraphTokenResponse, GraphMessage, GraphMessagesResponse } from './types.js';

const TOKEN_CACHE_KEY = 'graph:token';
const POLL_CURSOR_KEY = 'graph:poll_cursor';
const BACKOFF_KEY = 'graph:backoff_until';

export async function checkBackoff(env: Env): Promise<boolean> {
  const backoffUntil = await env.GRAPH_STATE.get(BACKOFF_KEY);
  if (backoffUntil && Date.now() < Number(backoffUntil)) {
    console.log(`Backing off until ${new Date(Number(backoffUntil)).toISOString()}`);
    return true;
  }
  return false;
}

export async function getAccessToken(env: Env): Promise<string> {
  // Check KV cache first
  const cached = await env.GRAPH_STATE.get(TOKEN_CACHE_KEY, { type: 'json' }) as {
    token: string;
    expiresAt: number;
  } | null;

  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token;
  }

  // Fetch new token via client credentials flow
  const tokenUrl = `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.AZURE_CLIENT_ID,
    client_secret: env.AZURE_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Token fetch failed (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as GraphTokenResponse;

  // Cache token in KV (expires_in is in seconds, buffer 5 minutes)
  await env.GRAPH_STATE.put(
    TOKEN_CACHE_KEY,
    JSON.stringify({
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    }),
    { expirationTtl: data.expires_in },
  );

  return data.access_token;
}

export async function fetchNewEmails(env: Env, token: string): Promise<GraphMessage[]> {
  const lastCursor = await env.GRAPH_STATE.get(POLL_CURSOR_KEY);

  // Default to 10 minutes ago if no cursor exists
  const since = lastCursor ?? new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const allMessages: GraphMessage[] = [];
  let url: string | null = buildMessagesUrl(env.AZURE_MAILBOX_USER_ID, since);

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Prefer': 'outlook.body-content-type="html"',
      },
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? '120');
      await env.GRAPH_STATE.put(BACKOFF_KEY, String(Date.now() + retryAfter * 1000), {
        expirationTtl: retryAfter + 60,
      });
      console.log(`Graph API throttled. Backing off for ${retryAfter}s`);
      break;
    }

    if (res.status === 401) {
      // Token might be stale despite cache — clear it
      await env.GRAPH_STATE.delete(TOKEN_CACHE_KEY);
      throw new Error('Graph API returned 401 — token cleared, will retry next run');
    }

    if (!res.ok) {
      throw new Error(`Graph API error (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as GraphMessagesResponse;
    allMessages.push(...data.value);

    url = data['@odata.nextLink'] ?? null;
  }

  return allMessages;
}

export async function updatePollCursor(env: Env, cursor: string): Promise<void> {
  await env.GRAPH_STATE.put(POLL_CURSOR_KEY, cursor);
}

function buildMessagesUrl(userId: string, since: string): string {
  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${since}`,
    $select: 'id,internetMessageId,subject,from,receivedDateTime,body',
    $orderby: 'receivedDateTime asc',
    $top: '25',
  });
  return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/messages?${params}`;
}
