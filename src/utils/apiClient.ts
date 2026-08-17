/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from '../lib/firebase';

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
}

const CLAIM_REFRESH_CODE = 'TOKEN_CLAIMS_REFRESH_REQUIRED';

async function refreshTokenAndRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  response: Response,
): Promise<Response> {
  if (!auth.currentUser || response.status !== 403) return response;

  let payload: any = null;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  if (payload?.code !== CLAIM_REFRESH_CODE) return response;

  try {
    const token = await auth.currentUser.getIdToken(true);
    const retryHeaders = new Headers(init.headers || {});
    retryHeaders.set('Authorization', `Bearer ${token}`);
    retryHeaders.set('Accept', retryHeaders.get('Accept') || 'application/json');

    return await fetch(input, {
      ...init,
      headers: retryHeaders,
    });
  } catch (err) {
    console.error('[API Client Firebase Claims Refresh Error]:', err);
    return response;
  }
}

/**
 * Intercepts all client requests targeting /api/* endpoints,
 * attaches the current Firebase ID token, and provides bounded
 * retries/timeouts plus a single claims-refresh retry when the
 * backend has just synchronized tenant/RBAC custom claims.
 */
export const apiFetch = async (
  input: RequestInfo | URL,
  init?: FetchOptions,
): Promise<Response> => {
  const url = typeof input === 'string'
    ? input
    : (input instanceof URL ? input.href : (input as Request).url || '');

  const isApiRequest = url.startsWith('/api/') || url.includes('/api/');

  if (!isApiRequest) {
    return fetch(input, init);
  }

  const newInit: RequestInit = { ...init };
  const headers = new Headers(newInit.headers || {});

  let token = '';
  if (auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
    } catch (err) {
      console.error('[API Client Firebase Token Retrieval Error]:', err);
    }
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (newInit.body && !headers.has('Content-Type') && typeof newInit.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  newInit.headers = headers;

  const timeoutMs = init?.timeout || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  newInit.signal = controller.signal;

  const maxRetries = init?.retries ?? (newInit.method === 'GET' ? 2 : 0);
  let attempt = 0;
  let response: Response | null = null;
  let lastError: any = null;

  while (attempt <= maxRetries) {
    try {
      response = await fetch(input, newInit);
      clearTimeout(timeoutId);
      break;
    } catch (err: any) {
      lastError = err;
      if (err?.name === 'AbortError') {
        console.warn(`[API Client Timeout] Request to ${url} aborted after ${timeoutMs}ms.`);
        break;
      }

      attempt += 1;
      if (attempt <= maxRetries) {
        const backoffDelay = attempt * 1000;
        console.warn(`[API Client Network Error] Failed attempt ${attempt}/${maxRetries + 1} to fetch ${url}. Retrying in ${backoffDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }

  clearTimeout(timeoutId);

  if (!response) {
    throw lastError || new Error(`Network failure connecting to ${url}`);
  }

  response = await refreshTokenAndRetry(input, newInit, response);

  if (response.status === 401) {
    console.warn('[API Client 401 Unauthorized] Dispatched session expiration trigger.');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth-expired'));
    }
  }

  return response;
};
