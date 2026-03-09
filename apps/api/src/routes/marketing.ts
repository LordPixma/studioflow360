import { Hono } from 'hono';
import { CreatePromotionSchema, UpdatePromotionSchema, CreatePromoCodeSchema, CreateCampaignSchema, UpdateCampaignSchema, UpdateGuestPortalSchema } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type MktEnv = { Bindings: Env; Variables: { staff: StaffContext } };

const app = new Hono<MktEnv>();

// ==========================================
// PROMOTIONS
// ==========================================

app.get('/promotions', async (c) => {
  const { is_active } = c.req.query();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (is_active !== undefined) { conditions.push('is_active = ?'); params.push(Number(is_active)); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const results = await c.env.DB.prepare(`SELECT * FROM promotions ${where} ORDER BY created_at DESC`).bind(...params).all();
  return c.json({ success: true, data: results.results });
});

app.get('/promotions/:id', async (c) => {
  const promo = await c.env.DB.prepare('SELECT * FROM promotions WHERE id = ?').bind(c.req.param('id')).first();
  if (!promo) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Promotion not found' } }, 404);
  const codes = await c.env.DB.prepare('SELECT * FROM promo_codes WHERE promotion_id = ? ORDER BY created_at DESC').bind(c.req.param('id')).all();
  return c.json({ success: true, data: { ...promo, codes: codes.results } });
});

app.post('/promotions', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreatePromotionSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO promotions (id, name, description, promo_type, discount_value, min_booking_value, max_discount, valid_from, valid_to, usage_limit, applicable_rooms, applicable_platforms, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, data.name, data.description ?? null, data.promo_type, data.discount_value, data.min_booking_value ?? null, data.max_discount ?? null, data.valid_from, data.valid_to ?? null, data.usage_limit ?? null, JSON.stringify(data.applicable_rooms ?? []), JSON.stringify(data.applicable_platforms ?? []), staff.id).run();
  return c.json({ success: true, data: { id } }, 201);
});

app.patch('/promotions/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdatePromotionSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'applicable_rooms' || key === 'applicable_platforms') { sets.push(`${key} = ?`); params.push(JSON.stringify(value)); }
    else { sets.push(`${key} = ?`); params.push(value ?? null); }
  }
  params.push(id);
  await c.env.DB.prepare(`UPDATE promotions SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

app.delete('/promotions/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM promo_codes WHERE promotion_id = ?').bind(c.req.param('id')).run();
  await c.env.DB.prepare('DELETE FROM promotions WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// Promo codes
app.post('/promotions/:id/codes', async (c) => {
  const body = await c.req.json();
  const parsed = CreatePromoCodeSchema.safeParse({ ...body, promotion_id: c.req.param('id') });
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO promo_codes (id, promotion_id, code, max_uses) VALUES (?, ?, ?, ?)').bind(id, data.promotion_id, data.code, data.max_uses ?? null).run();
  return c.json({ success: true, data: { id, code: data.code } }, 201);
});

app.delete('/codes/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM promo_codes WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// ==========================================
// CAMPAIGNS
// ==========================================

app.get('/campaigns', async (c) => {
  const { status } = c.req.query();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) { conditions.push('status = ?'); params.push(status); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const results = await c.env.DB.prepare(`SELECT * FROM marketing_campaigns ${where} ORDER BY created_at DESC`).bind(...params).all();
  return c.json({ success: true, data: results.results });
});

app.get('/campaigns/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Campaign not found' } }, 404);
  return c.json({ success: true, data: row });
});

app.post('/campaigns', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreateCampaignSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO marketing_campaigns (id, name, description, campaign_type, target_audience, content, subject, email_template_id, promotion_id, scheduled_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, data.name, data.description ?? null, data.campaign_type, JSON.stringify(data.target_audience ?? {}), data.content ?? null, data.subject ?? null, data.email_template_id ?? null, data.promotion_id ?? null, data.scheduled_at ?? null, staff.id).run();
  return c.json({ success: true, data: { id } }, 201);
});

app.patch('/campaigns/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateCampaignSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'target_audience') { sets.push(`${key} = ?`); params.push(JSON.stringify(value)); }
    else { sets.push(`${key} = ?`); params.push(value ?? null); }
  }
  params.push(id);
  await c.env.DB.prepare(`UPDATE marketing_campaigns SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

app.delete('/campaigns/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM marketing_campaigns WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// ==========================================
// GUEST PORTAL CONFIG
// ==========================================

app.get('/portal', async (c) => {
  const config = await c.env.DB.prepare('SELECT * FROM guest_portal_config WHERE id = ?').bind('default').first();
  return c.json({ success: true, data: config });
});

app.patch('/portal', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = UpdateGuestPortalSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const sets: string[] = ["updated_at = datetime('now')", 'updated_by = ?'];
  const params: unknown[] = [staff.id];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'faq') { sets.push('faq = ?'); params.push(JSON.stringify(value)); }
    else { sets.push(`${key} = ?`); params.push(value ?? null); }
  }
  await c.env.DB.prepare(`UPDATE guest_portal_config SET ${sets.join(', ')} WHERE id = 'default'`).bind(...params).run();
  return c.json({ success: true });
});

// Stats summary
app.get('/stats', async (c) => {
  const stats = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM promotions WHERE is_active = 1) as active_promotions,
      (SELECT COUNT(*) FROM promo_codes WHERE is_active = 1) as active_codes,
      (SELECT COUNT(*) FROM marketing_campaigns) as total_campaigns,
      (SELECT COUNT(*) FROM marketing_campaigns WHERE status = 'sent') as sent_campaigns,
      (SELECT SUM(times_used) FROM promotions) as total_promo_uses
  `).first();
  return c.json({ success: true, data: stats });
});

export default app;
