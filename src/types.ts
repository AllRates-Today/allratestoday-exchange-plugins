/**
 * One rate request. `date` is `YYYY-MM-DD`; omit it for the latest rate.
 */
export interface RateHint {
  fromCurrency: string;
  toCurrency: string;
  date?: string;
}

/** How the number was produced by the plugin that answered. */
export type RateMethod = 'published' | 'inverse' | 'cross';

export interface RatePair {
  fromCurrency: string;
  toCurrency: string;
  /** Units of `toCurrency` per 1 `fromCurrency`. */
  rate: number;
  /** The date the rate is for (`YYYY-MM-DD`). */
  date: string;
  /** `pluginId` of the plugin that answered. */
  pluginId: string;
  /** `mid-market` for live rates, otherwise the institution's own label (`reference`, `official`, ...). */
  rateType: string;
  method: RateMethod;
}

export interface RateInfo {
  /** Stable identifier, also used as the key when registering plugins. */
  pluginId: string;
  displayName: string;
  /** True when the plugin works without an API key. */
  keyless: boolean;
  homepage: string;
}

export interface RatePlugin {
  rateInfo: RateInfo;
  /**
   * Answer as many hints as this plugin can. Hints it cannot answer are
   * simply left out of the result (never throw for a missing pair), so an
   * engine can fall through to the next plugin.
   */
  fetchRates: (hints: RateHint[]) => Promise<RatePair[]>;
}

export interface PluginOptions {
  /** AllRatesToday API key. Optional for keyless plugins. */
  apiKey?: string;
  /** Override the API origin (default `https://allratestoday.com`). */
  baseUrl?: string;
  /** Custom fetch, for tests or runtimes without a global fetch. */
  fetch?: typeof fetch;
  /** Abort a request after this many milliseconds (default 10000). */
  timeoutMs?: number;
}

export type RatePluginFactory = (options?: PluginOptions) => RatePlugin;
