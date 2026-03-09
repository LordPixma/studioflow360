import { Hono } from 'hono';
import { CreateTaskSchema, UpdateTaskSchema, CreateTaskCommentSchema, ToggleChecklistItemSchema } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type TaskEnv = { Bindings: Env; Variables: { staff: StaffContext } };

const app = new Hono<TaskEnv>();

// Helper: generate task number
async function nextTaskNumber(db: D1Database): Promise<string> {
  const now = new Date();
  const prefix = `TSK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const row = await db.prepare(
    `SELECT COUNT(*) as c FROM tasks WHERE task_number LIKE ?`,
  ).bind(`${prefix}%`).first<{ c: number }>();
  const seq = (row?.c ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

// GET / — list tasks
app.get('/', async (c) => {
  const { status, category, priority, assigned_to, room_id, due_from, due_to, search, page: pg, per_page: pp } = c.req.query();
  const page = Math.max(1, Number(pg) || 1);
  const perPage = Math.min(100, Math.max(1, Number(pp) || 25));

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) { conditions.push('t.status = ?'); params.push(status); }
  if (category) { conditions.push('t.category = ?'); params.push(category); }
  if (priority) { conditions.push('t.priority = ?'); params.push(priority); }
  if (assigned_to) { conditions.push('t.assigned_to = ?'); params.push(assigned_to); }
  if (room_id) { conditions.push('t.room_id = ?'); params.push(room_id); }
  if (due_from) { conditions.push('t.due_date >= ?'); params.push(due_from); }
  if (due_to) { conditions.push('t.due_date <= ?'); params.push(due_to); }
  if (search) { conditions.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM tasks t ${where}`).bind(...params).first<{ total: number }>();
  const total = countRow?.total ?? 0;

  const results = await c.env.DB.prepare(`
    SELECT t.*, s.display_name as assigned_name, r.name as room_name
    FROM tasks t
    LEFT JOIN staff_users s ON t.assigned_to = s.id
    LEFT JOIN rooms r ON t.room_id = r.id
    ${where}
    ORDER BY
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date ASC,
      t.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, perPage, (page - 1) * perPage).all();

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  });
});

// GET /summary — task statistics
app.get('/summary', async (c) => {
  const stats = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
      SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) as on_hold_count,
      SUM(CASE WHEN priority = 'urgent' AND status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) as urgent_count,
      SUM(CASE WHEN due_date < date('now') AND status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) as overdue_count
    FROM tasks
  `).first();
  return c.json({ success: true, data: stats });
});

// GET /:id — task detail with comments and checklist
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const task = await c.env.DB.prepare(`
    SELECT t.*, s.display_name as assigned_name, r.name as room_name, cb.display_name as completed_by_name
    FROM tasks t
    LEFT JOIN staff_users s ON t.assigned_to = s.id
    LEFT JOIN rooms r ON t.room_id = r.id
    LEFT JOIN staff_users cb ON t.completed_by = cb.id
    WHERE t.id = ?
  `).bind(id).first();
  if (!task) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);

  const comments = await c.env.DB.prepare(`
    SELECT tc.*, s.display_name as author_name
    FROM task_comments tc
    LEFT JOIN staff_users s ON tc.created_by = s.id
    WHERE tc.task_id = ?
    ORDER BY tc.created_at ASC
  `).bind(id).all();

  const checklist = await c.env.DB.prepare(`
    SELECT * FROM task_checklist_items WHERE task_id = ? ORDER BY sort_order ASC
  `).bind(id).all();

  return c.json({ success: true, data: { ...task, comments: comments.results, checklist: checklist.results } });
});

// POST / — create task
app.post('/', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);

  const data = parsed.data;
  const id = crypto.randomUUID();
  const taskNumber = await nextTaskNumber(c.env.DB);

  await c.env.DB.prepare(`
    INSERT INTO tasks (id, task_number, title, description, category, priority, due_date, due_time, room_id, asset_id, booking_id, assigned_to, is_recurring, recurrence_rule, recurrence_end_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, taskNumber, data.title, data.description ?? null, data.category ?? 'general', data.priority ?? 'medium',
    data.due_date ?? null, data.due_time ?? null, data.room_id ?? null, data.asset_id ?? null, data.booking_id ?? null,
    data.assigned_to ?? null, data.is_recurring ?? 0, data.recurrence_rule ?? null, data.recurrence_end_date ?? null, staff.id,
  ).run();

  // Create checklist items if provided
  if (data.checklist) {
    let sortOrder = 0;
    for (const item of data.checklist) {
      const clId = crypto.randomUUID();
      await c.env.DB.prepare(
        'INSERT INTO task_checklist_items (id, task_id, label, sort_order) VALUES (?, ?, ?, ?)',
      ).bind(clId, id, item.label, sortOrder++).run();
    }
  }

  return c.json({ success: true, data: { id, task_number: taskNumber } }, 201);
});

// PATCH /:id — update task
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = UpdateTaskSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);

  const existing = await c.env.DB.prepare('SELECT id, status FROM tasks WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);

  const data = parsed.data;
  const sets: string[] = ['updated_at = datetime(\'now\')'];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    sets.push(`${key} = ?`);
    params.push(value ?? null);
  }

  // If status changed to completed, set completed_at/by
  if (data.status === 'completed' && existing.status !== 'completed') {
    sets.push('completed_at = datetime(\'now\')', 'completed_by = ?');
    params.push(staff.id);
  }

  params.push(id);
  await c.env.DB.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  return c.json({ success: true, data: { id } });
});

// DELETE /:id — delete task
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);

  await c.env.DB.prepare('DELETE FROM task_checklist_items WHERE task_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM task_comments WHERE task_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});

// POST /:id/comments — add comment
app.post('/:id/comments', async (c) => {
  const taskId = c.req.param('id');
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreateTaskCommentSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM tasks WHERE id = ?').bind(taskId).first();
  if (!existing) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO task_comments (id, task_id, content, created_by) VALUES (?, ?, ?, ?)',
  ).bind(id, taskId, parsed.data.content, staff.id).run();

  return c.json({ success: true, data: { id } }, 201);
});

// PATCH /:id/checklist/:itemId — toggle checklist item
app.patch('/:id/checklist/:itemId', async (c) => {
  const { id, itemId } = c.req.param();
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = ToggleChecklistItemSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);

  const item = await c.env.DB.prepare('SELECT id FROM task_checklist_items WHERE id = ? AND task_id = ?').bind(itemId, id).first();
  if (!item) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Checklist item not found' } }, 404);

  const isChecked = parsed.data.is_checked;
  await c.env.DB.prepare(
    `UPDATE task_checklist_items SET is_checked = ?, checked_at = ?, checked_by = ? WHERE id = ?`,
  ).bind(isChecked, isChecked ? new Date().toISOString() : null, isChecked ? staff.id : null, itemId).run();

  return c.json({ success: true });
});

export default app;
