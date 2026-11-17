import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';

export type { components, paths } from './schema';

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current access token, or null when logged out. */
  getAccessToken: () => Promise<string | null> | string | null;
}

/** Typed client for the /v1 API, generated from apps/api/openapi.json. */
export function createApiClient({ baseUrl, getAccessToken }: ApiClientOptions) {
  const client = createClient<paths>({ baseUrl });
  const auth: Middleware = {
    async onRequest({ request }) {
      const token = await getAccessToken();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      return request;
    },
  };
  client.use(auth);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
