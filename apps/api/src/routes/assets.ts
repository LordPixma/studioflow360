import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateAssetSchema, UpdateAssetSchema, generateId, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type AssetsEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const assets = new Hono<AssetsEnv>();

// GET /api/assets - List with filters
assets.get('/', async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.category) { conditions.push('a.category = ?'); params.push(query.category); }
  if (query.status) { conditions.push('a.status = ?'); params.push(query.status); }
  if (query.room_id) { conditions.push('a.room_id = ?'); params.push(query.room_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.per_page) || 50));
  const offset = (page - 1) * perPage;

  const [countResult, results] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM assets a ${where}`).bind(...params).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT a.*, r.name as room_name, r.color_hex as room_color, sc.display_name as creator_name, sa.display_name as assignee_name
       FROM assets a
       LEFT JOIN rooms r ON a.room_id = r.id
       LEFT JOIN staff_users sc ON a.created_by = sc.id
       LEFT JOIN staff_users sa ON a.assigned_to = sa.id
       ${where}
       ORDER BY a.name ASC
       LIMIT ? OFFSET ?`,
    ).bind(...params, perPage, offset).all(),
  ]);

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total: countResult?.total ?? 0, total_pages: Math.ceil((countResult?.total ?? 0) / perPage) },
  });
});

// GET /api/assets/summary
assets.get('/summary', async (c) => {
  const [byCategory, byStatus, totalValue, warrantyExpiring] = await Promise.all([
    c.env.DB.prepare(
      `SELECT category, COUNT(*) as count, SUM(current_value) as total_value FROM assets WHERE status != 'disposed' GROUP BY category`,
    ).all(),
    c.env.DB.prepare(
      `SELECT status, COUNT(*) as count FROM assets GROUP BY status`,
    ).all(),
    c.env.DB.prepare(
      `SELECT SUM(current_value) as total, SUM(purchase_price) as original FROM assets WHERE status IN ('active', 'maintenance')`,
    ).first(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM assets WHERE warranty_expiry IS NOT NULL AND warranty_expiry <= date('now', '+30 days') AND warranty_expiry >= date('now') AND status = 'active'`,
    ).first(),
  ]);

  return c.json({
    success: true,
    data: {
      by_category: byCategory.results,
      by_status: byStatus.results,
      total_value: totalValue,
      warranty_expiring_soon: warrantyExpiring?.count ?? 0,
    },
  });
});

// POST /api/assets
assets.post('/', zValidator('json', CreateAssetSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();

  await c.env.DB.prepare(
    `INSERT INTO assets (id, name, category, status, serial_number, model, manufacturer, purchase_date, purchase_price, current_value, currency, location, room_id, assigned_to, warranty_expiry, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, 'GBP', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, data.name, data.category,
    data.serial_number ?? null, data.model ?? null, data.manufacturer ?? null,
    data.purchase_date ?? null, data.purchase_price ?? null, data.current_value ?? data.purchase_price ?? null,
    data.location ?? null, data.room_id ?? null, data.assigned_to ?? null,
    data.warranty_expiry ?? null, data.notes ?? null, staff.id, now, now,
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// GET /api/assets/:id
assets.get('/:id', async (c) => {
  const id = c.req.param('id');
  const asset = await c.env.DB.prepare(
    `SELECT a.*, r.name as room_name, r.color_hex as room_color, sc.display_name as creator_name, sa.display_name as assignee_name
     FROM assets a
     LEFT JOIN rooms r ON a.room_id = r.id
     LEFT JOIN staff_users sc ON a.created_by = sc.id
     LEFT JOIN staff_users sa ON a.assigned_to = sa.id
     WHERE a.id = ?`,
  ).bind(id).first();

  if (!asset) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Asset not found' } }, 404);
  return c.json({ success: true, data: asset });
});

// PATCH /api/assets/:id
assets.patch('/:id', zValidator('json', UpdateAssetSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) { updates.push(`${key} = ?`); params.push(value); }
  }

  updates.push('updated_at = ?'); params.push(nowISO()); params.push(id);
  await c.env.DB.prepare(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

// DELETE /api/assets/:id (soft delete to disposed)
assets.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE assets SET status = 'disposed', updated_at = ? WHERE id = ?`).bind(nowISO(), id).run();
  return c.json({ success: true, data: { id } });
});

export default assets;
