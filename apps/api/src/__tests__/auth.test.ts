import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, requireRole, requirePermission } from '../middleware/auth.js';

function createMockDB(staffRow: Record<string, unknown> | null = null) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => staffRow),
      })),
    })),
  };
}

function makeJWT(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const sig = btoa('fake-signature');
  return `${header}.${body}.${sig}`;
}

const staffRow = {
  id: 'staff-1',
  access_email: 'test@example.com',
  display_name: 'Test User',
  role: 'admin',
};

function createAuthApp() {
  const app = new Hono();
  app.use('/test', authMiddleware as never);
  app.get('/test', (c) => {
    const staff = c.get('staff' as never) as { role: string };
    return c.json({ ok: true, role: staff.role });
  });
  return app;
}

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: createMockDB(overrides._staffRow !== undefined ? overrides._staffRow as Record<string, unknown> | null : staffRow),
    ENVIRONMENT: 'production',
    ...overrides,
  };
}

describe('authMiddleware', () => {
  it('returns 401 when no auth headers are present', async () => {
    const app = createAuthApp();
    const res = await app.request('/test', {}, makeEnv());
    expect(res.status).toBe(401);
  });

  it('authenticates with valid JWT', async () => {
    const app = createAuthApp();
    const jwt = makeJWT({ email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    const res = await app.request('/test', {
      headers: { 'Cf-Access-Jwt-Assertion': jwt },
    }, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; role: string };
    expect(body.role).toBe('admin');
  });

  it('returns 401 for expired JWT', async () => {
    const app = createAuthApp();
    const jwt = makeJWT({ email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 3600 });
    const res = await app.request('/test', {
      headers: { 'Cf-Access-Jwt-Assertion': jwt },
    }, makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 403 when email not in staff_users', async () => {
    const app = createAuthApp();
    const jwt = makeJWT({ email: 'nobody@example.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    const res = await app.request('/test', {
      headers: { 'Cf-Access-Jwt-Assertion': jwt },
    }, makeEnv({ _staffRow: null }));
    expect(res.status).toBe(403);
  });

  it('blocks dev auth bypass in production', async () => {
    const app = createAuthApp();
    const res = await app.request('/test', {
      headers: { 'X-Dev-Email': 'test@example.com' },
    }, makeEnv({ ENVIRONMENT: 'production' }));
    expect(res.status).toBe(401);
  });

  it('allows dev auth in development mode', async () => {
    const app = createAuthApp();
    const res = await app.request('/test', {
      headers: { 'X-Dev-Email': 'test@example.com' },
    }, makeEnv({ ENVIRONMENT: 'development' }));
    expect(res.status).toBe(200);
  });

  it('requires DEV_AUTH_SECRET in staging', async () => {
    const app = createAuthApp();
    const env = makeEnv({ ENVIRONMENT: 'staging', DEV_AUTH_SECRET: 'secret123' });

    // Without secret — falls through to JWT check → 401
    const res1 = await app.request('/test', {
      headers: { 'X-Dev-Email': 'test@example.com' },
    }, env);
    expect(res1.status).toBe(401);

    // With correct secret — passes
    const res2 = await app.request('/test', {
      headers: { 'X-Dev-Email': 'test@example.com', 'X-Dev-Secret': 'secret123' },
    }, env);
    expect(res2.status).toBe(200);
  });

  it('returns 401 for malformed JWT', async () => {
    const app = createAuthApp();
    const res = await app.request('/test', {
      headers: { 'Cf-Access-Jwt-Assertion': 'not-valid' },
    }, makeEnv());
    expect(res.status).toBe(401);
  });
});

describe('requireRole', () => {
  function createRoleApp(...roles: string[]) {
    const app = new Hono();
    app.use('/test', authMiddleware as never);
    app.use('/test', requireRole(...(roles as ('admin' | 'manager' | 'staff')[])) as never);
    app.get('/test', (c) => c.json({ ok: true }));
    return app;
  }

  it('allows matching role', async () => {
    const app = createRoleApp('admin');
    const jwt = makeJWT({ email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    const res = await app.request('/test', { headers: { 'Cf-Access-Jwt-Assertion': jwt } }, makeEnv());
    expect(res.status).toBe(200);
  });

  it('blocks non-matching role', async () => {
    const app = createRoleApp('manager');
    const jwt = makeJWT({ email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    const res = await app.request('/test', { headers: { 'Cf-Access-Jwt-Assertion': jwt } }, makeEnv());
    expect(res.status).toBe(403);
  });
});

describe('requirePermission', () => {
  it('allows admin to access all permissions', async () => {
    const app = new Hono();
    app.use('/test', authMiddleware as never);
    app.use('/test', requirePermission('bookings.view') as never);
    app.get('/test', (c) => c.json({ ok: true }));

    const jwt = makeJWT({ email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    const res = await app.request('/test', { headers: { 'Cf-Access-Jwt-Assertion': jwt } }, makeEnv());
    expect(res.status).toBe(200);
  });

  it('blocks staff from admin-only permissions', async () => {
    const app = new Hono();
    app.use('/test', authMiddleware as never);
    app.use('/test', requirePermission('staff.manage') as never);
    app.get('/test', (c) => c.json({ ok: true }));

    const jwt = makeJWT({ email: 'test@example.com', exp: Math.floor(Date.now() / 1000) + 3600 });
    const res = await app.request('/test', { headers: { 'Cf-Access-Jwt-Assertion': jwt } }, makeEnv({ _staffRow: { ...staffRow, role: 'staff' } }));
    expect(res.status).toBe(403);
  });
});
