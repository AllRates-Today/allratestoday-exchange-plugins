import * as api from './index';

/**
 * Browser bundle. Loading `dist/allratestoday-exchange-plugins.global.js` exposes
 * `window.allratestodayExchangePlugins` and, if the page defined
 * `window.addAllRatesTodayPlugins` before the script ran, calls it with the
 * plugin map (the same hand-off edge-exchange-plugins makes to edge-core-js).
 */
declare global {
  interface Window {
    addAllRatesTodayPlugins?: (plugins: typeof api.plugins) => void;
  }
}

if (typeof window !== 'undefined' && typeof window.addAllRatesTodayPlugins === 'function') {
  window.addAllRatesTodayPlugins(api.plugins);
}

export * from './index';
