import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { UpdateStudioSettingsSchema, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type SettingsEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const settings = new Hono<SettingsEnv>();

// GET /api/settings/studio - Get studio settings
settings.get('/studio', async (c) => {
  let row = await c.env.DB.prepare('SELECT * FROM studio_settings WHERE id = ?').bind('default').first();
  if (!row) {
    // Auto-create default row
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO studio_settings (id, studio_name, studio_subtitle, studio_address) VALUES ('default', 'Aeras', 'Leeds Content Creation Studios', 'Leeds City Centre, UK')`,
    ).run();
    row = await c.env.DB.prepare('SELECT * FROM studio_settings WHERE id = ?').bind('default').first();
  }
  // Add logo URL if logo exists
  const data = row as Record<string, unknown>;
  if (data.logo_r2_key) {
    data.logo_url = '/api/settings/studio/logo';
  } else {
    data.logo_url = null;
  }
  return c.json({ success: true, data });
});

// PATCH /api/settings/studio - Update studio settings
settings.patch('/studio', zValidator('json', UpdateStudioSettingsSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');

  if (staff.role !== 'admin') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only admins can update studio settings' } }, 403);
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    updates.push(`${key} = ?`);
    params.push(value ?? null);
  }

  if (updates.length === 0) return c.json({ success: true, data: { id: 'default' } });

  updates.push('updated_at = ?', 'updated_by = ?');
  params.push(nowISO(), staff.id, 'default');

  await c.env.DB.prepare(`UPDATE studio_settings SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id: 'default' } });
});

// POST /api/settings/studio/logo - Upload studio logo
settings.post('/studio/logo', async (c) => {
  const staff = c.get('staff');
  if (staff.role !== 'admin') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only admins can update studio settings' } }, 403);
  }

  const formData = await c.req.formData();
  const file = formData.get('logo') as File | null;
  if (!file) return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'No file provided' } }, 400);

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'File must be PNG, JPEG, SVG, or WebP' } }, 400);
  }

  // Max 2MB
  if (file.size > 2 * 1024 * 1024) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'File must be under 2MB' } }, 400);
  }

  const ext = file.type.split('/')[1]?.replace('svg+xml', 'svg') ?? 'png';
  const r2Key = `studio/logo.${ext}`;

  // Delete old logo if exists
  const current = await c.env.DB.prepare('SELECT logo_r2_key FROM studio_settings WHERE id = ?').bind('default').first<{ logo_r2_key: string | null }>();
  if (current?.logo_r2_key) {
    await c.env.AVATARS.delete(current.logo_r2_key);
  }

  // Upload to R2
  const arrayBuffer = await file.arrayBuffer();
  await c.env.AVATARS.put(r2Key, arrayBuffer, {
    httpMetadata: { contentType: file.type },
  });

  // Update DB
  await c.env.DB.prepare(
    'UPDATE studio_settings SET logo_r2_key = ?, updated_at = ?, updated_by = ? WHERE id = ?',
  ).bind(r2Key, nowISO(), staff.id, 'default').run();

  return c.json({ success: true, data: { logo_url: '/api/settings/studio/logo' } });
});

// GET /api/settings/studio/logo - Serve studio logo
settings.get('/studio/logo', async (c) => {
  const row = await c.env.DB.prepare('SELECT logo_r2_key FROM studio_settings WHERE id = ?').bind('default').first<{ logo_r2_key: string | null }>();
  if (!row?.logo_r2_key) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'No logo' } }, 404);

  const object = await c.env.AVATARS.get(row.logo_r2_key);
  if (!object) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Logo not found in storage' } }, 404);

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'image/png');
  headers.set('Cache-Control', 'public, max-age=3600');
  return new Response(object.body, { headers });
});

// DELETE /api/settings/studio/logo - Remove studio logo
settings.delete('/studio/logo', async (c) => {
  const staff = c.get('staff');
  if (staff.role !== 'admin') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Only admins can update studio settings' } }, 403);
  }

  const row = await c.env.DB.prepare('SELECT logo_r2_key FROM studio_settings WHERE id = ?').bind('default').first<{ logo_r2_key: string | null }>();
  if (row?.logo_r2_key) {
    await c.env.AVATARS.delete(row.logo_r2_key);
  }

  await c.env.DB.prepare(
    'UPDATE studio_settings SET logo_r2_key = NULL, updated_at = ?, updated_by = ? WHERE id = ?',
  ).bind(nowISO(), staff.id, 'default').run();

  return c.json({ success: true });
});

export default settings;
