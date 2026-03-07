import { createMiddleware } from 'hono/factory';
import type { Env, StaffContext } from '../types.js';

type AuthEnv = {
  Bindings: Env;
  Variables: {
    staff: StaffContext;
  };
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  // Dev auth: bypass with header (local dev) or secret-protected header (staging/production testing)
  const devEmail = c.req.header('X-Dev-Email');
  if (devEmail) {
    // In local dev, allow freely; in production, require DEV_AUTH_SECRET
    const isLocalDev = c.env.ENVIRONMENT === 'development';
    const devSecret = c.req.header('X-Dev-Secret');
    const expectedSecret = (c.env as Record<string, unknown>).DEV_AUTH_SECRET as string | undefined;

    if (isLocalDev || (expectedSecret && devSecret === expectedSecret)) {
      const staff = await c.env.DB.prepare(
        'SELECT id, access_email, display_name, role FROM staff_users WHERE access_email = ? AND active = 1',
      )
        .bind(devEmail)
        .first<{ id: string; access_email: string; display_name: string; role: string }>();

      if (staff) {
        c.set('staff', {
          id: staff.id,
          email: staff.access_email,
          displayName: staff.display_name,
          role: staff.role as StaffContext['role'],
        });
        return next();
      }
    }
  }

  // Validate Cloudflare Access JWT
  const cfAccessJwt = c.req.header('Cf-Access-Jwt-Assertion');
  if (!cfAccessJwt) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing authentication' } }, 401);
  }

  try {
    // Decode JWT payload (Cloudflare Access validates signature at the edge)
    const parts = cfAccessJwt.split('.');
    if (parts.length !== 3 || !parts[1]) {
      throw new Error('Invalid JWT format');
    }
    const payload = JSON.parse(atob(parts[1])) as { email?: string; exp?: number };

    if (!payload.email) {
      throw new Error('No email in JWT');
    }

    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return c.json({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Token expired' } }, 401);
    }

    // Look up staff user
    const staff = await c.env.DB.prepare(
      'SELECT id, access_email, display_name, role FROM staff_users WHERE access_email = ? AND active = 1',
    )
      .bind(payload.email)
      .first<{ id: string; access_email: string; display_name: string; role: string }>();

    if (!staff) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'User not registered as staff' } },
        403,
      );
    }

    c.set('staff', {
      id: staff.id,
      email: staff.access_email,
      displayName: staff.display_name,
      role: staff.role as StaffContext['role'],
    });

    return next();
  } catch (e) {
    return c.json(
      { success: false, error: { code: 'AUTH_ERROR', message: 'Authentication failed' } },
      401,
    );
  }
});

export const requireRole = (...roles: StaffContext['role'][]) => {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const staff = c.get('staff');
    if (!roles.includes(staff.role)) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
        403,
      );
    }
    return next();
  });
};
