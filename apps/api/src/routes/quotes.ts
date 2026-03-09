import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateQuoteSchema, UpdateQuoteSchema, CreateQuoteTemplateSchema, UpdateQuoteTemplateSchema, generateId, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type QuotesEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const quotes = new Hono<QuotesEnv>();

// Helper: generate quote number QTE-YYYYMM-XXXX
async function nextQuoteNumber(db: D1Database): Promise<string> {
  const prefix = `QTE-${new Date().toISOString().slice(0, 7).replace('-', '')}`;
  const result = await db.prepare(
    `SELECT quote_number FROM quotes WHERE quote_number LIKE ? ORDER BY quote_number DESC LIMIT 1`,
  ).bind(`${prefix}-%`).first<{ quote_number: string }>();

  if (!result) return `${prefix}-0001`;
  const lastNum = parseInt(result.quote_number.split('-').pop() ?? '0', 10);
  return `${prefix}-${String(lastNum + 1).padStart(4, '0')}`;
}

function calculateTotals(lineItems: Array<{ total: number }>, discountPercent: number, taxRate: number) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * (taxRate / 100);
  const total = afterDiscount + taxAmount;
  return { subtotal, discountAmount, taxAmount, total };
}

// GET /api/quotes - List quotes
quotes.get('/', async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.status) { conditions.push('q.status = ?'); params.push(query.status); }
  if (query.guest_id) { conditions.push('q.guest_id = ?'); params.push(query.guest_id); }
  if (query.search) {
    conditions.push('(q.guest_name LIKE ? OR q.quote_number LIKE ? OR q.title LIKE ?)');
    const term = `%${query.search}%`;
    params.push(term, term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.per_page) || 25));
  const offset = (page - 1) * perPage;

  const [countResult, results] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM quotes q ${where}`).bind(...params).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT q.*, sc.display_name as creator_name
       FROM quotes q
       LEFT JOIN staff_users sc ON q.created_by = sc.id
       ${where}
       ORDER BY q.created_at DESC
       LIMIT ? OFFSET ?`,
    ).bind(...params, perPage, offset).all(),
  ]);

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total: countResult?.total ?? 0, total_pages: Math.ceil((countResult?.total ?? 0) / perPage) },
  });
});

