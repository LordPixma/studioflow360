import { Hono } from 'hono';
import type { Env, StaffContext } from '../types.js';

type StaffEnv = {
  Bindings: Env;
  Variables: { staff: StaffContext };
};

const staff = new Hono<StaffEnv>();

// GET /api/staff - List staff users (admin only)
staff.get('/', async (c) => {
  const results = await c.env.DB.prepare(
    'SELECT id, access_email, display_name, role, active, created_at FROM staff_users ORDER BY display_name',
  ).all();

  return c.json({ success: true, data: results.results });
});

// GET /api/me - Authenticated staff profile
staff.get('/me', async (c) => {
  const staffUser = c.get('staff');
  return c.json({ success: true, data: staffUser });
});

export default staff;
