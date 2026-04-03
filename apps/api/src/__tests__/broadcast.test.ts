import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

// Simplified test for the broadcast endpoint protection
// We test the logic directly rather than importing the full app

describe('broadcast endpoint protection', () => {
  function createBroadcastApp(env: { INTERNAL_SECRET?: string } = {}) {
    const mockHub = {
      fetch: vi.fn(async (_req: Request) => new Response('ok')),
    };

    const app = new Hono();
    app.post('/api/internal/broadcast', async (c) => {
      const url = new URL(c.req.url);
      const isServiceBinding = url.hostname === 'internal' || url.hostname === 'fake-host';
      const internalSecret = env.INTERNAL_SECRET;
      const providedSecret = c.req.header('X-Internal-Secret');

      if (!isServiceBinding && !(internalSecret && providedSecret === internalSecret)) {
        return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Internal only' } }, 403);
      }

      const body = await c.req.text();
      await mockHub.fetch(new Request('https://hub/broadcast', { method: 'POST', body }));
      return c.json({ success: true });
    });

    return { app, mockHub };
  }

  it('blocks external requests without secret', async () => {
    const { app } = createBroadcastApp();
    const res = await app.request('/api/internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'test' }),
    });
    expect(res.status).toBe(403);
  });

  it('allows requests with valid INTERNAL_SECRET', async () => {
    const { app } = createBroadcastApp({ INTERNAL_SECRET: 'mysecret' });
    const res = await app.request('/api/internal/broadcast', {
      method: 'POST',
      headers: { 'X-Internal-Secret': 'mysecret' },
      body: JSON.stringify({ type: 'test' }),
    });
    expect(res.status).toBe(200);
  });

  it('blocks requests with wrong secret', async () => {
    const { app } = createBroadcastApp({ INTERNAL_SECRET: 'mysecret' });
    const res = await app.request('/api/internal/broadcast', {
      method: 'POST',
      headers: { 'X-Internal-Secret': 'wrong' },
      body: JSON.stringify({ type: 'test' }),
    });
    expect(res.status).toBe(403);
  });

  it('allows service binding requests (hostname=internal)', async () => {
    const { app, mockHub } = createBroadcastApp();
    const res = await app.request('https://internal/api/internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type: 'BOOKING_CREATED' }),
    });
    expect(res.status).toBe(200);
    expect(mockHub.fetch).toHaveBeenCalled();
  });
});
