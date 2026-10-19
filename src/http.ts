import type { PluginOptions } from './types';

export const DEFAULT_BASE_URL = 'https://allratestoday.com';

export class ExchangePluginError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ExchangePluginError';
    this.status = status;
    this.body = body;
  }
}

export interface Http {
  getJson: (path: string, params?: Record<string, string>, requireKey?: boolean) => Promise<unknown>;
  hasKey: boolean;
}

export function makeHttp(options: PluginOptions = {}): Http {
  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('No fetch available: pass { fetch } in the plugin options');
  }
  const timeoutMs = options.timeoutMs ?? 10_000;
  const apiKey = options.apiKey;

  return {
    hasKey: typeof apiKey === 'string' && apiKey.length > 0,
    async getJson(path, params = {}, requireKey = false) {
      if (requireKey && !apiKey) {
        throw new ExchangePluginError(`${path} needs an API key`, 401, null);
      }
      const url = new URL(base + path);
      for (const [k, v] of Object.entries(params)) if (v !== '') url.searchParams.set(k, v);
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': '@allratestoday/exchange-plugins',
      };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
      try {
        const res = await doFetch(url.toString(), { headers, signal: controller?.signal });
        const text = await res.text();
        let body: unknown = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = text;
        }
        if (!res.ok) {
          const msg =
            body && typeof body === 'object' && 'error' in body
              ? String((body as { error: unknown }).error)
              : `HTTP ${res.status}`;
          throw new ExchangePluginError(msg, res.status, body);
        }
        return body;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
