import { describe, expect, it, vi } from 'vitest';

import {
  makeAllRatesTodayPlugin,
  makeCentralBankPlugin,
  makeRateEngine,
  makeReferenceRatePlugin,
  plugins,
  resolvePair,
} from '../src/index';

const ecbTable = {
  bank: 'ecb',
  rate_date: '2026-10-16',
  rates: [
    { base: 'EUR', quote: 'USD', type: 'reference', value: 1.17 },
    { base: 'EUR', quote: 'GBP', type: 'reference', value: 0.84 },
    { base: 'EUR', quote: 'JPY', type: 'reference', value: 176.5 },
  ],
};

const reference = {
  rate_date: '2026-10-15',
  base: 'USD',
  rates: [
    { base: 'USD', quote: 'EUR', value: 0.855 },
    { base: 'USD', quote: 'GBP', value: 0.72 },
  ],
};

function mockFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const hit = routes[u.pathname];
    if (!hit) return new Response(JSON.stringify({ error: 'not mocked ' + u.pathname }), { status: 404 });
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
  return fn as unknown as typeof fetch & { mock: { calls: Array<[string, RequestInit]> } };
}

describe('resolvePair', () => {
  const rows = ecbTable.rates;
  it('direct', () => expect(resolvePair(rows, 'EUR', 'USD')).toEqual({ rate: 1.17, method: 'published', type: 'reference' }));
  it('inverse', () => expect(resolvePair(rows, 'USD', 'EUR')?.method).toBe('inverse'));
  it('cross through the home currency', () => {
    const r = resolvePair(rows, 'USD', 'GBP');
    expect(r?.method).toBe('cross');
    expect(r?.rate).toBeCloseTo(0.84 / 1.17, 10);
  });
  it('identity', () => expect(resolvePair(rows, 'EUR', 'EUR')?.rate).toBe(1));
  it('uncovered', () => expect(resolvePair(rows, 'USD', 'ZAR')).toBeNull());
});

describe('central-bank plugin', () => {
  it('answers from the keyless table and names the method', async () => {
    const fetch = mockFetch({ '/api/open/central-bank/ecb': { body: ecbTable } });
    const ecb = makeCentralBankPlugin('ecb', { fetch });
    const pairs = await ecb.fetchRates([
      { fromCurrency: 'eur', toCurrency: 'usd' },
      { fromCurrency: 'USD', toCurrency: 'GBP' },
      { fromCurrency: 'USD', toCurrency: 'ZAR' },
    ]);
    expect(pairs.map((p) => [p.fromCurrency, p.toCurrency, p.method, p.date])).toEqual([
      ['EUR', 'USD', 'published', '2026-10-16'],
      ['USD', 'GBP', 'cross', '2026-10-16'],
    ]);
    expect(pairs[0].pluginId).toBe('ecb');
    expect(fetch.mock.calls).toHaveLength(1);
  });

  it('skips dated hints without a key instead of throwing', async () => {
    const fetch = mockFetch({ '/api/open/central-bank/ecb': { body: ecbTable } });
    const ecb = makeCentralBankPlugin('ecb', { fetch });
    const pairs = await ecb.fetchRates([{ fromCurrency: 'EUR', toCurrency: 'USD', date: '2026-10-01' }]);
    expect(pairs).toEqual([]);
    expect(fetch.mock.calls).toHaveLength(0);
  });

  it('uses the dated endpoint with a Bearer key', async () => {
    const fetch = mockFetch({ '/api/v1/central-bank/ecb/2026-10-01': { body: { ...ecbTable, rate_date: '2026-10-01' } } });
    const ecb = makeCentralBankPlugin('ecb', { fetch, apiKey: 'k' });
    const [p] = await ecb.fetchRates([{ fromCurrency: 'EUR', toCurrency: 'USD', date: '2026-10-01' }]);
    expect(p.date).toBe('2026-10-01');
    expect((fetch.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe('Bearer k');
  });

  it('exposes one factory per source code', () => {
    expect(typeof plugins.ecb).toBe('function');
    expect(typeof plugins.hmrc).toBe('function');
    expect(plugins.boe().rateInfo.pluginId).toBe('boe');
  });
});

describe('reference-rate plugin', () => {
  it('crosses through USD', async () => {
    const fetch = mockFetch({ '/api/open/reference-rate': { body: reference } });
    const [p] = await makeReferenceRatePlugin({ fetch }).fetchRates([{ fromCurrency: 'EUR', toCurrency: 'GBP' }]);
    expect(p.rate).toBeCloseTo(0.72 / 0.855, 10);
    expect(p.rateType).toBe('reference');
    expect(p.date).toBe('2026-10-15');
  });
});

describe('live plugin', () => {
  it('returns nothing without a key', async () => {
    const fetch = mockFetch({});
    expect(await makeAllRatesTodayPlugin({ fetch }).fetchRates([{ fromCurrency: 'USD', toCurrency: 'EUR' }])).toEqual([]);
    expect(fetch.mock.calls).toHaveLength(0);
  });
  it('batches targets per source', async () => {
    const fetch = mockFetch({
      '/api/v1/rates': {
        body: [
          { rate: 0.85, source: 'USD', target: 'EUR', time: '2026-10-19T09:00:00Z' },
          { rate: 0.73, source: 'USD', target: 'GBP', time: '2026-10-19T09:00:00Z' },
        ],
      },
    });
    const pairs = await makeAllRatesTodayPlugin({ fetch, apiKey: 'k' }).fetchRates([
      { fromCurrency: 'USD', toCurrency: 'EUR' },
      { fromCurrency: 'USD', toCurrency: 'GBP' },
    ]);
    expect(pairs).toHaveLength(2);
    expect(fetch.mock.calls).toHaveLength(1);
    expect(fetch.mock.calls[0][0]).toContain('target=EUR%2CGBP');
    expect(pairs[0].rateType).toBe('mid-market');
  });
});

describe('engine', () => {
  it('falls through plugins in order', async () => {
    const fetch = mockFetch({
      '/api/open/reference-rate': { body: reference },
      '/api/open/central-bank/ecb': { body: ecbTable },
    });
    const engine = makeRateEngine([makeReferenceRatePlugin({ fetch }), makeCentralBankPlugin('ecb', { fetch })]);
    const pairs = await engine.fetchRates([
      { fromCurrency: 'USD', toCurrency: 'EUR' }, // reference rate
      { fromCurrency: 'EUR', toCurrency: 'JPY' }, // only ECB has JPY
    ]);
    expect(pairs.map((p) => p.pluginId)).toEqual(['referenceRate', 'ecb']);
    const c = await engine.convert(100, 'EUR', 'JPY');
    expect(c.result).toBeCloseTo(17650, 6);
    expect(await engine.getRate('USD', 'ZAR')).toBeNull();
  });
});
