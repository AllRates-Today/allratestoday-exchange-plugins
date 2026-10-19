import { makeHttp } from '../http';
import { answerFromTable, groupByDate, type TableRow } from '../table';
import type { PluginOptions, RatePair, RatePlugin } from '../types';

interface TableResponse {
  bank: string;
  rate_date: string;
  rates: Array<{ base: string; quote: string; type: string; value: number }>;
}

/**
 * Official exchange-rate tables published by a central bank or tax authority,
 * served by AllRatesToday. The latest table is keyless
 * (`/api/open/central-bank/{bank}`); dated tables
 * (`/api/v1/central-bank/{bank}/{date}`) need a paid key. Pairs the
 * institution does not publish directly are inverted or crossed through its
 * home currency, and the answer says so in `method`.
 *
 * `bank` is an AllRatesToday source code, e.g. `ecb`, `boe`, `rbi`, `hmrc`.
 * The full list is `GET https://allratestoday.com/api/open/central-banks`.
 */
/** Tax authorities live under a different page base on allratestoday.com. */
const TAX_AUTHORITIES = new Set(['hmrc', 'bazg', 'ustreasury']);

export const makeCentralBankPlugin = (bank: string, options: PluginOptions = {}): RatePlugin => {
  const code = bank.toLowerCase();
  const pageBase = TAX_AUTHORITIES.has(code) ? 'tax-authority-rates-api' : 'central-bank-rates-api';
  const http = makeHttp(options);
  const toRows = (r: TableResponse): TableRow[] =>
    r.rates.map((x) => ({ base: x.base, quote: x.quote, value: x.value, type: x.type }));
  return {
    rateInfo: {
      pluginId: code,
      displayName: `Official rates: ${code.toUpperCase()}`,
      keyless: true,
      homepage: `https://allratestoday.com/${pageBase}/${code}/`,
    },
    async fetchRates(hints) {
      const out: RatePair[] = [];
      await Promise.all(
        [...groupByDate(hints)].map(async ([date, group]) => {
          let raw: TableResponse;
          try {
            raw = (
              date
                ? await http.getJson(`/api/v1/central-bank/${code}/${date}`, {}, true)
                : await http.getJson(`/api/open/central-bank/${code}`)
            ) as TableResponse;
          } catch {
            return;
          }
          if (!raw?.rates?.length) return;
          out.push(...answerFromTable(toRows(raw), group, raw.rate_date, code));
        }),
      );
      return out;
    },
  };
};

/**
 * Source codes served by AllRatesToday on 2026-10-19 (125). `composite` is the
 * cross-bank USD table. Refresh with `GET /api/open/central-banks`.
 */
export const CENTRAL_BANK_CODES = [
  'amcm', 'bam', 'banguat', 'banxico', 'bazg', 'bb', 'bcb', 'bcbol', 'bcc', 'bcch', 'bccr', 'bccu', 'bceao', 'bch',
  'bcm', 'bcn', 'bcp', 'bcra', 'bcrd', 'bcrp', 'bcstp', 'bct', 'bcu', 'bcv', 'bda', 'bdi', 'bdm', 'beac', 'bfm', 'bi',
  'bmu', 'bna', 'bnb', 'bnm', 'bnr', 'bnrw', 'boa', 'bob', 'boc', 'boe', 'bog', 'bogy', 'boi', 'boj', 'bojm', 'bok',
  'bol', 'bom', 'bon', 'bot', 'botz', 'bou', 'boz', 'brh', 'bsl', 'bsp', 'cba', 'cbar', 'cbb', 'cbbd', 'cbbh', 'cbbz',
  'cbc', 'cbe', 'cbg', 'cbi', 'cbiq', 'cbj', 'cbk', 'cbke', 'cbl', 'cbm', 'cbn', 'cbo', 'cbr', 'cbsl', 'cbt', 'cbtt',
  'cbu', 'cbuae', 'cbvs', 'cnb', 'composite', 'dnb', 'ecb', 'fed', 'hkma', 'hmrc', 'lb', 'mas', 'mma', 'mnb', 'nbc',
  'nbe', 'nbg', 'nbk', 'nbkr', 'nbm', 'nbp', 'nbrb', 'nbrm', 'nbs', 'nbt', 'nbu', 'norges', 'nrb', 'pboc', 'pma',
  'qcb', 'rba', 'rbf', 'rbi', 'rbm', 'rbnz', 'rbz', 'riksbank', 'rma', 'sama', 'sarb', 'sbp', 'sbv', 'sfc', 'snb',
  'tcmb', 'ustreasury',
] as const;

export type CentralBankCode = (typeof CENTRAL_BANK_CODES)[number];

/** One factory per source, keyed by code: `centralBanks.ecb()`, `centralBanks.boe()`, ... */
export const centralBanks = Object.fromEntries(
  CENTRAL_BANK_CODES.map((code) => [code, (options?: PluginOptions) => makeCentralBankPlugin(code, options)]),
) as Record<CentralBankCode, (options?: PluginOptions) => RatePlugin>;
