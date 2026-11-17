import { createApiClient } from '@invest/api-client';
import type { TokenPair } from '@invest/shared';
import { secure } from '../state/secure';
import { useSession } from '../state/session';

/**
 * Set EXPO_PUBLIC_API_URL to the API on your network, e.g. http://192.168.1.10:3000.
 * A phone cannot reach "localhost" on the computer.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api = createApiClient({
  baseUrl: API_URL,
  getAccessToken: () => useSession.getState().accessToken,
});

export interface ApiProblem {
  status: number;
  code?: string;
  retryAfter?: number;
}

export function asProblem(error: unknown, status: number): ApiProblem {
  const body = (error ?? {}) as Partial<ApiProblem>;
  return { status, code: body.code, retryAfter: body.retryAfter };
}

let refreshing: Promise<boolean> | null = null;

/**
 * Exchanges the stored refresh token for a new pair. Concurrent callers share one request,
 * because the server treats a second use of the same token as theft.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const refreshToken = await secure.get('refreshToken');
      if (!refreshToken) return false;
      const { data } = await api.POST('/v1/auth/refresh', { body: { refreshToken } });
      if (!data) {
        await useSession.getState().signOut();
        return false;
      }
      const pair = data as TokenPair;
      await secure.set('refreshToken', pair.refreshToken);
      useSession.getState().setAccessToken(pair.accessToken);
      return true;
    } catch {
      return false; // offline: keep the session, retry later
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}
