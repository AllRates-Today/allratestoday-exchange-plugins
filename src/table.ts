import type { RateHint, RateMethod, RatePair } from './types';

/** One row of a published table: `value` units of `quote` per 1 `base`. */
export interface TableRow {
  base: string;
  quote: string;
  value: number;
  type: string;
}

const round = (n: number): number => Number(n.toPrecision(12));

/**
 * Resolve a pair from a full table: direct row, inverted row, or a cross
 * through a currency both sides are quoted against. Returns null when the
 * table does not cover the pair.
 */
export function resolvePair(
  rows: TableRow[],
  from: string,
  to: string,
): { rate: number; method: RateMethod; type: string } | null {
  if (from === to) return { rate: 1, method: 'published', type: rows[0]?.type ?? 'reference' };
  const direct = rows.find((r) => r.base === from && r.quote === to && r.value > 0);
  if (direct) return { rate: direct.value, method: 'published', type: direct.type };
  const inverse = rows.find((r) => r.base === to && r.quote === from && r.value > 0);
  if (inverse) return { rate: round(1 / inverse.value), method: 'inverse', type: inverse.type };

  // Cross: find a base B with rows B->from and B->to (the usual table shape),
  // or any mix of directions through B.
  const perBase = new Map<string, number>(); // B -> units of `from` per 1 B
  const perBaseTo = new Map<string, number>(); // B -> units of `to` per 1 B
  for (const r of rows) {
    if (r.value <= 0) continue;
    if (r.quote === from) perBase.set(r.base, r.value);
    if (r.base === from) perBase.set(r.quote, round(1 / r.value));
    if (r.quote === to) perBaseTo.set(r.base, r.value);
    if (r.base === to) perBaseTo.set(r.quote, round(1 / r.value));
  }
  for (const [b, fromPerB] of perBase) {
    const toPerB = perBaseTo.get(b);
    if (toPerB !== undefined) {
      const type = rows.find((r) => r.base === b || r.quote === b)?.type ?? 'reference';
      return { rate: round(toPerB / fromPerB), method: 'cross', type };
    }
  }
  return null;
}

export function answerFromTable(
  rows: TableRow[],
  hints: RateHint[],
  date: string,
  pluginId: string,
  rateType?: string,
): RatePair[] {
  const out: RatePair[] = [];
  for (const h of hints) {
    const from = h.fromCurrency.toUpperCase();
    const to = h.toCurrency.toUpperCase();
    const hit = resolvePair(rows, from, to);
    if (!hit) continue;
    out.push({
      fromCurrency: from,
      toCurrency: to,
      rate: hit.rate,
      date,
      pluginId,
      rateType: rateType ?? hit.type,
      method: hit.method,
    });
  }
  return out;
}

/** Group hints by requested date; `''` holds the "latest" hints. */
export function groupByDate(hints: RateHint[]): Map<string, RateHint[]> {
  const m = new Map<string, RateHint[]>();
  for (const h of hints) {
    const key = h.date ?? '';
    const list = m.get(key) ?? [];
    list.push(h);
    m.set(key, list);
  }
  return m;
}
