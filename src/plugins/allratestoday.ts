import { makeHttp } from '../http';
import type { PluginOptions, RatePair, RatePlugin } from '../types';

interface LiveRate {
  rate: number;
  source: string;
  target: string;
  time: string;
}

/**
 * Live mid-market rates from `GET /api/v1/rates`. Needs an API key (the free
 * tier needs no card). Answers only undated hints; dated hints are
 * left for the reference-rate or central-bank plugins.
 */
export const makeAllRatesTodayPlugin = (options: PluginOptions = {}): RatePlugin => {
  const http = makeHttp(options);
  return {
    rateInfo: {
      pluginId: 'allratestoday',
      displayName: 'AllRatesToday live mid-market',
      keyless: false,
      homepage: 'https://allratestoday.com/docs/',
    },
    async fetchRates(hints) {
      if (!http.hasKey) return [];
      const bySource = new Map<string, Set<string>>();
      for (const h of hints) {
        if (h.date) continue;
        const from = h.fromCurrency.toUpperCase();
        const to = h.toCurrency.toUpperCase();
        if (from === to) continue;
        const set = bySource.get(from) ?? new Set<string>();
        set.add(to);
        bySource.set(from, set);
      }
      const out: RatePair[] = [];
      await Promise.all(
        [...bySource].map(async ([source, targets]) => {
          let raw: unknown;
          try {
            raw = await http.getJson('/api/v1/rates', { source, target: [...targets].join(',') }, true);
          } catch {
            return;
          }
          const rows: LiveRate[] = Array.isArray(raw) ? raw : raw ? [raw as LiveRate] : [];
          for (const r of rows) {
            if (typeof r?.rate !== 'number' || !r.target) continue;
            out.push({
              fromCurrency: source,
              toCurrency: r.target.toUpperCase(),
              rate: r.rate,
              date: (r.time ?? new Date().toISOString()).slice(0, 10),
              pluginId: 'allratestoday',
              rateType: 'mid-market',
              method: 'published',
            });
          }
        }),
      );
      for (const h of hints) {
        if (h.date) continue;
        const from = h.fromCurrency.toUpperCase();
        if (from === h.toCurrency.toUpperCase()) {
          out.push({ fromCurrency: from, toCurrency: from, rate: 1, date: new Date().toISOString().slice(0, 10), pluginId: 'allratestoday', rateType: 'mid-market', method: 'published' });
        }
      }
      return out;
    },
  };
};
