import { Hono } from 'hono';
import { nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type ClassEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const emailClassifications = new Hono<ClassEnv>();

// GET /api/email-classifications - List classified emails with optional category filter
emailClassifications.get('/', async (c) => {
  const category = c.req.query('category');
  const reviewed = c.req.query('reviewed');
  const page = parseInt(c.req.query('page') ?? '1', 10);
  const perPage = parseInt(c.req.query('per_page') ?? '25', 10);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (reviewed === '0' || reviewed === '1') {
    conditions.push('reviewed = ?');
    params.push(parseInt(reviewed, 10));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * perPage;

  const [countResult, results] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM email_classifications ${where}`)
      .bind(...params)
      .first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT * FROM email_classifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(...params, perPage, offset)
      .all(),
  ]);

  const total = countResult?.total ?? 0;

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  });
});

// GET /api/email-classifications/stats - Category breakdown
emailClassifications.get('/stats', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT category, COUNT(*) as count, SUM(CASE WHEN reviewed = 0 THEN 1 ELSE 0 END) as unreviewed
     FROM email_classifications GROUP BY category ORDER BY count DESC`,
  ).all();

  return c.json({ success: true, data: result.results });
});

// PATCH /api/email-classifications/:id/review - Mark an email as reviewed
emailClassifications.patch('/:id/review', async (c) => {
  const id = c.req.param('id');
  const staff = c.get('staff');
  const now = nowISO();

  const existing = await c.env.DB.prepare('SELECT id FROM email_classifications WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Classification not found' } }, 404);
  }

  await c.env.DB.prepare(
    'UPDATE email_classifications SET reviewed = 1, reviewed_by = ?, reviewed_at = ? WHERE id = ?',
  ).bind(staff.id, now, id).run();

  return c.json({ success: true });
});

// PATCH /api/email-classifications/:id/reclassify - Override the category
emailClassifications.patch('/:id/reclassify', async (c) => {
  const id = c.req.param('id');
  const staff = c.get('staff');
  const body = await c.req.json<{ category: string; notes?: string }>();

  const validCategories = ['booking', 'update', 'marketing', 'informational', 'unknown'];
  if (!validCategories.includes(body.category)) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid category' } }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM email_classifications WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Classification not found' } }, 404);
  }

  const now = nowISO();
  await c.env.DB.prepare(
    `UPDATE email_classifications SET category = ?, reviewed = 1, reviewed_by = ?, reviewed_at = ?, notes = ?
     WHERE id = ?`,
  ).bind(body.category, staff.id, now, body.notes ?? null, id).run();

  return c.json({ success: true });
});

export default emailClassifications;
