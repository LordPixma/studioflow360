import { Hono } from 'hono';
import { UploadDocumentSchema, UpdateDocumentSchema } from '@studioflow360/shared';
import type { Env, StaffContext } from '../types.js';

type DocEnv = { Bindings: Env; Variables: { staff: StaffContext } };

const app = new Hono<DocEnv>();

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// GET / — list documents
app.get('/', async (c) => {
  const { category, booking_id, guest_id, contract_id, task_id, room_id, search, page: pg, per_page: pp } = c.req.query();
  const page = Math.max(1, Number(pg) || 1);
  const perPage = Math.min(100, Math.max(1, Number(pp) || 50));

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (category) { conditions.push('d.category = ?'); params.push(category); }
  if (booking_id) { conditions.push('d.booking_id = ?'); params.push(booking_id); }
  if (guest_id) { conditions.push('d.guest_id = ?'); params.push(guest_id); }
  if (contract_id) { conditions.push('d.contract_id = ?'); params.push(contract_id); }
  if (task_id) { conditions.push('d.task_id = ?'); params.push(task_id); }
  if (room_id) { conditions.push('d.room_id = ?'); params.push(room_id); }
  if (search) { conditions.push('(d.original_filename LIKE ? OR d.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM documents d ${where}`).bind(...params).first<{ total: number }>();
  const total = countRow?.total ?? 0;

  const results = await c.env.DB.prepare(`
    SELECT d.*, s.display_name as uploaded_by_name
    FROM documents d
    LEFT JOIN staff_users s ON d.uploaded_by = s.id
    ${where}
    ORDER BY d.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, perPage, (page - 1) * perPage).all();

  return c.json({
    success: true,
    data: results.results,
    pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  });
});

// GET /summary — document stats
app.get('/summary', async (c) => {
  const stats = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total_documents,
      SUM(file_size) as total_size,
      COUNT(DISTINCT category) as category_count
    FROM documents
  `).first();
  const byCat = await c.env.DB.prepare(`
    SELECT category, COUNT(*) as count FROM documents GROUP BY category ORDER BY count DESC
  `).all();
  return c.json({ success: true, data: { ...stats, by_category: byCat.results } });
});

// GET /:id — document detail
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const doc = await c.env.DB.prepare(`
    SELECT d.*, s.display_name as uploaded_by_name
    FROM documents d
    LEFT JOIN staff_users s ON d.uploaded_by = s.id
    WHERE d.id = ?
  `).bind(id).first();
  if (!doc) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
  return c.json({ success: true, data: doc });
});

// GET /:id/download — download file from R2
app.get('/:id/download', async (c) => {
  const id = c.req.param('id');
  const doc = await c.env.DB.prepare('SELECT r2_key, original_filename, mime_type FROM documents WHERE id = ?').bind(id).first<{ r2_key: string; original_filename: string; mime_type: string }>();
  if (!doc) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);

  const object = await c.env.EMAIL_ARCHIVE.get(doc.r2_key);
  if (!object) return c.json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found in storage' } }, 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': doc.mime_type,
      'Content-Disposition': `attachment; filename="${doc.original_filename}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

// POST / — upload document (multipart form data)
app.post('/', async (c) => {
  const staff = c.get('staff');
  const formData = await c.req.formData();

  const file = formData.get('file') as unknown as { name: string; size: number; type: string; stream: () => ReadableStream; arrayBuffer: () => Promise<ArrayBuffer> } | null;
  if (!file || typeof file === 'string') {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'File is required' } }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'File must be under 25MB' } }, 400);
  }

  // Parse metadata from form fields
  const metaStr = formData.get('metadata');
  let meta: Record<string, unknown> = {};
  if (metaStr && typeof metaStr === 'string') {
    try { meta = JSON.parse(metaStr); } catch { /* ignore */ }
  }

  const parsed = UploadDocumentSchema.safeParse(meta);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);
  }

  const data = parsed.data;
  const id = crypto.randomUUID();
  const ext = file.name.split('.').pop() || 'bin';
  const filename = `${id}.${ext}`;
  const r2Key = `documents/${data.category ?? 'other'}/${new Date().toISOString().split('T')[0]}/${filename}`;

  // Upload to R2
  await c.env.EMAIL_ARCHIVE.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { originalFilename: file.name, uploadedBy: staff.id },
  });

  // Insert DB record
  await c.env.DB.prepare(`
    INSERT INTO documents (id, filename, original_filename, mime_type, file_size, r2_key, category, description, booking_id, guest_id, contract_id, task_id, asset_id, room_id, tags, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, filename, file.name, file.type || 'application/octet-stream', file.size, r2Key,
    data.category ?? 'other', data.description ?? null,
    data.booking_id ?? null, data.guest_id ?? null, data.contract_id ?? null,
    data.task_id ?? null, data.asset_id ?? null, data.room_id ?? null,
    JSON.stringify(data.tags ?? []), staff.id,
  ).run();

  return c.json({ success: true, data: { id, filename, r2_key: r2Key } }, 201);
});

// PATCH /:id — update document metadata
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateDocumentSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join(', ') } }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM documents WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);

  const data = parsed.data;
  const sets: string[] = ['updated_at = datetime(\'now\')'];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'tags') {
      sets.push('tags = ?');
      params.push(JSON.stringify(value));
    } else {
      sets.push(`${key} = ?`);
      params.push(value ?? null);
    }
  }

  params.push(id);
  await c.env.DB.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  return c.json({ success: true, data: { id } });
});

// DELETE /:id — delete document
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const doc = await c.env.DB.prepare('SELECT id, r2_key FROM documents WHERE id = ?').bind(id).first<{ id: string; r2_key: string }>();
  if (!doc) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);

  // Delete from R2
  await c.env.EMAIL_ARCHIVE.delete(doc.r2_key);
  // Delete from DB
  await c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();

  return c.json({ success: true });
});

export default app;
