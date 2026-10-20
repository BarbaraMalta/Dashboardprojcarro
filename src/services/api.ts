/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiResponse } from '../types';

/**
 * Base API URL configured via environment variable VITE_API_URL
 * Defaults to '/api' for production proxying or local backend.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string) || '/api';

/**
 * Data source mode: 'mock' or 'api'
 * Configured via VITE_DATA_SOURCE
 */
export const DATA_SOURCE_MODE: string =
  (import.meta.env.VITE_DATA_SOURCE as string) || 'mock';

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Centralized HTTP request helper
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      throw new ApiError(
        (isJson && data?.message) || `Erro ${response.status}: Falha na requisição ao backend`,
        response.status,
        data
      );
    }

    // Standardize ApiResponse wrapper if backend returns raw data or wrapped data
    if (data && typeof data === 'object' && 'data' in data) {
      return data as ApiResponse<T>;
    }

    return {
      success: true,
      data: data as T,
    };
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Tempo de resposta do backend esgotado (timeout).'
          : err.message
        : 'Erro desconhecido de rede ou backend indisponível.';

    throw new ApiError(message, 0);
  }
}
