# edge-rates-server provider

`allratestoday.ts` is a fiat/fiat rate provider in the shape
[edge-rates-server](https://github.com/EdgeApp/edge-rates-server) expects
(`(rateObj: ReturnRate[], currentTime: string) => Promise<NewRates>`).

1. Copy `allratestoday.ts` to `src/providers/allratestoday.ts`.
2. In `src/config.ts`, read `ALLRATESTODAY_API_KEY` from `process.env` and add
   `allratestoday: { uri: 'https://allratestoday.com', apiKey: ALLRATESTODAY_API_KEY }`
   to `providerDefaults`.
3. In `src/rates.ts`, import it and add `allratestoday` to `rateProviders`
   (before `currencyConverter` to prefer it, after `openExchangeRates` to use
   it as a last-resort fallback).

Without a key the provider answers today's pairs from the keyless daily
reference rate. With a key it also answers historical dates.
