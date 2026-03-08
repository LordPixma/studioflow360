import type { Permission } from '@studioflow360/shared';

export interface StaffContext {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'staff';
  permissions: Permission[];
  phone_number?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  job_title?: string | null;
}
