import { Hono } from 'hono';
import { CreateEmailTemplateSchema, UpdateEmailTemplateSchema, CreateAutomationRuleSchema, UpdateAutomationRuleSchema } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type AutoEnv = { Bindings: Env; Variables: { staff: StaffContext } };

const app = new Hono<AutoEnv>();

// ==========================================
// EMAIL TEMPLATES
// ==========================================

app.get('/templates', async (c) => {
  const { template_type, search } = c.req.query();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (template_type) { conditions.push('template_type = ?'); params.push(template_type); }
  if (search) { conditions.push('(name LIKE ? OR subject LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const results = await c.env.DB.prepare(`SELECT * FROM email_templates ${where} ORDER BY updated_at DESC`).bind(...params).all();
  return c.json({ success: true, data: results.results });
});

app.get('/templates/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM email_templates WHERE id = ?').bind(c.req.param('id')).first();
  if (!row) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } }, 404);
  return c.json({ success: true, data: row });
});

app.post('/templates', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreateEmailTemplateSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO email_templates (id, name, subject, body_html, body_text, template_type, variables, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, data.name, data.subject, data.body_html, data.body_text ?? null, data.template_type, JSON.stringify(data.variables ?? []), staff.id).run();
  return c.json({ success: true, data: { id } }, 201);
});

app.patch('/templates/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateEmailTemplateSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'variables') { sets.push('variables = ?'); params.push(JSON.stringify(value)); }
    else { sets.push(`${key} = ?`); params.push(value ?? null); }
  }
  params.push(id);
  await c.env.DB.prepare(`UPDATE email_templates SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

app.delete('/templates/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM email_templates WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// ==========================================
// AUTOMATION RULES
// ==========================================

app.get('/rules', async (c) => {
  const { trigger_type, is_active } = c.req.query();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (trigger_type) { conditions.push('r.trigger_type = ?'); params.push(trigger_type); }
  if (is_active !== undefined) { conditions.push('r.is_active = ?'); params.push(Number(is_active)); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const results = await c.env.DB.prepare(`
    SELECT r.*, t.name as template_name FROM automation_rules r
    LEFT JOIN email_templates t ON r.email_template_id = t.id
    ${where} ORDER BY r.updated_at DESC
  `).bind(...params).all();
  return c.json({ success: true, data: results.results });
});

app.get('/rules/:id', async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT r.*, t.name as template_name FROM automation_rules r
    LEFT JOIN email_templates t ON r.email_template_id = t.id WHERE r.id = ?
  `).bind(c.req.param('id')).first();
  if (!row) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } }, 404);
  return c.json({ success: true, data: row });
});

app.post('/rules', async (c) => {
  const staff = c.get('staff');
  const body = await c.req.json();
  const parsed = CreateAutomationRuleSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO automation_rules (id, name, description, trigger_type, trigger_config, action_type, action_config, email_template_id, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, data.name, data.description ?? null, data.trigger_type, JSON.stringify(data.trigger_config ?? {}), data.action_type, JSON.stringify(data.action_config ?? {}), data.email_template_id ?? null, data.is_active ?? 1, staff.id).run();
  return c.json({ success: true, data: { id } }, 201);
});

app.patch('/rules/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateAutomationRuleSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  const data = parsed.data;
  const sets: string[] = ["updated_at = datetime('now')"];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'trigger_config' || key === 'action_config') { sets.push(`${key} = ?`); params.push(JSON.stringify(value)); }
    else { sets.push(`${key} = ?`); params.push(value ?? null); }
  }
  params.push(id);
  await c.env.DB.prepare(`UPDATE automation_rules SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();
  return c.json({ success: true, data: { id } });
});

app.delete('/rules/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM automation_rules WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ success: true });
});

// ==========================================
// AUTOMATION LOG
// ==========================================

app.get('/log', async (c) => {
  const { rule_id, status, page: pg, per_page: pp } = c.req.query();
  const page = Math.max(1, Number(pg) || 1);
  const perPage = Math.min(100, Math.max(1, Number(pp) || 50));
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (rule_id) { conditions.push('l.rule_id = ?'); params.push(rule_id); }
  if (status) { conditions.push('l.status = ?'); params.push(status); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM automation_log l ${where}`).bind(...params).first<{ total: number }>();
  const results = await c.env.DB.prepare(`
    SELECT l.*, r.name as rule_name FROM automation_log l
    LEFT JOIN automation_rules r ON l.rule_id = r.id
    ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?
  `).bind(...params, perPage, (page - 1) * perPage).all();
  return c.json({ success: true, data: results.results, pagination: { page, per_page: perPage, total: total?.total ?? 0, total_pages: Math.ceil((total?.total ?? 0) / perPage) } });
});

// Summary stats
app.get('/stats', async (c) => {
  const stats = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM automation_rules WHERE is_active = 1) as active_rules,
      (SELECT COUNT(*) FROM automation_rules) as total_rules,
      (SELECT COUNT(*) FROM email_templates WHERE is_active = 1) as active_templates,
      (SELECT COUNT(*) FROM automation_log WHERE created_at >= date('now', '-7 days')) as runs_last_7d,
      (SELECT COUNT(*) FROM automation_log WHERE status = 'failed' AND created_at >= date('now', '-7 days')) as failures_last_7d
  `).first();
  return c.json({ success: true, data: stats });
});

export default app;
