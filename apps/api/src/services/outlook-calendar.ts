/**
 * Outlook Calendar integration via Microsoft Graph API.
 * Creates/updates/deletes calendar events when booking status changes.
 */

import type { Env } from '../types.js';

const TOKEN_CACHE_KEY = 'graph:token';

interface GraphTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CalendarBooking {
  id: string;
  guest_name: string;
  guest_email?: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  guest_count?: number | null;
  total_price?: number | null;
  currency?: string | null;
  notes?: string | null;
  platform?: string | null;
  platform_ref?: string | null;
  room_name?: string | null;
}

/**
 * Get a Microsoft Graph API access token, with KV caching.
 * Mirrors the pattern in workers/email-monitor/src/graph-client.ts.
 */
export async function getGraphToken(env: Env): Promise<string> {
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
    throw new Error(`Graph token fetch failed (${res.status}): ${errorText}`);
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

/**
 * Build the event body HTML with booking details.
 */
function buildEventBody(booking: CalendarBooking): string {
  const lines: string[] = [
    `<b>Booking ID:</b> ${booking.id}`,
    `<b>Guest:</b> ${booking.guest_name}`,
  ];
  if (booking.guest_email) lines.push(`<b>Email:</b> ${booking.guest_email}`);
  if (booking.guest_count) lines.push(`<b>Guest Count:</b> ${booking.guest_count}`);
  if (booking.total_price != null) {
    lines.push(`<b>Price:</b> ${booking.currency ?? 'GBP'} ${booking.total_price}`);
  }
  if (booking.platform) lines.push(`<b>Platform:</b> ${booking.platform}`);
  if (booking.platform_ref) lines.push(`<b>Platform Ref:</b> ${booking.platform_ref}`);
  if (booking.notes) lines.push(`<b>Notes:</b> ${booking.notes}`);

  return lines.join('<br/>');
}

/**
 * Build the event subject line: [Platform] Guest Name - Room Name
 */
function buildSubject(booking: CalendarBooking): string {
  const platform = booking.platform ? `[${booking.platform.charAt(0).toUpperCase() + booking.platform.slice(1)}]` : '[Direct]';
  const room = booking.room_name ?? 'Unassigned';
  return `${platform} ${booking.guest_name} - ${room}`;
}

/**
 * Build a Graph API calendar event payload.
 */
function buildEventPayload(booking: CalendarBooking) {
  return {
    subject: buildSubject(booking),
    body: {
      contentType: 'HTML',
      content: buildEventBody(booking),
    },
    start: {
      dateTime: `${booking.booking_date}T${booking.start_time}:00`,
      timeZone: 'Europe/London',
    },
    end: {
      dateTime: `${booking.booking_date}T${booking.end_time}:00`,
      timeZone: 'Europe/London',
    },
    location: {
      displayName: booking.room_name ?? 'Unassigned',
    },
  };
}

/**
 * Create a calendar event in Outlook for an approved booking.
 * Returns the Graph event ID.
 */
export async function createCalendarEvent(env: Env, booking: CalendarBooking): Promise<string> {
  const token = await getGraphToken(env);
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.AZURE_MAILBOX_USER_ID)}/events`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildEventPayload(booking)),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Graph create event failed (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Delete a calendar event from Outlook.
 */
export async function deleteCalendarEvent(env: Env, eventId: string): Promise<void> {
  const token = await getGraphToken(env);
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.AZURE_MAILBOX_USER_ID)}/events/${encodeURIComponent(eventId)}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // 204 No Content = success, 404 = already deleted (both acceptable)
  if (!res.ok && res.status !== 404) {
    const errorText = await res.text();
    throw new Error(`Graph delete event failed (${res.status}): ${errorText}`);
  }
}

/**
 * Update an existing calendar event in Outlook.
 */
export async function updateCalendarEvent(env: Env, eventId: string, booking: CalendarBooking): Promise<void> {
  const token = await getGraphToken(env);
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.AZURE_MAILBOX_USER_ID)}/events/${encodeURIComponent(eventId)}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildEventPayload(booking)),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Graph update event failed (${res.status}): ${errorText}`);
  }
}
