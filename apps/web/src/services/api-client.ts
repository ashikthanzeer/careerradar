import { localStore } from '@/lib/storage';

export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  authBaseUrl: (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/v1\/?$/, '') + '/auth',
  dataMode: (import.meta.env.VITE_DATA_MODE || 'hybrid') as 'mock' | 'api' | 'hybrid',
};

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 500, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit,
  customBaseUrl?: string
): Promise<T> {
  const session = localStore.getAuthSession();
  const authHeader: Record<string, string> = session?.accessToken
    ? { Authorization: `Bearer ${session.accessToken}` }
    : {};

  const targetBase = customBaseUrl ?? API_CONFIG.baseUrl;
  const response = await fetch(`${targetBase}${endpoint}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...((options?.headers as Record<string, string>) ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.error?.message) {
        message = errBody.error.message;
      }
    } catch {
      // Fallback to status message
    }
    throw new ApiClientError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
