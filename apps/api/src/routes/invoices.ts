import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateInvoiceSchema, UpdateInvoiceSchema, generateId, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type InvoicesEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const invoices = new Hono<InvoicesEnv>();

// Helper: generate invoice number INV-YYYYMM-XXXX
async function nextInvoiceNumber(db: D1Database): Promise<string> {
  const prefix = `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}`;
  const result = await db.prepare(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1`,
  ).bind(`${prefix}-%`).first<{ invoice_number: string }>();

  if (!result) return `${prefix}-0001`;
  const lastNum = parseInt(result.invoice_number.split('-').pop() ?? '0', 10);
  return `${prefix}-${String(lastNum + 1).padStart(4, '0')}`;
}

// GET /api/invoices
invoices.get('/', async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.status) { conditions.push('i.status = ?'); params.push(query.status); }
  if (query.booking_id) { conditions.push('i.booking_id = ?'); params.push(query.booking_id); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.per_page) || 25));
  const offset = (page - 1) * perPage;

  const [countResult, results] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM invoices i ${where}`).bind(...params).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT i.*, sc.display_name as creator_name
       FROM invoices i
       LEFT JOIN staff_users sc ON i.created_by = sc.id
       ${where}
       ORDER BY i.issued_date DESC
       LIMIT ? OFFSET ?`,
    ).bind(...params, perPage, offset).all(),
  ]);

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total: countResult?.total ?? 0, total_pages: Math.ceil((countResult?.total ?? 0) / perPage) },
  });
});

// GET /api/invoices/summary
invoices.get('/summary', async (c) => {
  const [byStatus, revenue] = await Promise.all([
    c.env.DB.prepare(
      `SELECT status, COUNT(*) as count, SUM(total) as total_amount FROM invoices GROUP BY status`,
    ).all(),
    c.env.DB.prepare(
      `SELECT SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as collected,
              SUM(CASE WHEN status IN ('sent', 'overdue') THEN total ELSE 0 END) as outstanding,
              SUM(CASE WHEN status = 'overdue' THEN total ELSE 0 END) as overdue
       FROM invoices`,
    ).first(),
  ]);
  return c.json({ success: true, data: { by_status: byStatus.results, revenue } });
});

// POST /api/invoices
invoices.post('/', zValidator('json', CreateInvoiceSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();
  const invoiceNumber = await nextInvoiceNumber(c.env.DB);

  const subtotal = data.line_items.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = subtotal * (data.tax_rate / 100);
  const total = subtotal + taxAmount;

  await c.env.DB.prepare(
    `INSERT INTO invoices (id, invoice_number, booking_id, guest_name, guest_email, guest_address, subtotal, tax_rate, tax_amount, total, currency, status, issued_date, due_date, notes, line_items, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GBP', 'draft', ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, invoiceNumber, data.booking_id ?? null,
    data.guest_name, data.guest_email ?? null, data.guest_address ?? null,
    subtotal, data.tax_rate, taxAmount, total,
    now.split('T')[0]!, data.due_date, data.notes ?? null,
    JSON.stringify(data.line_items), staff.id, now, now,
  ).run();

  return c.json({ success: true, data: { id, invoice_number: invoiceNumber } }, 201);
});

// GET /api/invoices/:id
invoices.get('/:id', async (c) => {
  const id = c.req.param('id');
  const invoice = await c.env.DB.prepare(
    `SELECT i.*, sc.display_name as creator_name
     FROM invoices i
     LEFT JOIN staff_users sc ON i.created_by = sc.id
     WHERE i.id = ?`,
  ).bind(id).first();

  if (!invoice) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } }, 404);
  return c.json({ success: true, data: invoice });
});

// PATCH /api/invoices/:id
invoices.patch('/:id', zValidator('json', UpdateInvoiceSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const updates: string[] = [];
  const params: unknown[] = [];

  // Recalculate totals if line_items changed
  if (data.line_items) {
    const subtotal = data.line_items.reduce((sum, item) => sum + item.total, 0);
    const taxRate = data.tax_rate ?? 20;
    const taxAmount = subtotal * (taxRate / 100);
    updates.push('subtotal = ?', 'tax_amount = ?', 'total = ?', 'line_items = ?');
    params.push(subtotal, taxAmount, subtotal + taxAmount, JSON.stringify(data.line_items));
  }

  if (data.status !== undefined) {
    updates.push('status = ?'); params.push(data.status);
    if (data.status === 'paid') { updates.push('paid_date = ?'); params.push(nowISO()); }
  }

  for (const key of ['guest_name', 'guest_email', 'guest_address', 'tax_rate', 'due_date', 'notes'] as const) {
    if (data[key] !== undefined) { updates.push(`${key} = ?`); params.push(data[key]!); }
  }

  updates.push('updated_at = ?'); params.push(nowISO()); params.push(id);
  await c.env.DB.prepare(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

// POST /api/invoices/from-booking/:bookingId - Generate invoice from booking
invoices.post('/from-booking/:bookingId', async (c) => {
  const bookingId = c.req.param('bookingId');
  const staff = c.get('staff');

  const booking = await c.env.DB.prepare(
    `SELECT b.*, r.name as room_name, r.hourly_rate
     FROM bookings b
     LEFT JOIN rooms r ON b.room_id = r.id
     WHERE b.id = ?`,
  ).bind(bookingId).first<{
    id: string; guest_name: string; guest_email: string | null;
    booking_date: string; start_time: string; end_time: string;
    duration_hours: number | null; total_price: number | null;
    room_name: string | null; hourly_rate: number | null;
  }>();

  if (!booking) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);

  // Check if invoice already exists for this booking
  const existing = await c.env.DB.prepare('SELECT id, invoice_number FROM invoices WHERE booking_id = ?').bind(bookingId).first();
  if (existing) return c.json({ success: false, error: { code: 'CONFLICT', message: 'Invoice already exists for this booking' } }, 409);

  const id = generateId();
  const now = nowISO();
  const invoiceNumber = await nextInvoiceNumber(c.env.DB);

  // Calculate from booking details
  const hours = booking.duration_hours ?? 1;
  const rate = booking.hourly_rate ?? 0;
  const lineTotal = booking.total_price ?? (hours * rate);

  const lineItems = [{
    description: `Studio booking: ${booking.room_name ?? 'Studio'} - ${booking.booking_date} (${booking.start_time}-${booking.end_time})`,
    quantity: hours,
    unit_price: rate,
    total: lineTotal,
  }];

  const subtotal = lineTotal;
  const taxRate = 20;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  // Due in 14 days
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);
  const dueDateStr = dueDate.toISOString().split('T')[0]!;

  await c.env.DB.prepare(
    `INSERT INTO invoices (id, invoice_number, booking_id, guest_name, guest_email, subtotal, tax_rate, tax_amount, total, currency, status, issued_date, due_date, line_items, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'GBP', 'draft', ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, invoiceNumber, bookingId,
    booking.guest_name, booking.guest_email ?? null,
    subtotal, taxRate, taxAmount, total,
    now.split('T')[0]!, dueDateStr,
    JSON.stringify(lineItems), staff.id, now, now,
  ).run();

  return c.json({ success: true, data: { id, invoice_number: invoiceNumber } }, 201);
});

export default invoices;
