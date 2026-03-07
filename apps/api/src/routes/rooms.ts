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
    'INSERT INTO rooms (id, name, description, capacity, hourly_rate, color_hex, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
  )
    .bind(id, data.name, data.description ?? null, data.capacity, data.hourly_rate, data.color_hex, now)
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

export default rooms;
