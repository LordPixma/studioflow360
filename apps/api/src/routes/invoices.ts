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

// DELETE /api/invoices/:id - Delete an invoice (only drafts)
invoices.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const invoice = await c.env.DB.prepare('SELECT id, status FROM invoices WHERE id = ?').bind(id).first<{ id: string; status: string }>();
  if (!invoice) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } }, 404);
  if (invoice.status !== 'draft') return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Only draft invoices can be deleted' } }, 400);
  await c.env.DB.prepare('DELETE FROM invoices WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// GET /api/invoices/:id/download - Download invoice as printable HTML
invoices.get('/:id/download', async (c) => {
  const id = c.req.param('id');
  const [invoiceResult, settingsResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT i.*, sc.display_name as creator_name
       FROM invoices i
       LEFT JOIN staff_users sc ON i.created_by = sc.id
       WHERE i.id = ?`,
    ).bind(id).first<InvoiceRow & { creator_name: string | null }>(),
    c.env.DB.prepare('SELECT * FROM studio_settings WHERE id = ?').bind('default').first<StudioSettings>(),
  ]);

  const invoice = invoiceResult;
  if (!invoice) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } }, 404);

  const s = settingsResult ?? { studio_name: 'Aeras', studio_subtitle: 'Leeds Content Creation Studios', studio_address: 'Leeds City Centre, UK', studio_email: null, studio_phone: null, studio_website: null, logo_r2_key: null, invoice_payment_terms: null, invoice_bank_details: null, invoice_notes: null };
  const lineItems = JSON.parse(invoice.line_items) as { description: string; quantity: number; unit_price: number; total: number }[];

  // Build logo HTML: use uploaded logo if exists, otherwise fallback SVG
  let logoHtml: string;
  if (s.logo_r2_key) {
    logoHtml = `<img class="logo-icon" src="/api/settings/studio/logo" alt="${escapeHtml(s.studio_name)}" />`;
  } else {
    logoHtml = `<svg class="logo-icon" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#6366F1"/></linearGradient></defs>
              <rect width="512" height="512" rx="96" fill="url(#g)"/>
              <path d="M156 370V256l100-110 100 110v114" stroke="white" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              <path d="M206 370V290h100v80" stroke="white" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              <circle cx="256" cy="200" r="20" fill="white"/>
            </svg>`;
  }

  const statusLabel: Record<string, string> = {
    draft: 'DRAFT', sent: 'AWAITING PAYMENT', paid: 'PAID', overdue: 'OVERDUE', cancelled: 'CANCELLED', refunded: 'REFUNDED',
  };
  const statusColor: Record<string, string> = {
    draft: '#6b7280', sent: '#2563eb', paid: '#059669', overdue: '#dc2626', cancelled: '#6b7280', refunded: '#d97706',
  };

  const currency = invoice.currency === 'GBP' ? '\u00A3' : invoice.currency === 'USD' ? '$' : invoice.currency === 'EUR' ? '\u20AC' : invoice.currency;
  const studioName = escapeHtml(s.studio_name);
  const studioSub = s.studio_subtitle ? escapeHtml(s.studio_subtitle) : '';
  const studioAddr = s.studio_address ? escapeHtml(s.studio_address) : '';

  // Combine notes: invoice-specific + studio default
  const allNotes: string[] = [];
  if (invoice.notes) allNotes.push(escapeHtml(invoice.notes));
  if (s.invoice_payment_terms) allNotes.push(escapeHtml(s.invoice_payment_terms));
  if (s.invoice_bank_details) allNotes.push(escapeHtml(s.invoice_bank_details));
  if (s.invoice_notes) allNotes.push(escapeHtml(s.invoice_notes));

  const footerParts = [studioName];
  if (studioSub) footerParts.push(studioSub);
  if (studioAddr) footerParts.push(studioAddr);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${invoice.invoice_number} - ${studioName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4; margin: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #f9fafb; }
    .page { max-width: 800px; margin: 0 auto; background: #fff; min-height: 100vh; }
    .toolbar { background: #111827; color: #fff; padding: 12px 32px; display: flex; align-items: center; justify-content: space-between; }
    .toolbar button { background: #fff; color: #111827; border: none; padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .toolbar button:hover { background: #e5e7eb; }
    .content { padding: 48px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .logo { display: flex; align-items: center; gap: 14px; }
    .logo-icon { width: 44px; height: 44px; border-radius: 10px; object-fit: contain; }
    .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #111827; }
    .brand-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; letter-spacing: 0.3px; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 28px; font-weight: 800; color: #111827; letter-spacing: -1px; }
    .invoice-title .number { font-size: 14px; color: #6b7280; margin-top: 2px; }
    .status { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; color: #fff; margin-top: 8px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 36px; }
    .meta-section h3 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 8px; }
    .meta-section p { font-size: 14px; line-height: 1.6; color: #374151; }
    .meta-section p.name { font-weight: 600; color: #111827; }
    .dates { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 36px; }
    .date-box { background: #f9fafb; border-radius: 10px; padding: 14px 18px; border: 1px solid #f3f4f6; }
    .date-box .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; }
    .date-box .value { font-size: 15px; font-weight: 600; color: #111827; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; padding: 10px 0; border-bottom: 2px solid #f3f4f6; text-align: left; }
    thead th:last-child, thead th:nth-child(2), thead th:nth-child(3) { text-align: right; }
    tbody td { padding: 14px 0; border-bottom: 1px solid #f9fafb; font-size: 14px; color: #374151; }
    tbody td:last-child, tbody td:nth-child(2), tbody td:nth-child(3) { text-align: right; font-variant-numeric: tabular-nums; }
    tbody td:first-child { color: #111827; font-weight: 500; }
    .totals { display: flex; justify-content: flex-end; margin-top: 8px; }
    .totals-box { width: 280px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #6b7280; }
    .totals-row.total { border-top: 2px solid #111827; padding-top: 12px; margin-top: 4px; font-size: 18px; font-weight: 800; color: #111827; }
    .totals-row .amount { font-variant-numeric: tabular-nums; }
    .notes { margin-top: 36px; padding: 20px; background: #f9fafb; border-radius: 10px; border: 1px solid #f3f4f6; }
    .notes h3 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #9ca3af; margin-bottom: 8px; }
    .notes p { font-size: 13px; color: #6b7280; line-height: 1.6; margin-bottom: 6px; }
    .notes p:last-child { margin-bottom: 0; }
    .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #f3f4f6; text-align: center; font-size: 12px; color: #9ca3af; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .page { box-shadow: none; max-width: none; }
      .content { padding: 32px 40px; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span style="font-size:13px;font-weight:600;">${invoice.invoice_number}</span>
    <div style="display:flex;gap:8px;">
      <button onclick="window.print()">Print / Save PDF</button>
      <button onclick="window.close()">Close</button>
    </div>
  </div>
  <div class="page">
    <div class="content">
      <div class="header">
        <div>
          <div class="logo">
            ${logoHtml}
            <div>
              <div class="brand">${studioName}</div>
              ${studioSub ? `<div class="brand-sub">${studioSub}</div>` : ''}
            </div>
          </div>
          ${studioAddr ? `<p style="font-size:12px;color:#9ca3af;margin-top:10px;">${studioAddr}</p>` : ''}
          ${s.studio_email ? `<p style="font-size:12px;color:#9ca3af;">${escapeHtml(s.studio_email)}</p>` : ''}
          ${s.studio_phone ? `<p style="font-size:12px;color:#9ca3af;">${escapeHtml(s.studio_phone)}</p>` : ''}
        </div>
        <div class="invoice-title">
          <h1>INVOICE</h1>
          <p class="number">${invoice.invoice_number}</p>
          <div class="status" style="background:${statusColor[invoice.status] ?? '#6b7280'}">${statusLabel[invoice.status] ?? invoice.status.toUpperCase()}</div>
        </div>
      </div>

      <div class="meta">
        <div class="meta-section">
          <h3>Bill To</h3>
          <p class="name">${escapeHtml(invoice.guest_name)}</p>
          ${invoice.guest_email ? `<p>${escapeHtml(invoice.guest_email)}</p>` : ''}
          ${invoice.guest_address ? `<p>${escapeHtml(invoice.guest_address)}</p>` : ''}
        </div>
        <div class="meta-section" style="text-align:right;">
          <h3>From</h3>
          <p class="name">${studioName}</p>
          ${studioSub ? `<p>${studioSub}</p>` : ''}
          ${studioAddr ? `<p>${studioAddr}</p>` : ''}
        </div>
      </div>

      <div class="dates">
        <div class="date-box">
          <div class="label">Issued</div>
          <div class="value">${formatDate(invoice.issued_date)}</div>
        </div>
        <div class="date-box">
          <div class="label">Due Date</div>
          <div class="value">${formatDate(invoice.due_date)}</div>
        </div>
        <div class="date-box">
          <div class="label">${invoice.status === 'paid' ? 'Paid' : 'Amount Due'}</div>
          <div class="value" style="color:${invoice.status === 'paid' ? '#059669' : '#111827'}">${currency}${invoice.total.toFixed(2)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:55%">Description</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map(item => `
          <tr>
            <td>${escapeHtml(item.description)}</td>
            <td>${item.quantity}</td>
            <td>${currency}${item.unit_price.toFixed(2)}</td>
            <td>${currency}${item.total.toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <div class="totals">
        <div class="totals-box">
          <div class="totals-row">
            <span>Subtotal</span>
            <span class="amount">${currency}${invoice.subtotal.toFixed(2)}</span>
          </div>
          <div class="totals-row">
            <span>VAT (${invoice.tax_rate}%)</span>
            <span class="amount">${currency}${invoice.tax_amount.toFixed(2)}</span>
          </div>
          <div class="totals-row total">
            <span>Total</span>
            <span class="amount">${currency}${invoice.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      ${allNotes.length > 0 ? `
      <div class="notes">
        <h3>Notes</h3>
        ${allNotes.map(n => `<p>${n}</p>`).join('')}
      </div>` : ''}

      <div class="footer">
        <p>${footerParts.join(' &middot; ')}</p>
        ${s.studio_website ? `<p style="margin-top:2px;">${escapeHtml(s.studio_website)}</p>` : ''}
        ${invoice.paid_date ? `<p style="margin-top:4px;">Payment received: ${formatDate(invoice.paid_date)}</p>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;

  return c.html(html);
});

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00Z');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
}

type InvoiceRow = {
  id: string; invoice_number: string; booking_id: string | null;
  guest_name: string; guest_email: string | null; guest_address: string | null;
  subtotal: number; tax_rate: number; tax_amount: number; total: number;
  currency: string; status: string; issued_date: string; due_date: string;
  paid_date: string | null; notes: string | null; line_items: string;
  created_by: string; created_at: string; updated_at: string;
};

type StudioSettings = {
  studio_name: string; studio_subtitle: string | null; studio_address: string | null;
  studio_email: string | null; studio_phone: string | null; studio_website: string | null;
  logo_r2_key: string | null; invoice_payment_terms: string | null;
  invoice_bank_details: string | null; invoice_notes: string | null;
};

export default invoices;
