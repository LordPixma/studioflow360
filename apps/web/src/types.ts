export interface StaffContext {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'staff';
}
