# AllRatesToday Exchange Plugins

[![npm](https://img.shields.io/npm/v/@allratestoday/exchange-plugins.svg)](https://www.npmjs.com/package/@allratestoday/exchange-plugins)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](./tsconfig.json)
[![Sources](https://img.shields.io/badge/official%20sources-125-0a7d3e.svg)](https://allratestoday.com/api/open/central-banks)

This library exports a collection of exchange-rate source plugins for [AllRatesToday](https://allratestoday.com):
live mid-market rates, the daily 16:00 London reference rate, and the official tables of [122 central banks and 4 tax
authorities](https://allratestoday.com/central-bank-rates-api/institutions/). Every source implements one small `RatePlugin` interface, so you can register the ones you
want and fall through them in order. It also ships a drop-in provider for
[edge-rates-server](./adapters/edge-rates-server/).

Please see [src/index.ts](./src/index.ts) for the list of plugins in this repo.

## 🚀 Features

- **One interface, many sources** — `fetchRates(hints)` on every plugin; unanswered pairs are left out, never thrown.
- **Keyless by default** — the reference rate and every central-bank table work without an API key.
- **Live rates with a key** — `allratestoday` adds real-time mid-market rates (free tier, no card).
- **Pairs the institution never published** — inverted or crossed through its home currency, and the answer says which (`method: 'published' | 'inverse' | 'cross'`).
- **Ordered fallback** — `makeRateEngine([...])` asks plugins in order and stops at the first answer per pair.
- **Zero runtime dependencies**, ESM + CommonJS + a self-registering browser bundle, strict TypeScript types.

## 🔑 Get your API key

Keyless plugins need nothing. For live mid-market rates and dated tables, register at
[allratestoday.com/register](https://allratestoday.com/register) (free, no card) and pass `{ apiKey }`.
Agents can issue themselves a 100-call trial key with `POST https://allratestoday.com/api/agent/keys`.

## 📦 Installing

First, add this library to your project:

```sh
npm install @allratestoday/exchange-plugins
```

### Node.js

Build the plugins you want, in preference order, and hand them to an engine:

```js
const { makeRateEngine, plugins } = require('@allratestoday/exchange-plugins')

const engine = makeRateEngine([
  plugins.allratestoday({ apiKey: process.env.ALLRATESTODAY_API_KEY }), // live, needs a key
  plugins.referenceRate(), // daily 16:00 London table, keyless
  plugins.ecb() // official ECB table, keyless
])

const pairs = await engine.fetchRates([
  { fromCurrency: 'USD', toCurrency: 'EUR' },
  { fromCurrency: 'GBP', toCurrency: 'JPY' }
])
// [{ fromCurrency: 'USD', toCurrency: 'EUR', rate: 0.8927, date: '2026-10-15',
//    pluginId: 'referenceRate', rateType: 'reference', method: 'published' }, ...]

const { result } = await engine.convert(100, 'GBP', 'JPY')
```

You can also add plugins individually if you want to be more picky:

```js
const { makeCentralBankPlugin } = require('@allratestoday/exchange-plugins')

const hmrc = makeCentralBankPlugin('hmrc')
const [gbpUsd] = await hmrc.fetchRates([{ fromCurrency: 'GBP', toCurrency: 'USD' }])
```

Or take the recommended stack in one call (live when a key is set, then the reference rate, then the cross-bank composite table):

```js
const { makeRateEngine, makeDefaultPlugins } = require('@allratestoday/exchange-plugins')
const engine = makeRateEngine(makeDefaultPlugins({ apiKey: process.env.ALLRATESTODAY_API_KEY }))
```

### Browser

The bundle at `dist/allratestoday-exchange-plugins.global.js` exposes `window.allratestodayExchangePlugins`.
If the page defines `window.addAllRatesTodayPlugins` before the script loads, the bundle calls it with the
plugin map, so a host app can register the sources without importing anything:

```html
<script>
  window.addAllRatesTodayPlugins = plugins => {
    window.fx = allratestodayExchangePlugins.makeRateEngine([plugins.referenceRate(), plugins.ecb()])
  }
</script>
<script src="https://cdn.jsdelivr.net/npm/@allratestoday/exchange-plugins/dist/allratestoday-exchange-plugins.global.js"></script>
```

### React Native / other runtimes

The package uses the global `fetch`. Pass your own with `{ fetch }` where the runtime has none, and
`{ timeoutMs }` to change the 10 s request timeout.

## 🧩 Plugins

| pluginId | Source | Key | Dates |
|---|---|---|---|
| `allratestoday` | Live mid-market rates, `GET /api/v1/rates` | required | latest only |
| `referenceRate` | AllRatesToday daily reference rate, fixed 16:00 London, USD base | keyless (latest), key for dated | `/api/v1/reference-rate/{date}` |
| `ecb`, `boe`, `fed`, `rbi`, `hmrc`, … (125) | Official tables as published by each institution | keyless (latest), paid key for dated | `/api/v1/central-bank/{bank}/{date}` |
| `composite` | Cross-bank USD table built from the official sources | keyless | latest only |

`CENTRAL_BANK_CODES` lists every source code the package knows; the live list is
[`/api/open/central-banks`](https://allratestoday.com/api/open/central-banks).
`makeCentralBankPlugin(code)` works for any code the API serves, including ones added after this release.

## 📚 API reference

```ts
interface RateHint { fromCurrency: string; toCurrency: string; date?: string } // date = YYYY-MM-DD

interface RatePair {
  fromCurrency: string; toCurrency: string
  rate: number        // units of toCurrency per 1 fromCurrency
  date: string        // the table date actually answered (weekends resolve to the previous business day)
  pluginId: string
  rateType: string    // 'mid-market' | 'reference' | 'official' | ...
  method: 'published' | 'inverse' | 'cross'
}

interface RatePlugin {
  rateInfo: { pluginId: string; displayName: string; keyless: boolean; homepage: string }
  fetchRates(hints: RateHint[]): Promise<RatePair[]>
}

interface PluginOptions { apiKey?: string; baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number }

makeRateEngine(plugins): { fetchRates, getRate(from, to, date?), convert(amount, from, to, date?) }
makePlugins(ids, options)        // instantiate by pluginId, in order
makeDefaultPlugins(options)      // live (if key) → referenceRate → composite
makeCentralBankPlugin(code, options)
resolvePair(rows, from, to)      // the table resolver, exported for your own tables
```

## 🛡️ Error handling

A plugin never throws for a pair it cannot answer; it leaves the pair out so the engine can try the next source.
Network and HTTP failures inside a plugin are swallowed the same way. `ExchangePluginError` (with `status` and
`body`) is exported for code that calls the HTTP layer directly.

| Situation | Result |
|---|---|
| Pair not in the table and not crossable | left out |
| Dated hint, no key | left out (dated tables need a key) |
| `allratestoday` plugin without a key | returns `[]` |
| 403 `market_rates_not_in_plan` / `historical_requires_paid_plan` | left out |

## 🔌 Adding your own source

Implement `RatePlugin` and put it anywhere in the engine's list. A plugin that reads a published table can reuse
`answerFromTable(rows, hints, date, pluginId)`, which handles direct, inverse and cross pairs.

```ts
import { answerFromTable, type RatePlugin } from '@allratestoday/exchange-plugins'

export const myBank: RatePlugin = {
  rateInfo: { pluginId: 'mybank', displayName: 'My Bank', keyless: true, homepage: 'https://example.org' },
  async fetchRates(hints) {
    const rows = [{ base: 'XYZ', quote: 'USD', value: 0.5, type: 'official' }]
    return answerFromTable(rows, hints, '2026-10-19', 'mybank')
  }
}
```

## 🔗 Links

- Docs: https://allratestoday.com/docs/
- Central bank sources: https://allratestoday.com/central-bank-rates-api/
- Daily reference rate: https://allratestoday.com/reference-rate/
- JavaScript SDK: https://github.com/AllRates-Today/exchange-rates-api
- MCP server for AI agents: https://github.com/AllRates-Today/mcp-server
- edge-rates-server adapter: [adapters/edge-rates-server](./adapters/edge-rates-server/)
- [Postman collection](https://allratestoday.com/postman/)

## 📜 License

MIT. Official tables are republished from each institution with attribution; see each source page on
allratestoday.com for the publisher's own terms.
