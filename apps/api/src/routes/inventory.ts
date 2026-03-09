import { Hono } from 'hono';
import { CreateInventoryItemSchema, UpdateInventoryItemSchema, CreateInventoryTransactionSchema } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type InvEnv = { Bindings: Env; Variables: { staff: StaffContext } };

const app = new Hono<InvEnv>();

// GET / — list inventory items
app.get('/', async (c) => {
  const { category, search, low_stock, room_id, page: pg, per_page: pp } = c.req.query();
  const page = Math.max(1, Number(pg) || 1);
  const perPage = Math.min(100, Math.max(1, Number(pp) || 50));

  const conditions: string[] = ['i.is_active = 1'];
  const params: unknown[] = [];

  if (category) { conditions.push('i.category = ?'); params.push(category); }
  if (room_id) { conditions.push('i.room_id = ?'); params.push(room_id); }
  if (search) { conditions.push('(i.name LIKE ? OR i.sku LIKE ? OR i.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (low_stock === '1') { conditions.push('i.quantity_on_hand <= i.minimum_stock'); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM inventory_items i ${where}`).bind(...params).first<{ total: number }>();
  const total = countRow?.total ?? 0;

  const results = await c.env.DB.prepare(`
    SELECT i.*, r.name as room_name
    FROM inventory_items i
    LEFT JOIN rooms r ON i.room_id = r.id
    ${where}
    ORDER BY
      CASE WHEN i.quantity_on_hand <= i.minimum_stock AND i.minimum_stock > 0 THEN 0 ELSE 1 END,
      i.name ASC
    LIMIT ? OFFSET ?
  `).bind(...params, perPage, (page - 1) * perPage).all();

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  });
});

// GET /summary — inventory overview stats
app.get('/summary', async (c) => {
  const stats = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total_items,
      SUM(CASE WHEN quantity_on_hand <= minimum_stock AND minimum_stock > 0 THEN 1 ELSE 0 END) as low_stock_count,
      SUM(CASE WHEN quantity_on_hand = 0 THEN 1 ELSE 0 END) as out_of_stock_count,
      ROUND(SUM(quantity_on_hand * unit_cost), 2) as total_value
    FROM inventory_items
    WHERE is_active = 1
  `).first();
  return c.json({ success: true, data: stats });
});

// GET /:id — item detail with recent transactions
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const item = await c.env.DB.prepare(`
    SELECT i.*, r.name as room_name
    FROM inventory_items i
    LEFT JOIN rooms r ON i.room_id = r.id
    WHERE i.id = ?
  `).bind(id).first();
  if (!item) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }, 404);

  const transactions = await c.env.DB.prepare(`
    SELECT it.*, s.display_name as created_by_name
    FROM inventory_transactions it
    LEFT JOIN staff_users s ON it.created_by = s.id
    WHERE it.item_id = ?
    ORDER BY it.created_at DESC
    LIMIT 50
  `).bind(id).all();

  return c.json({ success: true, data: { ...item, transactions: transactions.results } });
});

// POST / — create inventory item
app.post('/', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreateInventoryItemSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);

  const data = parsed.data;
  const id = crypto.randomUUID();

  // Check for duplicate SKU
  if (data.sku) {
    const dup = await c.env.DB.prepare('SELECT id FROM inventory_items WHERE sku = ?').bind(data.sku).first();
    if (dup) return c.json({ success: false, error: { code: 'DUPLICATE_SKU', message: 'SKU already exists' } }, 409);
  }

  await c.env.DB.prepare(`
    INSERT INTO inventory_items (id, sku, name, description, category, unit, quantity_on_hand, minimum_stock, reorder_quantity, unit_cost, supplier, supplier_url, location, room_id, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, data.sku ?? null, data.name, data.description ?? null, data.category ?? 'general', data.unit ?? 'pcs',
    data.quantity_on_hand ?? 0, data.minimum_stock ?? 0, data.reorder_quantity ?? 0, data.unit_cost ?? 0,
    data.supplier ?? null, data.supplier_url ?? null, data.location ?? null, data.room_id ?? null,
    data.notes ?? null, staff.id,
  ).run();

  // Log initial stock as a transaction if quantity > 0
  if ((data.quantity_on_hand ?? 0) > 0) {
    await c.env.DB.prepare(`
      INSERT INTO inventory_transactions (id, item_id, transaction_type, quantity, previous_quantity, new_quantity, reference, created_by)
      VALUES (?, ?, 'restock', ?, 0, ?, 'Initial stock', ?)
    `).bind(crypto.randomUUID(), id, data.quantity_on_hand ?? 0, data.quantity_on_hand ?? 0, staff.id).run();
  }

  return c.json({ success: true, data: { id } }, 201);
});

// PATCH /:id — update inventory item
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateInventoryItemSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM inventory_items WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }, 404);

  const data = parsed.data;
  const sets: string[] = ['updated_at = datetime(\'now\')'];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'quantity_on_hand') continue; // Stock changes go through transactions
    sets.push(`${key} = ?`);
    params.push(value ?? null);
  }

  params.push(id);
  await c.env.DB.prepare(`UPDATE inventory_items SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  return c.json({ success: true, data: { id } });
});

// POST /transactions — record stock movement
app.post('/transactions', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreateInventoryTransactionSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);

  const data = parsed.data;
  const item = await c.env.DB.prepare('SELECT id, quantity_on_hand FROM inventory_items WHERE id = ?').bind(data.item_id).first<{ id: string; quantity_on_hand: number }>();
  if (!item) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }, 404);

  const prevQty = item.quantity_on_hand;
  let newQty: number;

  switch (data.transaction_type) {
    case 'restock':
    case 'return':
      newQty = prevQty + Math.abs(data.quantity);
      break;
    case 'usage':
    case 'write_off':
      newQty = Math.max(0, prevQty - Math.abs(data.quantity));
      break;
    case 'adjustment':
      newQty = Math.max(0, prevQty + data.quantity); // can be positive or negative
      break;
    default:
      newQty = prevQty;
  }

  const txId = crypto.randomUUID();
  await c.env.DB.prepare(`
    INSERT INTO inventory_transactions (id, item_id, transaction_type, quantity, previous_quantity, new_quantity, reference, notes, booking_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(txId, data.item_id, data.transaction_type, data.quantity, prevQty, newQty, data.reference ?? null, data.notes ?? null, data.booking_id ?? null, staff.id).run();

  // Update item quantity
  const restockedAt = (data.transaction_type === 'restock') ? `, last_restocked_at = datetime('now')` : '';
  await c.env.DB.prepare(
    `UPDATE inventory_items SET quantity_on_hand = ?, updated_at = datetime('now')${restockedAt} WHERE id = ?`,
  ).bind(newQty, data.item_id).run();

  return c.json({ success: true, data: { id: txId, previous_quantity: prevQty, new_quantity: newQty } }, 201);
});

// DELETE /:id — deactivate inventory item (soft delete)
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT id FROM inventory_items WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found' } }, 404);

  await c.env.DB.prepare('UPDATE inventory_items SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default app;
