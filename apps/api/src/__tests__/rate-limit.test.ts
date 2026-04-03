import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { rateLimit } from '../middleware/rate-limit.js';

function createMockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    _store: store,
  };
}

function createApp(limit: number, windowSeconds: number) {
  const kv = createMockKV();
  const app = new Hono();
  app.use('*', rateLimit({ limit, windowSeconds, prefix: 'test' }));
  app.get('/test', (c) => c.json({ ok: true }));
  return { app, kv };
}

describe('rateLimit middleware', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('allows requests under the limit', async () => {
    const { app, kv } = createApp(5, 60);
    const res = await app.request('/test', { headers: { 'CF-Connecting-IP': '1.2.3.4' } }, { RATE_LIMIT: kv });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns rate limit headers', async () => {
    const { app, kv } = createApp(10, 60);
    const res = await app.request('/test', { headers: { 'CF-Connecting-IP': '1.2.3.4' } }, { RATE_LIMIT: kv });
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });

  it('blocks requests over the limit', async () => {
    const { app, kv } = createApp(2, 60);
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % 60);
    kv._store.set(`test:1.2.3.4:${windowStart}`, '2');

    const res = await app.request('/test', { headers: { 'CF-Connecting-IP': '1.2.3.4' } }, { RATE_LIMIT: kv });
    expect(res.status).toBe(429);
    const body = await res.json() as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('tracks different IPs separately', async () => {
    const { app, kv } = createApp(1, 60);
    const res1 = await app.request('/test', { headers: { 'CF-Connecting-IP': '1.1.1.1' } }, { RATE_LIMIT: kv });
    const res2 = await app.request('/test', { headers: { 'CF-Connecting-IP': '2.2.2.2' } }, { RATE_LIMIT: kv });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });
});
