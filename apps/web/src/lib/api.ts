import type { ApiResponse } from '@studioflow360/shared';

const API_BASE = import.meta.env.PROD ? 'https://api.studiomgr360.com/api' : '/api';

class ApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${API_BASE}${path}`;

    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) ?? {}),
    };

    if (options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (response.status === 401) {
      window.location.reload();
      throw new Error('Unauthorized');
    }

    return response.json() as Promise<ApiResponse<T>>;
  }

  get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }
}

export const api = new ApiClient();
