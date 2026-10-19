import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
  },
  {
    // Self-registering browser bundle, see README "Browser".
    entry: { 'allratestoday-exchange-plugins': 'src/browser.ts' },
    format: ['iife'],
    globalName: 'allratestodayExchangePlugins',
    minify: true,
    sourcemap: true,
    target: 'es2020',
  },
]);
