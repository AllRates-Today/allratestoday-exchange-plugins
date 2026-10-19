import { makeAllRatesTodayPlugin } from './plugins/allratestoday';
import { centralBanks, makeCentralBankPlugin } from './plugins/centralBank';
import { makeReferenceRatePlugin } from './plugins/referenceRate';
import type { PluginOptions, RatePlugin } from './types';

export * from './types';
export { ExchangePluginError, DEFAULT_BASE_URL } from './http';
export { resolvePair, answerFromTable } from './table';
export type { TableRow } from './table';
export { makeRateEngine } from './engine';
export type { RateEngine } from './engine';
export { makeAllRatesTodayPlugin } from './plugins/allratestoday';
export { makeReferenceRatePlugin } from './plugins/referenceRate';
export { makeCentralBankPlugin, centralBanks, CENTRAL_BANK_CODES } from './plugins/centralBank';
export type { CentralBankCode } from './plugins/centralBank';

/**
 * Every plugin factory in this package, keyed by pluginId. Mirrors the
 * `plugins` export of edge-exchange-plugins: pick the ones you want, or
 * register them all.
 */
export const plugins = {
  // Live:
  allratestoday: makeAllRatesTodayPlugin,
  // Daily reference:
  referenceRate: makeReferenceRatePlugin,
  // Official tables (125 sources):
  ...centralBanks,
};

export type PluginId = keyof typeof plugins;

/**
 * Instantiate a set of plugins with shared options. Pass ids in preference
 * order; the result is ready for `makeRateEngine`.
 */
export function makePlugins(ids: PluginId[], options: PluginOptions = {}): RatePlugin[] {
  return ids.map((id) => {
    const factory = plugins[id];
    if (!factory) throw new Error(`Unknown plugin: ${id}`);
    return factory(options);
  });
}

/** The recommended default stack: live when a key is set, then reference rate, then the composite table. */
export function makeDefaultPlugins(options: PluginOptions = {}): RatePlugin[] {
  const list: RatePlugin[] = [];
  if (options.apiKey) list.push(makeAllRatesTodayPlugin(options));
  list.push(makeReferenceRatePlugin(options), makeCentralBankPlugin('composite', options));
  return list;
}

export default plugins;
