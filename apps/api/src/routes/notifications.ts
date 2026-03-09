import { Hono } from 'hono';
import type { Env, StaffContext } from '../types.js';

type NotifEnv = { Bindings: Env; Variables: { staff: StaffContext } };

const app = new Hono<NotifEnv>();

// GET / — list notifications for current user
app.get('/', async (c) => {
  const staff = c.get('staff');
  const { unread_only, page: pg, per_page: pp } = c.req.query();
  const page = Math.max(1, Number(pg) || 1);
  const perPage = Math.min(100, Math.max(1, Number(pp) || 50));

  const conditions: string[] = ['n.recipient_id = ?'];
  const params: unknown[] = [staff.id];

  if (unread_only === '1') { conditions.push('n.is_read = 0'); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM notifications n ${where}`).bind(...params).first<{ total: number }>();
  const total = countRow?.total ?? 0;

  const results = await c.env.DB.prepare(`
    SELECT * FROM notifications n
    ${where}
    ORDER BY n.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, perPage, (page - 1) * perPage).all();

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  });
});

// GET /unread-count — badge count for sidebar
app.get('/unread-count', async (c) => {
  const staff = c.get('staff');
  const row = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE recipient_id = ? AND is_read = 0',
  ).bind(staff.id).first<{ count: number }>();
  return c.json({ success: true, data: { count: row?.count ?? 0 } });
});

// PATCH /:id/read — mark single notification as read
app.patch('/:id/read', async (c) => {
  const staff = c.get('staff');
  const id = c.req.param('id');
  await c.env.DB.prepare(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?',
  ).bind(id, staff.id).run();
  return c.json({ success: true });
});

// POST /mark-all-read — mark all notifications as read
app.post('/mark-all-read', async (c) => {
  const staff = c.get('staff');
  await c.env.DB.prepare(
    'UPDATE notifications SET is_read = 1 WHERE recipient_id = ? AND is_read = 0',
  ).bind(staff.id).run();
  return c.json({ success: true });
});

// DELETE /:id — delete single notification
app.delete('/:id', async (c) => {
  const staff = c.get('staff');
  await c.env.DB.prepare(
    'DELETE FROM notifications WHERE id = ? AND recipient_id = ?',
  ).bind(c.req.param('id'), staff.id).run();
  return c.json({ success: true });
});

// POST /clear — delete all read notifications
app.post('/clear', async (c) => {
  const staff = c.get('staff');
  await c.env.DB.prepare(
    'DELETE FROM notifications WHERE recipient_id = ? AND is_read = 1',
  ).bind(staff.id).run();
  return c.json({ success: true });
});

// --- Activity Log (read-only for staff, system writes) ---

// GET /activity — system-wide activity feed
app.get('/activity', async (c) => {
  const { entity_type, entity_id, actor_id, page: pg, per_page: pp } = c.req.query();
  const page = Math.max(1, Number(pg) || 1);
  const perPage = Math.min(100, Math.max(1, Number(pp) || 50));

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (entity_type) { conditions.push('a.entity_type = ?'); params.push(entity_type); }
  if (entity_id) { conditions.push('a.entity_id = ?'); params.push(entity_id); }
  if (actor_id) { conditions.push('a.actor_id = ?'); params.push(actor_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM activity_log a ${where}`).bind(...params).first<{ total: number }>();
  const total = countRow?.total ?? 0;

  const results = await c.env.DB.prepare(`
    SELECT a.*, s.display_name as actor_name
    FROM activity_log a
    LEFT JOIN staff_users s ON a.actor_id = s.id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, perPage, (page - 1) * perPage).all();

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  });
});

export default app;
