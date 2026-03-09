import type { ApiResponse } from '@studioflow360/shared';

const API_BASE = '/api';

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

    const data = await response.json() as Record<string, unknown>;

    // Normalize non-standard error responses (e.g. Zod validation errors from zValidator)
    if (!response.ok && data.success === undefined) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: typeof data.error === 'string' ? data.error : 'Validation failed',
        },
      } as ApiResponse<T>;
    }

    return data as unknown as ApiResponse<T>;
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

  delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async upload<T>(path: string, formData: FormData): Promise<ApiResponse<T>> {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (response.status === 401) {
      window.location.reload();
      throw new Error('Unauthorized');
    }

    const data = await response.json() as Record<string, unknown>;
    if (!response.ok && data.success === undefined) {
      return { success: false, error: { code: 'UPLOAD_ERROR', message: typeof data.error === 'string' ? data.error : 'Upload failed' } } as ApiResponse<T>;
    }
    return data as unknown as ApiResponse<T>;
  }
}

export const api = new ApiClient();
