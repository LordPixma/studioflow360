import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api.ts';
import type { StaffContext } from '../types.ts';
import type { Permission } from '@studioflow360/shared';

interface AuthState {
  staff: StaffContext | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthState>({
  staff: null,
  loading: true,
  error: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    staff: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    api
      .get<StaffContext>('/me')
      .then((res) => {
        if (res.success && res.data) {
          setState({ staff: res.data, loading: false, error: null });
        } else {
          setState({ staff: null, loading: false, error: res.error?.message ?? 'Auth failed' });
        }
      })
      .catch((err) => {
        setState({ staff: null, loading: false, error: String(err) });
      });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function usePermission(...permissions: Permission[]): boolean {
  const { staff } = useAuth();
  if (!staff?.permissions) return false;
  return permissions.every((p) => staff.permissions.includes(p));
}
