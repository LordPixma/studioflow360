import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateBudgetSchema, UpdateBudgetSchema, CreatePurchaseSchema, UpdatePurchaseSchema, generateId, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type FinanceEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const finance = new Hono<FinanceEnv>();

// ===== BUDGETS =====

// GET /api/finance/budgets
finance.get('/budgets', async (c) => {
  const results = await c.env.DB.prepare(
    `SELECT b.*, s.display_name as creator_name,
       (SELECT COALESCE(SUM(p.amount), 0) FROM purchases p WHERE p.budget_id = b.id AND p.status IN ('approved', 'paid')) as actual_spent
     FROM budgets b
     LEFT JOIN staff_users s ON b.created_by = s.id
     ORDER BY b.end_date DESC`,
  ).all();
  return c.json({ success: true, data: results.results });
});

// POST /api/finance/budgets
finance.post('/budgets', zValidator('json', CreateBudgetSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();
  await c.env.DB.prepare(
    `INSERT INTO budgets (id, name, category, amount, spent, period, start_date, end_date, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, data.name, data.category, data.amount, data.period, data.start_date, data.end_date, data.notes ?? null, staff.id, now, now).run();
  return c.json({ success: true, data: { id } }, 201);
});

// PATCH /api/finance/budgets/:id
finance.patch('/budgets/:id', zValidator('json', UpdateBudgetSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) { updates.push(`${key} = ?`); params.push(value); }
  }
  updates.push('updated_at = ?'); params.push(nowISO()); params.push(id);
  await c.env.DB.prepare(`UPDATE budgets SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

// DELETE /api/finance/budgets/:id
finance.delete('/budgets/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM budgets WHERE id = ?').bind(id).run();
  return c.json({ success: true, data: { id } });
});

// ===== PURCHASES =====

// GET /api/finance/purchases
finance.get('/purchases', async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.category) { conditions.push('p.category = ?'); params.push(query.category); }
  if (query.status) { conditions.push('p.status = ?'); params.push(query.status); }
  if (query.budget_id) { conditions.push('p.budget_id = ?'); params.push(query.budget_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.per_page) || 25));
  const offset = (page - 1) * perPage;

  const [countResult, results] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM purchases p ${where}`).bind(...params).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT p.*, sc.display_name as creator_name, sa.display_name as approver_name, b.name as budget_name
       FROM purchases p
       LEFT JOIN staff_users sc ON p.created_by = sc.id
       LEFT JOIN staff_users sa ON p.approved_by = sa.id
       LEFT JOIN budgets b ON p.budget_id = b.id
       ${where}
       ORDER BY p.purchase_date DESC
       LIMIT ? OFFSET ?`,
    ).bind(...params, perPage, offset).all(),
  ]);

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total: countResult?.total ?? 0, total_pages: Math.ceil((countResult?.total ?? 0) / perPage) },
  });
});

// POST /api/finance/purchases
finance.post('/purchases', zValidator('json', CreatePurchaseSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();
  await c.env.DB.prepare(
    `INSERT INTO purchases (id, budget_id, description, vendor, amount, currency, category, status, purchase_date, created_by, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'GBP', ?, 'pending', ?, ?, ?, ?, ?)`,
  ).bind(id, data.budget_id ?? null, data.description, data.vendor ?? null, data.amount, data.category, data.purchase_date, staff.id, data.notes ?? null, now, now).run();

  // Update budget spent amount if linked
  if (data.budget_id) {
    await c.env.DB.prepare(
      `UPDATE budgets SET spent = (SELECT COALESCE(SUM(amount), 0) FROM purchases WHERE budget_id = ? AND status IN ('approved', 'paid')), updated_at = ? WHERE id = ?`,
    ).bind(data.budget_id, now, data.budget_id).run();
  }

  return c.json({ success: true, data: { id } }, 201);
});

// PATCH /api/finance/purchases/:id
finance.patch('/purchases/:id', zValidator('json', UpdatePurchaseSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) { updates.push(`${key} = ?`); params.push(value); }
  }

  if (data.status === 'approved') {
    updates.push('approved_by = ?'); params.push(staff.id);
  }
  if (data.status === 'paid') {
    updates.push('paid_date = ?'); params.push(nowISO());
  }

  updates.push('updated_at = ?'); params.push(nowISO()); params.push(id);
  await c.env.DB.prepare(`UPDATE purchases SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

  // Update linked budget spent
  const purchase = await c.env.DB.prepare('SELECT budget_id FROM purchases WHERE id = ?').bind(id).first<{ budget_id: string | null }>();
  if (purchase?.budget_id) {
    const now = nowISO();
    await c.env.DB.prepare(
      `UPDATE budgets SET spent = (SELECT COALESCE(SUM(amount), 0) FROM purchases WHERE budget_id = ? AND status IN ('approved', 'paid')), updated_at = ? WHERE id = ?`,
    ).bind(purchase.budget_id, now, purchase.budget_id).run();
  }

  return c.json({ success: true, data: { id } });
});

// GET /api/finance/summary
finance.get('/summary', async (c) => {
  const [budgets, purchasesByCategory, purchasesByStatus, recentPurchases] = await Promise.all([
    c.env.DB.prepare(
      `SELECT b.*, (SELECT COALESCE(SUM(p.amount), 0) FROM purchases p WHERE p.budget_id = b.id AND p.status IN ('approved', 'paid')) as actual_spent
       FROM budgets b WHERE b.end_date >= date('now') ORDER BY b.end_date ASC`,
    ).all(),
    c.env.DB.prepare(
      `SELECT category, SUM(amount) as total, COUNT(*) as count FROM purchases WHERE status IN ('approved', 'paid') GROUP BY category`,
    ).all(),
    c.env.DB.prepare(
      `SELECT status, COUNT(*) as count, SUM(amount) as total FROM purchases GROUP BY status`,
    ).all(),
    c.env.DB.prepare(
      `SELECT SUM(CASE WHEN purchase_date >= date('now', '-30 days') THEN amount ELSE 0 END) as last_30_days,
              SUM(CASE WHEN purchase_date >= date('now', '-7 days') THEN amount ELSE 0 END) as last_7_days
       FROM purchases WHERE status IN ('approved', 'paid')`,
    ).first(),
  ]);

  return c.json({
    success: true,
    data: {
      active_budgets: budgets.results,
      spending_by_category: purchasesByCategory.results,
      purchases_by_status: purchasesByStatus.results,
      recent_spending: recentPurchases,
    },
  });
});

export default finance;
