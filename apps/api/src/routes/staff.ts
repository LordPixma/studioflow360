import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { STAFF_ROLES, nowISO, generateId } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type StaffEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const staff = new Hono<StaffEnv>();

// GET /api/staff - List staff users (admin only)
staff.get('/', async (c) => {
  const results = await c.env.DB.prepare(
    'SELECT id, access_email, display_name, role, active, created_at FROM staff_users ORDER BY display_name',
  ).all();

  return c.json({ success: true, data: results.results });
});

// POST /api/staff - Add staff user
staff.post(
  '/',
  zValidator('json', z.object({
    access_email: z.string().email(),
    display_name: z.string().min(1).max(200),
    role: z.enum(STAFF_ROLES),
  })),
  async (c) => {
    const data = c.req.valid('json');
    const existing = await c.env.DB.prepare(
      'SELECT id FROM staff_users WHERE LOWER(access_email) = LOWER(?)',
    ).bind(data.access_email).first();
    if (existing) {
      return c.json({ success: false, error: { code: 'CONFLICT', message: 'Email already registered' } }, 409);
    }
    const id = generateId();
    const now = nowISO();
    await c.env.DB.prepare(
      'INSERT INTO staff_users (id, access_email, display_name, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
    ).bind(id, data.access_email, data.display_name, data.role, now).run();
    return c.json({ success: true, data: { id } }, 201);
  },
);

// PATCH /api/staff/:id - Update role or active status
staff.patch(
  '/:id',
  zValidator('json', z.object({
    role: z.enum(STAFF_ROLES).optional(),
    active: z.number().int().min(0).max(1).optional(),
    display_name: z.string().min(1).max(200).optional(),
  })),
  async (c) => {
    const id = c.req.param('id');
    const currentUser = c.get('staff');
    const data = c.req.valid('json');

    // Prevent admin from demoting themselves
    if (id === currentUser.id && data.role && data.role !== 'admin') {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot change your own role' } }, 403);
    }
    if (id === currentUser.id && data.active === 0) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot deactivate yourself' } }, 403);
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    if (data.role !== undefined) { updates.push('role = ?'); params.push(data.role); }
    if (data.active !== undefined) { updates.push('active = ?'); params.push(data.active); }
    if (data.display_name !== undefined) { updates.push('display_name = ?'); params.push(data.display_name); }

    if (updates.length === 0) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'No fields to update' } }, 400);
    }
    params.push(id);
    await c.env.DB.prepare(`UPDATE staff_users SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
    return c.json({ success: true, data: { id } });
  },
);

// DELETE /api/staff/:id - Remove staff user
staff.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const currentUser = c.get('staff');
  if (id === currentUser.id) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete yourself' } }, 403);
  }
  await c.env.DB.prepare('DELETE FROM staff_users WHERE id = ?').bind(id).run();
  return c.json({ success: true, data: { id } });
});

export default staff;
