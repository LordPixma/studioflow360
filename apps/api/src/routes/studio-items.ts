import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateStudioItemSchema, UpdateStudioItemSchema, StudioItemListQuerySchema, generateId, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type StudioItemsEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const studioItems = new Hono<StudioItemsEnv>();

// GET /api/studio-items - List with filters
studioItems.get('/', async (c) => {
  const query = StudioItemListQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.category) { conditions.push('si.category = ?'); params.push(query.category); }
  if (query.status) { conditions.push('si.status = ?'); params.push(query.status); }
  if (query.priority) { conditions.push('si.priority = ?'); params.push(query.priority); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (query.page - 1) * query.per_page;

  const [countResult, results] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM studio_items si ${where}`)
      .bind(...params).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT si.*, sc.display_name as creator_name, sa.display_name as assignee_name
       FROM studio_items si
       LEFT JOIN staff_users sc ON si.created_by = sc.id
       LEFT JOIN staff_users sa ON si.assigned_to = sa.id
       ${where}
       ORDER BY
         CASE si.status WHEN 'overdue' THEN 0 WHEN 'pending' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
         CASE si.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         si.due_date ASC
       LIMIT ? OFFSET ?`,
    ).bind(...params, query.per_page, offset).all(),
  ]);

  return c.json({
    success: true,
    data: results.results,
    pagination: {
      page: query.page,
      per_page: query.per_page,
      total: countResult?.total ?? 0,
      total_pages: Math.ceil((countResult?.total ?? 0) / query.per_page),
    },
  });
});

// GET /api/studio-items/summary - Counts by category and status
studioItems.get('/summary', async (c) => {
  const [byCategory, byStatus] = await Promise.all([
    c.env.DB.prepare(
      `SELECT category, COUNT(*) as count FROM studio_items WHERE status != 'cancelled' GROUP BY category`,
    ).all(),
    c.env.DB.prepare(
      `SELECT status, COUNT(*) as count FROM studio_items GROUP BY status`,
    ).all(),
  ]);

  return c.json({
    success: true,
    data: { by_category: byCategory.results, by_status: byStatus.results },
  });
});

// POST /api/studio-items - Create
studioItems.post('/', zValidator('json', CreateStudioItemSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();

  await c.env.DB.prepare(
    `INSERT INTO studio_items (id, category, title, description, status, priority, due_date, cost, currency, vendor, recurrence, notes, created_by, assigned_to, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GBP', ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, data.category, data.title, data.description ?? null,
    data.status ?? 'pending', data.priority ?? 'medium',
    data.due_date ?? null, data.cost ?? null,
    data.vendor ?? null, data.recurrence ?? 'none', data.notes ?? null,
    staff.id, data.assigned_to ?? null, now, now,
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// GET /api/studio-items/:id - Detail
studioItems.get('/:id', async (c) => {
  const id = c.req.param('id');
  const item = await c.env.DB.prepare(
    `SELECT si.*, sc.display_name as creator_name, sa.display_name as assignee_name
     FROM studio_items si
     LEFT JOIN staff_users sc ON si.created_by = sc.id
     LEFT JOIN staff_users sa ON si.assigned_to = sa.id
     WHERE si.id = ?`,
  ).bind(id).first();

  if (!item) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }, 404);
  }
  return c.json({ success: true, data: item });
});

// PATCH /api/studio-items/:id - Update
studioItems.patch('/:id', zValidator('json', UpdateStudioItemSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');

  const existing = await c.env.DB.prepare('SELECT id FROM studio_items WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }, 404);
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      updates.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (data.status === 'completed') {
    updates.push('completed_at = ?');
    params.push(nowISO());
  }

  updates.push('updated_at = ?');
  params.push(nowISO());
  params.push(id);

  await c.env.DB.prepare(`UPDATE studio_items SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params).run();

  return c.json({ success: true, data: { id } });
});

// DELETE /api/studio-items/:id - Soft delete
studioItems.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const now = nowISO();
  await c.env.DB.prepare(
    `UPDATE studio_items SET status = 'cancelled', updated_at = ? WHERE id = ?`,
  ).bind(now, id).run();
  return c.json({ success: true, data: { id } });
});

export default studioItems;
