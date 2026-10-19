/**
 * AllRatesToday provider for EdgeApp/edge-rates-server.
 *
 * Drop this file into `src/providers/` and register it in the
 * `rateProviders` list in `src/rates.ts`, next to `currencyConverter` and
 * `openExchangeRates`. It is a fiat/fiat provider: without a key it serves
 * today's table from the keyless daily reference rate
 * (https://allratestoday.com/api/open/reference-rate, 16:00 London, USD base);
 * with ALLRATESTODAY_API_KEY set it also answers historical dates from
 * `/api/v1/reference-rate/{date}`.
 *
 * Config (add to `providerDefaults` in `src/config.ts`):
 *
 *   allratestoday: {
 *     uri: 'https://allratestoday.com',
 *     apiKey: ALLRATESTODAY_API_KEY
 *   }
 */
import { asArray, asNumber, asObject, asString } from 'cleaners'
import fetch from 'node-fetch'

import { config } from './../config'
import type { NewRates, ReturnRate } from './../rates'
import {
  combineRates,
  dateOnly,
  fromCode,
  isIsoCode,
  logger,
  subIso,
  toCode
} from './../utils/utils'

const {
  providers: {
    allratestoday: { uri, apiKey }
  }
} = config as unknown as {
  providers: { allratestoday: { uri: string; apiKey?: string } }
}

const asAllRatesTodayResponse = asObject({
  rate_date: asString,
  base: asString,
  rates: asArray(asObject({ quote: asString, value: asNumber }))
})

const query = async (date: string, pairs: string[]): Promise<NewRates> => {
  const rates: NewRates = { [date]: {} }
  if (pairs.length === 0) return rates
  const today = dateOnly(new Date().toISOString())
  const day = dateOnly(date)
  const isToday = day === today
  if (!isToday && apiKey == null) return rates // dated tables need a key

  const url = isToday
    ? `${uri}/api/open/reference-rate`
    : `${uri}/api/v1/reference-rate/${day}`
  const headers: Record<string, string> = {}
  if (apiKey != null) headers.Authorization = `Bearer ${apiKey}`

  try {
    const response = await fetch(url, { headers })
    if (!response.ok) {
      throw new Error(
        `allratestoday returned with status: ${response.status} and error: ${response.statusText}`
      )
    }
    const json = asAllRatesTodayResponse(await response.json())
    // usdPer[X] = units of X per 1 USD
    const usdPer: Record<string, number> = { [json.base]: 1 }
    for (const r of json.rates) usdPer[r.quote] = r.value

    for (const pair of pairs) {
      const from = subIso(fromCode(pair))
      const to = subIso(toCode(pair))
      const a = usdPer[from]
      const b = usdPer[to]
      if (a == null || b == null || a === 0) continue
      // units of `to` per 1 `from`
      rates[date][pair] = (b / a).toString()
    }
  } catch (e) {
    logger(`Failed to get ${pairs.length} pairs from allratestoday at ${date}`, e)
  }
  return rates
}

export const allratestoday = async (
  rateObj: ReturnRate[],
  currentTime: string
): Promise<NewRates> => {
  const rates = {}

  // Gather fiat/fiat pairs by date
  const datesAndPairsWanted: Record<string, string[]> = {}
  for (const pair of rateObj) {
    const fromCurrency = fromCode(pair.currency_pair)
    const toCurrency = toCode(pair.currency_pair)
    if (!isIsoCode(fromCurrency) || !isIsoCode(toCurrency)) continue
    if (datesAndPairsWanted[pair.date] == null)
      datesAndPairsWanted[pair.date] = []
    if (!datesAndPairsWanted[pair.date].includes(pair.currency_pair))
      datesAndPairsWanted[pair.date].push(pair.currency_pair)
  }

  const providers = Object.keys(datesAndPairsWanted).map(
    async date => await query(date, datesAndPairsWanted[date])
  )
  try {
    const response = await Promise.all(providers)
    combineRates(rates, response)
  } catch (e) {
    logger('Failed to query allratestoday with error', e)
  }

  return rates
}
