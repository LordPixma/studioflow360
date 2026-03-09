import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateContractSchema, UpdateContractSchema, CreateContractTemplateSchema, UpdateContractTemplateSchema, generateId, nowISO } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type ContractsEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const contracts = new Hono<ContractsEnv>();

async function nextContractNumber(db: D1Database): Promise<string> {
  const prefix = `CTR-${new Date().toISOString().slice(0, 7).replace('-', '')}`;
  const result = await db.prepare(
    `SELECT contract_number FROM contracts WHERE contract_number LIKE ? ORDER BY contract_number DESC LIMIT 1`,
  ).bind(`${prefix}-%`).first<{ contract_number: string }>();
  if (!result) return `${prefix}-0001`;
  const lastNum = parseInt(result.contract_number.split('-').pop() ?? '0', 10);
  return `${prefix}-${String(lastNum + 1).padStart(4, '0')}`;
}

// GET /api/contracts
contracts.get('/', async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.status) { conditions.push('ct.status = ?'); params.push(query.status); }
  if (query.guest_id) { conditions.push('ct.guest_id = ?'); params.push(query.guest_id); }
  if (query.search) {
    conditions.push('(ct.guest_name LIKE ? OR ct.contract_number LIKE ? OR ct.title LIKE ?)');
    const term = `%${query.search}%`;
    params.push(term, term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.per_page) || 25));
  const offset = (page - 1) * perPage;

  const [countResult, results] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM contracts ct ${where}`).bind(...params).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT ct.*, sc.display_name as creator_name
       FROM contracts ct
       LEFT JOIN staff_users sc ON ct.created_by = sc.id
       ${where}
       ORDER BY ct.created_at DESC
       LIMIT ? OFFSET ?`,
    ).bind(...params, perPage, offset).all(),
  ]);

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total: countResult?.total ?? 0, total_pages: Math.ceil((countResult?.total ?? 0) / perPage) },
  });
});

