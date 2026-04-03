import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateRoomSchema, UpdateRoomSchema, generateId, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type RoomEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const rooms = new Hono<RoomEnv>();

// GET /api/rooms
rooms.get('/', async (c) => {
  const results = await c.env.DB.prepare('SELECT * FROM rooms WHERE active = 1 ORDER BY name').all();
  return c.json({ success: true, data: results.results });
});

// POST /api/rooms (admin/manager only)
rooms.post('/', zValidator('json', CreateRoomSchema), async (c) => {
  const data = c.req.valid('json');
  const id = generateId();
  const now = nowISO();

  await c.env.DB.prepare(
    'INSERT INTO rooms (id, name, description, capacity, hourly_rate, evening_hourly_rate, evening_start_hour, color_hex, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
  )
    .bind(id, data.name, data.description ?? null, data.capacity, data.hourly_rate, data.evening_hourly_rate ?? null, data.evening_start_hour ?? 18, data.color_hex, now)
    .run();

  return c.json({ success: true, data: { id, ...data } }, 201);
});

// PATCH /api/rooms/:id (admin/manager only)
rooms.patch('/:id', zValidator('json', UpdateRoomSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const room = await c.env.DB.prepare('SELECT id FROM rooms WHERE id = ?').bind(id).first();
  if (!room) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } }, 404);
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (updates.length === 0) {
    return c.json({ success: true, data: { id } });
  }

  params.push(id);
  await c.env.DB.prepare(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return c.json({ success: true, data: { id } });
});

// POST /api/rooms/:id/image — Upload room image (admin/manager only)
rooms.post('/:id/image', async (c) => {
  const id = c.req.param('id');

  const room = await c.env.DB.prepare('SELECT id, image_r2_key FROM rooms WHERE id = ?')
    .bind(id).first<{ id: string; image_r2_key: string | null }>();
  if (!room) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } }, 404);
  }

  const contentType = c.req.header('content-type') ?? '';
  let imageData: ArrayBuffer;
  let ext = 'jpg';

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = formData.get('image') as File | null;
    if (!file) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'No image file provided' } }, 400);
    }
    // Validate file type
    if (!file.type.startsWith('image/')) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'File must be an image' } }, 400);
    }
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Image must be under 5MB' } }, 400);
    }
    imageData = await file.arrayBuffer();
    ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  } else {
    // Raw binary upload
    imageData = await c.req.arrayBuffer();
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
  }

  // Delete old image if exists
  if (room.image_r2_key) {
    try { await c.env.AVATARS.delete(room.image_r2_key); } catch { /* ignore */ }
  }

  // Store in R2 (reuse AVATARS bucket for simplicity)
  const r2Key = `rooms/${id}.${ext}`;
  await c.env.AVATARS.put(r2Key, imageData, {
    httpMetadata: { contentType: contentType.includes('multipart') ? `image/${ext}` : contentType },
  });

  // Update DB
  await c.env.DB.prepare('UPDATE rooms SET image_r2_key = ? WHERE id = ?')
    .bind(r2Key, id).run();

  return c.json({ success: true, data: { id, image_url: `/api/rooms/${id}/image` } });
});

// GET /api/rooms/:id/image — Serve room image (public)
rooms.get('/:id/image', async (c) => {
  const id = c.req.param('id');

  const room = await c.env.DB.prepare('SELECT image_r2_key FROM rooms WHERE id = ?')
    .bind(id).first<{ image_r2_key: string | null }>();
  if (!room?.image_r2_key) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'No image for this room' } }, 404);
  }

  const object = await c.env.AVATARS.get(room.image_r2_key);
  if (!object) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Image not found' } }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=86400');

  return new Response(object.body, { headers });
});

// DELETE /api/rooms/:id/image — Remove room image (admin/manager only)
rooms.delete('/:id/image', async (c) => {
  const id = c.req.param('id');

  const room = await c.env.DB.prepare('SELECT id, image_r2_key FROM rooms WHERE id = ?')
    .bind(id).first<{ id: string; image_r2_key: string | null }>();
  if (!room) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } }, 404);
  }

  if (room.image_r2_key) {
    try { await c.env.AVATARS.delete(room.image_r2_key); } catch { /* ignore */ }
    await c.env.DB.prepare('UPDATE rooms SET image_r2_key = NULL WHERE id = ?').bind(id).run();
  }

  return c.json({ success: true });
});

// DELETE /api/rooms/:id (admin/manager only) — soft delete
rooms.delete('/:id', async (c) => {
  const id = c.req.param('id');

  const room = await c.env.DB.prepare('SELECT id FROM rooms WHERE id = ?').bind(id).first();
  if (!room) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } }, 404);
  }

  // Check for active bookings
  const activeBookings = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM bookings WHERE room_id = ? AND status NOT IN ('REJECTED', 'CANCELLED')`,
  ).bind(id).first<{ count: number }>();

  if (activeBookings && activeBookings.count > 0) {
    return c.json({
      success: false,
      error: { code: 'HAS_BOOKINGS', message: `Room has ${activeBookings.count} active booking(s). Deactivate instead.` },
    }, 409);
  }

  await c.env.DB.prepare('DELETE FROM rooms WHERE id = ?').bind(id).run();
  return c.json({ success: true, data: { id } });
});

export default rooms;
