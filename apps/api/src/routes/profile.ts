import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { UpdateProfileSchema, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type ProfileEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const profile = new Hono<ProfileEnv>();

// GET /api/me/profile - Get own full profile
profile.get('/', async (c) => {
  const staff = c.get('staff');
  const row = await c.env.DB.prepare(
    'SELECT id, access_email, display_name, role, phone_number, bio, avatar_r2_key, job_title, active, created_at, updated_at FROM staff_users WHERE id = ?',
  )
    .bind(staff.id)
    .first();

  if (!row) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Profile not found' } }, 404);
  }

  // Generate avatar URL if avatar exists
  const data = row as Record<string, unknown>;
  if (data.avatar_r2_key) {
    data.avatar_url = `/api/me/profile/avatar`;
  }

  return c.json({ success: true, data });
});

// PATCH /api/me/profile - Update own profile
profile.patch('/', zValidator('json', UpdateProfileSchema), async (c) => {
  const staff = c.get('staff');
  const body = c.req.valid('json');
  const now = nowISO();

  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (body.display_name !== undefined) {
    updates.push('display_name = ?');
    params.push(body.display_name);
  }
  if (body.phone_number !== undefined) {
    updates.push('phone_number = ?');
    params.push(body.phone_number);
  }
  if (body.bio !== undefined) {
    updates.push('bio = ?');
    params.push(body.bio);
  }
  if (body.job_title !== undefined) {
    updates.push('job_title = ?');
    params.push(body.job_title);
  }

  if (updates.length === 1) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'No fields to update' } }, 400);
  }

  params.push(staff.id);
  await c.env.DB.prepare(`UPDATE staff_users SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return c.json({ success: true, data: { id: staff.id } });
});

// POST /api/me/profile/avatar - Upload profile picture
profile.post('/avatar', async (c) => {
  const staff = c.get('staff');

  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('image/')) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Content-Type must be an image' } }, 400);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength > 2 * 1024 * 1024) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Avatar must be under 2MB' } }, 400);
  }

  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const r2Key = `avatars/${staff.id}.${ext}`;

  await c.env.AVATARS.put(r2Key, body, {
    httpMetadata: { contentType },
  });

  const now = nowISO();
  await c.env.DB.prepare('UPDATE staff_users SET avatar_r2_key = ?, updated_at = ? WHERE id = ?')
    .bind(r2Key, now, staff.id)
    .run();

  return c.json({ success: true, data: { avatar_url: '/api/me/profile/avatar' } });
});

// GET /api/me/profile/avatar - Serve avatar image
profile.get('/avatar', async (c) => {
  const staff = c.get('staff');

  const row = await c.env.DB.prepare('SELECT avatar_r2_key FROM staff_users WHERE id = ?')
    .bind(staff.id)
    .first<{ avatar_r2_key: string | null }>();

  if (!row?.avatar_r2_key) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'No avatar' } }, 404);
  }

  const object = await c.env.AVATARS.get(row.avatar_r2_key);
  if (!object) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Avatar file not found' } }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=3600');

  return new Response(object.body, { headers });
});

// DELETE /api/me/profile/avatar - Remove avatar
profile.delete('/avatar', async (c) => {
  const staff = c.get('staff');

  const row = await c.env.DB.prepare('SELECT avatar_r2_key FROM staff_users WHERE id = ?')
    .bind(staff.id)
    .first<{ avatar_r2_key: string | null }>();

  if (row?.avatar_r2_key) {
    await c.env.AVATARS.delete(row.avatar_r2_key);
  }

  const now = nowISO();
  await c.env.DB.prepare('UPDATE staff_users SET avatar_r2_key = NULL, updated_at = ? WHERE id = ?')
    .bind(now, staff.id)
    .run();

  return c.json({ success: true });
});

// GET /api/staff/:id/avatar - Serve any staff member's avatar (public within authenticated routes)
profile.get('/staff-avatar/:id', async (c) => {
  const id = c.req.param('id');

  const row = await c.env.DB.prepare('SELECT avatar_r2_key FROM staff_users WHERE id = ?')
    .bind(id)
    .first<{ avatar_r2_key: string | null }>();

  if (!row?.avatar_r2_key) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'No avatar' } }, 404);
  }

  const object = await c.env.AVATARS.get(row.avatar_r2_key);
  if (!object) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Avatar file not found' } }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=3600');

  return new Response(object.body, { headers });
});

export default profile;