// GET /api/contracts/summary
contracts.get('/summary', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT
       COUNT(*) as total_contracts,
       COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
       COUNT(CASE WHEN status IN ('draft', 'sent') THEN 1 END) as pending,
       COUNT(CASE WHEN status = 'signed' THEN 1 END) as signed,
       SUM(CASE WHEN status IN ('signed', 'active') THEN value ELSE 0 END) as total_value,
       COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired
     FROM contracts`,
  ).first();
  return c.json({ success: true, data: result });
});

// POST /api/contracts
contracts.post('/', zValidator('json', CreateContractSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();
  const contractNumber = await nextContractNumber(c.env.DB);

  // If template_id provided, fetch template content
  let content = data.content ?? '';
  if (data.template_id) {
    const tmpl = await c.env.DB.prepare('SELECT content FROM contract_templates WHERE id = ?').bind(data.template_id).first<{ content: string }>();
    if (tmpl) {
      // Replace merge fields
      content = tmpl.content
        .replace(/\{\{guest_name\}\}/g, data.guest_name)
        .replace(/\{\{guest_email\}\}/g, data.guest_email ?? '')
        .replace(/\{\{guest_company\}\}/g, data.guest_company ?? '')
        .replace(/\{\{contract_number\}\}/g, contractNumber)
        .replace(/\{\{start_date\}\}/g, data.start_date ?? '')
        .replace(/\{\{end_date\}\}/g, data.end_date ?? '')
        .replace(/\{\{value\}\}/g, String(data.value ?? 0))
        .replace(/\{\{date\}\}/g, now.split('T')[0]!);
    }
  }

  await c.env.DB.prepare(
    `INSERT INTO contracts (id, contract_number, guest_id, guest_name, guest_email, guest_company, booking_id, quote_id, title, status, content, start_date, end_date, value, currency, notes, template_id, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, 'GBP', ?, ?, ?, ?, ?)`,
  ).bind(
    id, contractNumber,
    data.guest_id ?? null, data.guest_name, data.guest_email ?? null,
    data.guest_company ?? null, data.booking_id ?? null, data.quote_id ?? null,
    data.title ?? 'Studio Booking Agreement',
    content, data.start_date ?? null, data.end_date ?? null,
    data.value ?? 0, data.notes ?? null,
    data.template_id ?? null, staff.id, now, now,
  ).run();

  return c.json({ success: true, data: { id, contract_number: contractNumber } }, 201);
});

// POST /api/contracts/from-quote/:quoteId
contracts.post('/from-quote/:quoteId', async (c) => {
  const quoteId = c.req.param('quoteId');
  const staff = c.get('staff');

  const quote = await c.env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quoteId).first<Record<string, unknown>>();
  if (!quote) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quote not found' } }, 404);

  const id = generateId();
  const now = nowISO();
  const contractNumber = await nextContractNumber(c.env.DB);

  // Get line items for contract content
  const lineItems = await c.env.DB.prepare(
    'SELECT description, quantity, unit_price, total FROM quote_line_items WHERE quote_id = ? ORDER BY sort_order',
  ).bind(quoteId).all();

  const itemsList = (lineItems.results as Array<{ description: string; quantity: number; unit_price: number; total: number }>)
    .map(i => `- ${i.description}: ${i.quantity} x £${i.unit_price.toFixed(2)} = £${i.total.toFixed(2)}`)
    .join('\n');

  const content = `STUDIO BOOKING AGREEMENT\n\nContract: ${contractNumber}\nClient: ${quote.guest_name}${quote.guest_company ? `\nCompany: ${quote.guest_company}` : ''}\n\nServices:\n${itemsList}\n\nTotal Value: £${(quote.total as number).toFixed(2)} (inclusive of VAT at ${quote.tax_rate}%)\n${quote.terms ? `\nTerms & Conditions:\n${quote.terms}` : ''}\n\nBy signing this agreement, both parties agree to the terms outlined above.`;

  await c.env.DB.prepare(
    `INSERT INTO contracts (id, contract_number, guest_id, guest_name, guest_email, guest_company, booking_id, quote_id, title, status, content, value, currency, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, 'GBP', ?, ?, ?)`,
  ).bind(
    id, contractNumber,
    (quote.guest_id as string | null) ?? null,
    quote.guest_name as string,
    (quote.guest_email as string | null) ?? null,
    (quote.guest_company as string | null) ?? null,
    (quote.booking_id as string | null) ?? null,
    quoteId,
    'Studio Booking Agreement',
    content, quote.total as number,
    staff.id, now, now,
  ).run();

  return c.json({ success: true, data: { id, contract_number: contractNumber } }, 201);
});

// GET /api/contracts/:id
contracts.get('/:id', async (c) => {
  const id = c.req.param('id');
  if (['summary', 'templates'].includes(id)) return c.notFound();

  const contract = await c.env.DB.prepare(
    `SELECT ct.*, sc.display_name as creator_name
     FROM contracts ct LEFT JOIN staff_users sc ON ct.created_by = sc.id
     WHERE ct.id = ?`,
  ).bind(id).first();

  if (!contract) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Contract not found' } }, 404);
  return c.json({ success: true, data: contract });
});

// PATCH /api/contracts/:id
contracts.patch('/:id', zValidator('json', UpdateContractSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const key of ['guest_name', 'guest_email', 'guest_company', 'title', 'content', 'start_date', 'end_date', 'notes'] as const) {
    if (data[key] !== undefined) { updates.push(`${key} = ?`); params.push(data[key]!); }
  }
  if (data.value !== undefined) { updates.push('value = ?'); params.push(data.value); }
  if (data.status !== undefined) {
    updates.push('status = ?'); params.push(data.status);
    if (data.status === 'signed') {
      updates.push('signed_at = ?'); params.push(nowISO());
      if (data.signed_by_name) { updates.push('signed_by_name = ?'); params.push(data.signed_by_name); }
      if (data.signed_by_email) { updates.push('signed_by_email = ?'); params.push(data.signed_by_email); }
    }
  }

  if (updates.length === 0) return c.json({ success: true, data: { id } });
  updates.push('updated_at = ?'); params.push(nowISO()); params.push(id);
  await c.env.DB.prepare(`UPDATE contracts SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

// DELETE /api/contracts/:id
contracts.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const contract = await c.env.DB.prepare('SELECT id, status FROM contracts WHERE id = ?').bind(id).first<{ id: string; status: string }>();
  if (!contract) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Contract not found' } }, 404);
  if (contract.status !== 'draft') return c.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Only draft contracts can be deleted' } }, 400);
  await c.env.DB.prepare('DELETE FROM contracts WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

// GET /api/contracts/:id/download - Branded contract HTML
contracts.get('/:id/download', async (c) => {
  const id = c.req.param('id');
  const [contractResult, settingsResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ct.*, sc.display_name as creator_name FROM contracts ct LEFT JOIN staff_users sc ON ct.created_by = sc.id WHERE ct.id = ?`,
    ).bind(id).first(),
    c.env.DB.prepare('SELECT * FROM studio_settings WHERE id = ?').bind('default').first(),
  ]);

  if (!contractResult) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Contract not found' } }, 404);
  const ct = contractResult as Record<string, unknown>;
  const s = (settingsResult ?? { studio_name: 'Aeras', studio_subtitle: 'Leeds Content Creation Studios', studio_address: 'Leeds City Centre, UK', studio_email: null, studio_phone: null, studio_website: null, logo_r2_key: null }) as Record<string, unknown>;

  const esc = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nl2br = (str: string) => esc(str).replace(/\n/g, '<br>');
  const currency = '£';

  let logoHtml: string;
  if (s.logo_r2_key) {
    logoHtml = `<img class="logo-icon" src="/api/settings/studio/logo" alt="${esc(s.studio_name as string)}" />`;
  } else {
    logoHtml = `<svg class="logo-icon" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3B82F6"/><stop offset="100%" stop-color="#6366F1"/></linearGradient></defs><rect width="512" height="512" rx="96" fill="url(#g)"/><path d="M156 370V256l100-110 100 110v114" stroke="white" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M206 370V290h100v80" stroke="white" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="256" cy="200" r="20" fill="white"/></svg>`;
  }

  const statusLabel: Record<string, string> = { draft: 'DRAFT', sent: 'AWAITING SIGNATURE', signed: 'SIGNED', active: 'ACTIVE', expired: 'EXPIRED', cancelled: 'CANCELLED' };
  const statusColor: Record<string, string> = { draft: '#6b7280', sent: '#2563eb', signed: '#059669', active: '#059669', expired: '#d97706', cancelled: '#dc2626' };
  const formatDate = (dateStr: string) => { try { return new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00Z')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch { return dateStr; } };

  const studioName = esc(s.studio_name as string);

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(ct.contract_number as string)} - ${studioName}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}@page{size:A4;margin:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;background:#f9fafb}.page{max-width:800px;margin:0 auto;background:#fff;min-height:100vh}.toolbar{background:#111827;color:#fff;padding:12px 32px;display:flex;align-items:center;justify-content:space-between}.toolbar button{background:#fff;color:#111827;border:none;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}.content{padding:48px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}.logo{display:flex;align-items:center;gap:14px}.logo-icon{width:44px;height:44px;border-radius:10px;object-fit:contain}.brand{font-size:24px;font-weight:800;letter-spacing:-0.5px}.brand-sub{font-size:12px;color:#9ca3af;margin-top:2px}.status{display:inline-block;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;color:#fff;margin-top:8px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:36px}.meta-section h3{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:8px}.meta-section p{font-size:14px;line-height:1.6;color:#374151}.meta-section p.name{font-weight:600;color:#111827}.contract-body{margin:36px 0;padding:24px;background:#f9fafb;border-radius:10px;border:1px solid #f3f4f6;font-size:14px;line-height:1.8;color:#374151}.signature{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:48px}.sig-block{border-top:2px solid #111827;padding-top:12px}.sig-block .label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9ca3af}.sig-block .value{font-size:14px;font-weight:600;color:#111827;margin-top:4px}.footer{margin-top:48px;padding-top:20px;border-top:1px solid #f3f4f6;text-align:center;font-size:12px;color:#9ca3af}@media print{body{background:#fff}.toolbar{display:none!important}.page{box-shadow:none}.content{padding:32px 40px}}</style>
</head><body>
<div class="toolbar"><span style="font-size:13px;font-weight:600">${esc(ct.contract_number as string)}</span><div style="display:flex;gap:8px"><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button></div></div>
<div class="page"><div class="content">
  <div class="header"><div><div class="logo">${logoHtml}<div><div class="brand">${studioName}</div>${s.studio_subtitle ? `<div class="brand-sub">${esc(s.studio_subtitle as string)}</div>` : ''}</div></div>${s.studio_address ? `<p style="font-size:12px;color:#9ca3af;margin-top:10px">${esc(s.studio_address as string)}</p>` : ''}${s.studio_email ? `<p style="font-size:12px;color:#9ca3af">${esc(s.studio_email as string)}</p>` : ''}</div>
  <div style="text-align:right"><h1 style="font-size:28px;font-weight:800;letter-spacing:-1px">CONTRACT</h1><p style="font-size:14px;color:#6b7280;margin-top:2px">${esc(ct.contract_number as string)}</p><div class="status" style="background:${statusColor[ct.status as string] ?? '#6b7280'}">${statusLabel[ct.status as string] ?? (ct.status as string).toUpperCase()}</div></div></div>

  <div style="margin-bottom:24px"><h2 style="font-size:18px;font-weight:700">${esc(ct.title as string)}</h2></div>

  <div class="meta">
    <div class="meta-section"><h3>Client</h3><p class="name">${esc(ct.guest_name as string)}</p>${ct.guest_company ? `<p>${esc(ct.guest_company as string)}</p>` : ''}${ct.guest_email ? `<p>${esc(ct.guest_email as string)}</p>` : ''}</div>
    <div class="meta-section" style="text-align:right"><h3>Details</h3>${ct.start_date ? `<p>Start: ${formatDate(ct.start_date as string)}</p>` : ''}${ct.end_date ? `<p>End: ${formatDate(ct.end_date as string)}</p>` : ''}<p>Value: ${currency}${(ct.value as number).toFixed(2)}</p></div>
  </div>

  <div class="contract-body">${nl2br(ct.content as string)}</div>

  <div class="signature">
    <div class="sig-block"><div class="label">Client Signature</div>${ct.signed_by_name ? `<div class="value">${esc(ct.signed_by_name as string)}</div><div style="font-size:12px;color:#6b7280">${ct.signed_at ? formatDate(ct.signed_at as string) : ''}</div>` : '<div style="height:40px"></div>'}</div>
    <div class="sig-block"><div class="label">Studio Representative</div><div class="value">${ct.creator_name ? esc(ct.creator_name as string) : studioName}</div></div>
  </div>

  <div class="footer"><p>${[studioName, s.studio_subtitle ? esc(s.studio_subtitle as string) : '', s.studio_address ? esc(s.studio_address as string) : ''].filter(Boolean).join(' &middot; ')}</p>${s.studio_website ? `<p style="margin-top:2px">${esc(s.studio_website as string)}</p>` : ''}</div>
</div></div></body></html>`;

  return c.html(html);
});

// --- Contract Templates ---

contracts.get('/templates', async (c) => {
  const query = Object.fromEntries(new URL(c.req.url).searchParams);
  const activeOnly = query.active !== '0';
  const results = await c.env.DB.prepare(
    `SELECT * FROM contract_templates ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY name`,
  ).all();
  return c.json({ success: true, data: results.results });
});

contracts.post('/templates', zValidator('json', CreateContractTemplateSchema), async (c) => {
  const data = c.req.valid('json');
  const staff = c.get('staff');
  const id = generateId();
  const now = nowISO();
  await c.env.DB.prepare(
    `INSERT INTO contract_templates (id, name, description, content, is_active, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
  ).bind(id, data.name, data.description ?? null, data.content, staff.id, now, now).run();
  return c.json({ success: true, data: { id } }, 201);
});

contracts.patch('/templates/:id', zValidator('json', UpdateContractTemplateSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const updates: string[] = [];
  const params: unknown[] = [];
  for (const key of ['name', 'description', 'content'] as const) {
    if (data[key] !== undefined) { updates.push(`${key} = ?`); params.push(data[key]!); }
  }
  if (data.is_active !== undefined) { updates.push('is_active = ?'); params.push(data.is_active); }
  if (updates.length === 0) return c.json({ success: true, data: { id } });
  updates.push('updated_at = ?'); params.push(nowISO()); params.push(id);
  await c.env.DB.prepare(`UPDATE contract_templates SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

contracts.delete('/templates/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM contract_templates WHERE id = ?').bind(id).run();
  return c.json({ success: true });
});

export default contracts;
