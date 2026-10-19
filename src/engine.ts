import type { RateHint, RatePair, RatePlugin } from './types';

export interface RateEngine {
  readonly plugins: RatePlugin[];
  /** Ask each plugin in order; a hint answered by an earlier plugin is not asked again. */
  fetchRates: (hints: RateHint[]) => Promise<RatePair[]>;
  /** One pair, or null when no plugin covers it. */
  getRate: (fromCurrency: string, toCurrency: string, date?: string) => Promise<RatePair | null>;
  /** Convert an amount; throws when no plugin covers the pair. */
  convert: (amount: number, fromCurrency: string, toCurrency: string, date?: string) => Promise<{ amount: number; result: number; pair: RatePair }>;
}

const key = (h: RateHint): string =>
  `${h.fromCurrency.toUpperCase()}_${h.toCurrency.toUpperCase()}_${h.date ?? ''}`;

/**
 * Ordered fallback over plugins. Pass the plugins in preference order, e.g.
 * live first, then the daily reference rate, then an official table.
 */
export function makeRateEngine(plugins: RatePlugin[] | Record<string, RatePlugin>): RateEngine {
  const list = Array.isArray(plugins) ? plugins : Object.values(plugins);
  return {
    plugins: list,
    async fetchRates(hints) {
      const answered = new Map<string, RatePair>();
      let remaining = hints.slice();
      for (const plugin of list) {
        if (remaining.length === 0) break;
        let pairs: RatePair[] = [];
        try {
          pairs = await plugin.fetchRates(remaining);
        } catch {
          continue;
        }
        for (const p of pairs) {
          const k = `${p.fromCurrency}_${p.toCurrency}_`;
          // Match on the requested date, not the answered one (weekends
          // resolve to the previous business day).
          for (const h of remaining) {
            if (key(h).startsWith(k) && !answered.has(key(h))) answered.set(key(h), p);
          }
        }
        remaining = remaining.filter((h) => !answered.has(key(h)));
      }
      return hints.map((h) => answered.get(key(h))).filter((p): p is RatePair => p != null);
    },
    async getRate(fromCurrency, toCurrency, date) {
      const [pair] = await this.fetchRates([{ fromCurrency, toCurrency, date }]);
      return pair ?? null;
    },
    async convert(amount, fromCurrency, toCurrency, date) {
      const pair = await this.getRate(fromCurrency, toCurrency, date);
      if (!pair) throw new Error(`No plugin covers ${fromCurrency}/${toCurrency}${date ? ` on ${date}` : ''}`);
      return { amount, result: Number((amount * pair.rate).toPrecision(12)), pair };
    },
  };
}