// GET /api/quotes/summary
quotes.get('/summary', async (c) => {
  const [byStatus, totals] = await Promise.all([
    c.env.DB.prepare(
      `SELECT status, COUNT(*) as count, SUM(total) as total_amount FROM quotes GROUP BY status`,
    ).all(),
    c.env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'accepted' THEN total ELSE 0 END) as accepted_value,
         SUM(CASE WHEN status IN ('sent', 'viewed') THEN total ELSE 0 END) as pending_value,
         SUM(CASE WHEN status = 'converted' THEN total ELSE 0 END) as converted_value,
         COUNT(CASE WHEN status = 'accepted' THEN 1 END) * 100.0 / NULLIF(COUNT(CASE WHEN status NOT IN ('draft') THEN 1 END), 0) as acceptance_rate
       FROM quotes`,
    ).first(),
  ]);
  return c.json({ success: true, data: { by_status: byStatus.results, totals } });
});

// POST /api/quotes - Create quote
quotes.post('/', zValidator('json', CreateQuoteSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();
  const quoteNumber = await nextQuoteNumber(c.env.DB);

  const discountPercent = data.discount_percent ?? 0;
  const { subtotal, discountAmount, taxAmount, total } = calculateTotals(data.line_items, discountPercent, data.tax_rate);

  await c.env.DB.prepare(
    `INSERT INTO quotes (id, quote_number, guest_id, guest_name, guest_email, guest_company, guest_address, booking_id, title, status, subtotal, discount_percent, discount_amount, tax_rate, tax_amount, total, currency, valid_until, notes, terms, template_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, 'GBP', ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, quoteNumber,
    data.guest_id ?? null, data.guest_name, data.guest_email ?? null,
    data.guest_company ?? null, data.guest_address ?? null,
    data.booking_id ?? null, data.title ?? 'Studio Booking Quote',
    subtotal, discountPercent, discountAmount, data.tax_rate, taxAmount, total,
    data.valid_until ?? null, data.notes ?? null, data.terms ?? null,
    data.template_id ?? null, staff.id, now, now,
  ).run();

  // Insert line items
  for (let i = 0; i < data.line_items.length; i++) {
    const item = data.line_items[i]!;
    await c.env.DB.prepare(
      `INSERT INTO quote_line_items (id, quote_id, description, quantity, unit_price, total, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(generateId(), id, item.description, item.quantity, item.unit_price, item.total, i).run();
  }

  return c.json({ success: true, data: { id, quote_number: quoteNumber } }, 201);
});

// GET /api/quotes/:id - Quote detail with line items
quotes.get('/:id', async (c) => {
  const id = c.req.param('id');

  // Skip if route is a known sub-path
  if (['summary', 'templates'].includes(id)) return c.notFound();

  const [quote, lineItems] = await Promise.all([
    c.env.DB.prepare(
      `SELECT q.*, sc.display_name as creator_name
       FROM quotes q LEFT JOIN staff_users sc ON q.created_by = sc.id
       WHERE q.id = ?`,
    ).bind(id).first(),
    c.env.DB.prepare(
      `SELECT * FROM quote_line_items WHERE quote_id = ? ORDER BY sort_order`,
    ).bind(id).all(),
  ]);

  if (!quote) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quote not found' } }, 404);

  return c.json({
    success: true,
    data: { ...quote, line_items: lineItems.results },
  });
});

// PATCH /api/quotes/:id - Update quote
quotes.patch('/:id', zValidator('json', UpdateQuoteSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const key of ['guest_name', 'guest_email', 'guest_company', 'guest_address', 'title', 'valid_until', 'notes', 'terms'] as const) {
    if (data[key] !== undefined) { updates.push(`${key} = ?`); params.push(data[key]!); }
  }

  if (data.status !== undefined) {
    updates.push('status = ?'); params.push(data.status);
    if (data.status === 'accepted') { updates.push('accepted_at = ?'); params.push(nowISO()); }
  }

  // Recalculate if line items or pricing changed
  if (data.line_items) {
    const discountPercent = data.discount_percent ?? 0;
    const taxRate = data.tax_rate ?? 20;
    const { subtotal, discountAmount, taxAmount, total } = calculateTotals(data.line_items, discountPercent, taxRate);
    updates.push('subtotal = ?', 'discount_percent = ?', 'discount_amount = ?', 'tax_rate = ?', 'tax_amount = ?', 'total = ?');
    params.push(subtotal, discountPercent, discountAmount, taxRate, taxAmount, total);

    // Replace line items
    await c.env.DB.prepare('DELETE FROM quote_line_items WHERE quote_id = ?').bind(id).run();
    for (let i = 0; i < data.line_items.length; i++) {
      const item = data.line_items[i]!;
      await c.env.DB.prepare(
        `INSERT INTO quote_line_items (id, quote_id, description, quantity, unit_price, total, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(generateId(), id, item.description, item.quantity, item.unit_price, item.total, i).run();
    }
  } else {
    if (data.discount_percent !== undefined) { updates.push('discount_percent = ?'); params.push(data.discount_percent); }
    if (data.tax_rate !== undefined) { updates.push('tax_rate = ?'); params.push(data.tax_rate); }
  }

  if (updates.length === 0) return c.json({ success: true, data: { id } });

  updates.push('updated_at = ?'); params.push(nowISO()); params.push(id);
  await c.env.DB.prepare(`UPDATE quotes SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

// DELETE /api/quotes/:id - Delete draft quote
quotes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const quote = await c.env.DB.prepare('SELECT id, status FROM quotes WHERE id = ?').bind(id).first<{ id: string; status: string }>();
  if (!quote) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quote not found' } }, 404);
  if (quote.status !== 'draft') return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Only draft quotes can be deleted' } }, 400);
  await c.env.DB.prepare('DELETE FROM quotes WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// POST /api/quotes/:id/convert-to-invoice - Convert accepted quote to invoice
quotes.post('/:id/convert-to-invoice', async (c) => {
  const id = c.req.param('id');
  const staff = c.get('staff');

  const quote = await c.env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!quote) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quote not found' } }, 404);
  if (quote.status !== 'accepted') return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Only accepted quotes can be converted' } }, 400);
  if (quote.converted_invoice_id) return c.json({ success: false, error: { code: 'CONFLICT', message: 'Quote already converted to invoice' } }, 409);

  // Get line items
  const lineItems = await c.env.DB.prepare(
    'SELECT description, quantity, unit_price, total FROM quote_line_items WHERE quote_id = ? ORDER BY sort_order',
  ).bind(id).all();

  // Generate invoice
  const invoiceId = generateId();
  const now = nowISO();
  const prefix = `INV-${new Date().toISOString().slice(0, 7).replace('-', '')}`;
  const lastInv = await c.env.DB.prepare(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1`,
  ).bind(`${prefix}-%`).first<{ invoice_number: string }>();
  const lastNum = lastInv ? parseInt(lastInv.invoice_number.split('-').pop() ?? '0', 10) : 0;
  const invoiceNumber = `${prefix}-${String(lastNum + 1).padStart(4, '0')}`;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);
  const dueDateStr = dueDate.toISOString().split('T')[0]!;

  // Apply discount to subtotal for invoice (invoice doesn't have discount fields)
  const afterDiscount = (quote.subtotal as number) - (quote.discount_amount as number);

  await c.env.DB.prepare(
    `INSERT INTO invoices (id, invoice_number, booking_id, guest_name, guest_email, guest_address, subtotal, tax_rate, tax_amount, total, currency, status, issued_date, due_date, notes, line_items, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GBP', 'draft', ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    invoiceId, invoiceNumber,
    (quote.booking_id as string | null) ?? null,
    quote.guest_name as string, (quote.guest_email as string | null) ?? null,
    (quote.guest_address as string | null) ?? null,
    afterDiscount, quote.tax_rate as number, quote.tax_amount as number, quote.total as number,
    now.split('T')[0]!, dueDateStr,
    (quote.notes as string | null) ?? null,
    JSON.stringify(lineItems.results),
    staff.id, now, now,
  ).run();

  // Mark quote as converted
  await c.env.DB.prepare(
    `UPDATE quotes SET status = 'converted', converted_invoice_id = ?, updated_at = ? WHERE id = ?`,
  ).bind(invoiceId, now, id).run();

  return c.json({ success: true, data: { invoice_id: invoiceId, invoice_number: invoiceNumber } }, 201);
});

// GET /api/quotes/:id/download - Branded quote HTML
quotes.get('/:id/download', async (c) => {
  const id = c.req.param('id');
  const [quoteResult, settingsResult, lineItemsResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT q.*, sc.display_name as creator_name
       FROM quotes q LEFT JOIN staff_users sc ON q.created_by = sc.id WHERE q.id = ?`,
    ).bind(id).first(),
    c.env.DB.prepare('SELECT * FROM studio_settings WHERE id = ?').bind('default').first(),
    c.env.DB.prepare('SELECT * FROM quote_line_items WHERE quote_id = ? ORDER BY sort_order').bind(id).all(),
  ]);

  if (!quoteResult) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quote not found' } }, 404);
  const q = quoteResult as Record<string, unknown>;
  const s = (settingsResult ?? { studio_name: 'Aeras', studio_subtitle: 'Leeds Content Creation Studios', studio_address: 'Leeds City Centre, UK', studio_email: null, studio_phone: null, studio_website: null, logo_r2_key: null }) as Record<string, unknown>;
  const items = lineItemsResult.results as Array<{ description: string; quantity: number; unit_price: number; total: number }>;

  const currency = q.currency === 'GBP' ? '\u00A3' : q.currency === 'USD' ? '$' : q.currency === 'EUR' ? '\u20AC' : q.currency as string;
  const esc = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let logoHtml: string;
  if (s.logo_r2_key) {
    logoHtml = `<img class="logo-icon" src="/api/settings/studio/logo" alt="${esc(s.studio_name as string)}" />`;
  } else {
    logoHtml = `<svg class="logo-icon" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#6366F1"/></linearGradient></defs>
      <rect width="512" height="512" rx="96" fill="url(#g)"/>
      <path d="M156 370V256l100-110 100 110v114" stroke="white" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="M206 370V290h100v80" stroke="white" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle cx="256" cy="200" r="20" fill="white"/>
    </svg>`;
  }

  const statusLabel: Record<string, string> = { draft: 'DRAFT', sent: 'PROPOSAL', viewed: 'VIEWED', accepted: 'ACCEPTED', declined: 'DECLINED', expired: 'EXPIRED', converted: 'CONVERTED' };
  const statusColor: Record<string, string> = { draft: '#6b7280', sent: '#2563eb', viewed: '#7c3aed', accepted: '#059669', declined: '#dc2626', expired: '#d97706', converted: '#059669' };

  const studioName = esc(s.studio_name as string);
  const studioSub = s.studio_subtitle ? esc(s.studio_subtitle as string) : '';
  const studioAddr = s.studio_address ? esc(s.studio_address as string) : '';

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00Z');
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    } catch { return dateStr; }
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(q.quote_number as string)} - ${studioName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4; margin: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; background: #f9fafb; }
    .page { max-width: 800px; margin: 0 auto; background: #fff; min-height: 100vh; }
    .toolbar { background: #111827; color: #fff; padding: 12px 32px; display: flex; align-items: center; justify-content: space-between; }
    .toolbar button { background: #fff; color: #111827; border: none; padding: 8px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .content { padding: 48px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .logo { display: flex; align-items: center; gap: 14px; }
    .logo-icon { width: 44px; height: 44px; border-radius: 10px; object-fit: contain; }
    .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #111827; }
    .brand-sub { font-size: 12px; color: #9ca3af; margin-top: 2px; }
    .quote-title { text-align: right; }
    .quote-title h1 { font-size: 28px; font-weight: 800; color: #111827; letter-spacing: -1px; }
    .quote-title .number { font-size: 14px; color: #6b7280; margin-top: 2px; }
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
    .notes p { font-size: 13px; color: #6b7280; line-height: 1.6; white-space: pre-wrap; }
    .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #f3f4f6; text-align: center; font-size: 12px; color: #9ca3af; }
    @media print { body { background: #fff; } .toolbar { display: none !important; } .page { box-shadow: none; } .content { padding: 32px 40px; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <span style="font-size:13px;font-weight:600;">${esc(q.quote_number as string)}</span>
    <div style="display:flex;gap:8px;">
      <button onclick="window.print()">Print / Save PDF</button>
      <button onclick="window.close()">Close</button>
    </div>
  </div>
  <div class="page"><div class="content">
    <div class="header">
      <div>
        <div class="logo">${logoHtml}<div><div class="brand">${studioName}</div>${studioSub ? `<div class="brand-sub">${studioSub}</div>` : ''}</div></div>
        ${studioAddr ? `<p style="font-size:12px;color:#9ca3af;margin-top:10px;">${studioAddr}</p>` : ''}
        ${s.studio_email ? `<p style="font-size:12px;color:#9ca3af;">${esc(s.studio_email as string)}</p>` : ''}
        ${s.studio_phone ? `<p style="font-size:12px;color:#9ca3af;">${esc(s.studio_phone as string)}</p>` : ''}
      </div>
      <div class="quote-title">
        <h1>QUOTE</h1>
        <p class="number">${esc(q.quote_number as string)}</p>
        <div class="status" style="background:${statusColor[q.status as string] ?? '#6b7280'}">${statusLabel[q.status as string] ?? (q.status as string).toUpperCase()}</div>
      </div>
    </div>

    <div class="meta">
      <div class="meta-section"><h3>Prepared For</h3>
        <p class="name">${esc(q.guest_name as string)}</p>
        ${q.guest_company ? `<p>${esc(q.guest_company as string)}</p>` : ''}
        ${q.guest_email ? `<p>${esc(q.guest_email as string)}</p>` : ''}
        ${q.guest_address ? `<p>${esc(q.guest_address as string)}</p>` : ''}
      </div>
      <div class="meta-section" style="text-align:right;"><h3>From</h3>
        <p class="name">${studioName}</p>
        ${studioSub ? `<p>${studioSub}</p>` : ''}
        ${studioAddr ? `<p>${studioAddr}</p>` : ''}
      </div>
    </div>

    <div style="margin-bottom:24px;"><h2 style="font-size:18px;font-weight:700;color:#111827;">${esc(q.title as string)}</h2></div>

    <div class="dates">
      <div class="date-box"><div class="label">Created</div><div class="value">${formatDate((q.created_at as string).split('T')[0]!)}</div></div>
      ${q.valid_until ? `<div class="date-box"><div class="label">Valid Until</div><div class="value">${formatDate(q.valid_until as string)}</div></div>` : ''}
      <div class="date-box"><div class="label">Total</div><div class="value">${currency}${(q.total as number).toFixed(2)}</div></div>
    </div>

    <table>
      <thead><tr><th style="width:55%">Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
      <tbody>${items.map(item => `<tr><td>${esc(item.description)}</td><td>${item.quantity}</td><td>${currency}${item.unit_price.toFixed(2)}</td><td>${currency}${item.total.toFixed(2)}</td></tr>`).join('')}</tbody>
    </table>

    <div class="totals"><div class="totals-box">
      <div class="totals-row"><span>Subtotal</span><span class="amount">${currency}${(q.subtotal as number).toFixed(2)}</span></div>
      ${(q.discount_amount as number) > 0 ? `<div class="totals-row"><span>Discount (${q.discount_percent}%)</span><span class="amount">-${currency}${(q.discount_amount as number).toFixed(2)}</span></div>` : ''}
      <div class="totals-row"><span>VAT (${q.tax_rate}%)</span><span class="amount">${currency}${(q.tax_amount as number).toFixed(2)}</span></div>
      <div class="totals-row total"><span>Total</span><span class="amount">${currency}${(q.total as number).toFixed(2)}</span></div>
    </div></div>

    ${q.notes ? `<div class="notes"><h3>Notes</h3><p>${esc(q.notes as string)}</p></div>` : ''}
    ${q.terms ? `<div class="notes" style="margin-top:16px;"><h3>Terms & Conditions</h3><p>${esc(q.terms as string)}</p></div>` : ''}

    <div class="footer">
      <p>${[studioName, studioSub, studioAddr].filter(Boolean).join(' &middot; ')}</p>
      ${s.studio_website ? `<p style="margin-top:2px;">${esc(s.studio_website as string)}</p>` : ''}
    </div>
  </div></div>
</body></html>`;

  return c.html(html);
});

// --- Quote Templates ---

// GET /api/quotes/templates
quotes.get('/templates', async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const activeOnly = query.active !== '0';
  const results = await c.env.DB.prepare(
    `SELECT * FROM quote_templates ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY name`,
  ).all();
  return c.json({ success: true, data: results.results });
});

// POST /api/quotes/templates
quotes.post('/templates', zValidator('json', CreateQuoteTemplateSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();

  await c.env.DB.prepare(
    `INSERT INTO quote_templates (id, name, description, line_items, discount_percent, tax_rate, terms, notes, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  ).bind(
    id, data.name, data.description ?? null,
    JSON.stringify(data.line_items),
    data.discount_percent ?? 0, data.tax_rate,
    data.terms ?? null, data.notes ?? null,
    staff.id, now, now,
  ).run();

  return c.json({ success: true, data: { id } }, 201);
});

// PATCH /api/quotes/templates/:id
quotes.patch('/templates/:id', zValidator('json', UpdateQuoteTemplateSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const key of ['name', 'description', 'terms', 'notes'] as const) {
    if (data[key] !== undefined) { updates.push(`${key} = ?`); params.push(data[key]!); }
  }
  if (data.line_items) { updates.push('line_items = ?'); params.push(JSON.stringify(data.line_items)); }
  if (data.discount_percent !== undefined) { updates.push('discount_percent = ?'); params.push(data.discount_percent); }
  if (data.tax_rate !== undefined) { updates.push('tax_rate = ?'); params.push(data.tax_rate); }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); params.push(data.is_active); }

  if (updates.length === 0) return c.json({ success: true, data: { id } });
  updates.push('updated_at = ?'); params.push(nowISO()); params.push(id);
  await c.env.DB.prepare(`UPDATE quote_templates SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

// DELETE /api/quotes/templates/:id
quotes.delete('/templates/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM quote_templates WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default quotes;
