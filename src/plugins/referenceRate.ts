import { makeHttp } from '../http';
import { answerFromTable, groupByDate, type TableRow } from '../table';
import type { PluginOptions, RatePair, RatePlugin } from '../types';

interface ReferenceResponse {
  rate_date: string;
  base: string;
  rates: Array<{ base: string; quote: string; value: number }>;
}

/**
 * The AllRatesToday daily reference rate: one USD-based table a day, fixed at
 * 16:00 London. The latest table is keyless (`/api/open/reference-rate`);
 * dated tables (`/api/v1/reference-rate/{date}`) need an API key. Any pair is
 * crossed through USD.
 */
export const makeReferenceRatePlugin = (options: PluginOptions = {}): RatePlugin => {
  const http = makeHttp(options);
  const toRows = (r: ReferenceResponse): TableRow[] =>
    r.rates.map((x) => ({ base: x.base, quote: x.quote, value: x.value, type: 'reference' }));
  return {
    rateInfo: {
      pluginId: 'referenceRate',
      displayName: 'AllRatesToday daily reference rate (16:00 London)',
      keyless: true,
      homepage: 'https://allratestoday.com/reference-rate/',
    },
    async fetchRates(hints) {
      const out: RatePair[] = [];
      await Promise.all(
        [...groupByDate(hints)].map(async ([date, group]) => {
          let raw: ReferenceResponse;
          try {
            raw = (
              date
                ? await http.getJson(`/api/v1/reference-rate/${date}`, {}, true)
                : await http.getJson('/api/open/reference-rate')
            ) as ReferenceResponse;
          } catch {
            return;
          }
          if (!raw?.rates?.length) return;
          out.push(...answerFromTable(toRows(raw), group, raw.rate_date, 'referenceRate', 'reference'));
        }),
      );
      return out;
    },
  };
};
