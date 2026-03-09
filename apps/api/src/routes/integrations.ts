import { Hono } from 'hono';
import { CreateIntegrationSchema, UpdateIntegrationSchema, CreateWebhookEndpointSchema, UpdateWebhookEndpointSchema } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type IntEnv = { Bindings: Env; Variables: { staff: StaffContext } };

const app = new Hono<IntEnv>();

// ==========================================
// INTEGRATIONS
// ==========================================

app.get('/', async (c) => {
  const results = await c.env.DB.prepare('SELECT id, name, integration_type, status, config, last_sync_at, sync_error, is_active, created_at, updated_at FROM integrations ORDER BY name').all();
  return c.json({ success: true, data: results.results });
});

app.get('/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT id, name, integration_type, status, config, last_sync_at, sync_error, is_active, created_at, updated_at FROM integrations WHERE id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Integration not found' } }, 404);
  return c.json({ success: true, data: row });
});

app.post('/', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreateIntegrationSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO integrations (id, name, integration_type, config, credentials, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, data.name, data.integration_type, JSON.stringify(data.config ?? {}), JSON.stringify(data.credentials ?? {}), staff.id).run();
  return c.json({ success: true, data: { id } }, 201);
});

app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateIntegrationSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'config' || key === 'credentials') { sets.push(`${key} = ?`); params.push(JSON.stringify(value)); }
    else { sets.push(`${key} = ?`); params.push(value ?? null); }
  }
  params.push(id);
  await c.env.DB.prepare(`UPDATE integrations SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

app.delete('/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM integrations WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// ==========================================
// WEBHOOKS
// ==========================================

app.get('/webhooks/endpoints', async (c) => {
  const results = await c.env.DB.prepare('SELECT * FROM webhook_endpoints ORDER BY name').all();
  return c.json({ success: true, data: results.results });
});

app.get('/webhooks/endpoints/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM webhook_endpoints WHERE id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook endpoint not found' } }, 404);
  return c.json({ success: true, data: row });
});

app.post('/webhooks/endpoints', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreateWebhookEndpointSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO webhook_endpoints (id, name, url, secret, events, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, data.name, data.url, data.secret ?? null, JSON.stringify(data.events), staff.id).run();
  return c.json({ success: true, data: { id } }, 201);
});

app.patch('/webhooks/endpoints/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateWebhookEndpointSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'events') { sets.push('events = ?'); params.push(JSON.stringify(value)); }
    else { sets.push(`${key} = ?`); params.push(value ?? null); }
  }
  params.push(id);
  await c.env.DB.prepare(`UPDATE webhook_endpoints SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

app.delete('/webhooks/endpoints/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM webhook_log WHERE endpoint_id = ?').bind(c.req.param('id')).run();
  await c.env.DB.prepare('DELETE FROM webhook_endpoints WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// Webhook log
app.get('/webhooks/log', async (c) => {
  const { endpoint_id, status, page: pg, per_page: pp } = c.req.query();
  const page = Math.max(1, Number(pg) || 1);
  const perPage = Math.min(100, Math.max(1, Number(pp) || 50));
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (endpoint_id) { conditions.push('l.endpoint_id = ?'); params.push(endpoint_id); }
  if (status) { conditions.push('l.status = ?'); params.push(status); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const results = await c.env.DB.prepare(`
    SELECT l.*, e.name as endpoint_name FROM webhook_log l
    LEFT JOIN webhook_endpoints e ON l.endpoint_id = e.id
    ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?
  `).bind(...params, perPage, (page - 1) * perPage).all();
  return c.json({ success: true, data: results.results });
});

// Stats
app.get('/stats', async (c) => {
  const stats = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM integrations WHERE is_active = 1) as active_integrations,
      (SELECT COUNT(*) FROM integrations WHERE status = 'error') as errored_integrations,
      (SELECT COUNT(*) FROM webhook_endpoints WHERE is_active = 1) as active_webhooks,
      (SELECT COUNT(*) FROM webhook_log WHERE created_at >= date('now', '-7 days')) as webhook_calls_7d,
      (SELECT COUNT(*) FROM webhook_log WHERE status = 'failed' AND created_at >= date('now', '-7 days')) as webhook_failures_7d
  `).first();
  return c.json({ success: true, data: stats });
});

export default app;
