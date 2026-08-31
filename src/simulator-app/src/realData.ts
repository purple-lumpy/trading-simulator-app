import type { Candle } from "trading-charter-app-library";

/**
 * Local data-server base URL (see src/data-server — a separate Node
 * process proxying real candle data; see its own top-of-file doc comment
 * for why candles come from Coinbase Exchange's public API rather than
 * Finnhub or Binance).
 * Hardcoded rather than read from import.meta.env: this app has no
 * vite-env.d.ts declaring custom VITE_-prefixed keys yet, and
 * data-server/src/index.ts itself defaults to this same port, so
 * there's nothing to configure for local dev - edit this constant
 * directly if data-server ever needs to run elsewhere.
 */
const DATA_SERVER_URL = "http://localhost:4001";

/**
 * Default symbol, used only when a caller doesn't pass its own (kept for
 * back-compat with any direct caller that predates instrument selection)
 * - matches data-server's own default, in Coinbase Exchange's product-id
 * format ("BASE-QUOTE", dash-separated - unlike Finnhub's
 * "BINANCE:BTCUSDT" style or Binance's bare "BTCUSDT" style this app
 * tried before switching data sources; see data-server/src/index.ts's
 * /api/candles doc comment for why Coinbase). See instruments.ts for the
 * full selectable list - any of *its* symbols works here unchanged,
 * whether or not Coinbase actually has real data for it: a symbol
 * Coinbase doesn't recognize (a forex pair, a stock ticker) just makes
 * data-server's own request fail, which this function already treats
 * as "no real data, stay on sample" - the exact same fallback path a
 * genuine network/outage failure takes. No separate "does this symbol
 * have real data" flag needed anywhere - whether real data shows up is
 * discovered empirically, every time, by whether this function's fetch
 * actually succeeds.
 */
const DEFAULT_SYMBOL = "BTC-USD";

/**
 * `baseSeconds` -> the Finnhub-style resolution string data-server's
 * /api/candles expects (see its own RESOLUTION_TO_GRANULARITY_SECONDS,
 * the inverse of this map). Only the two values App.tsx actually asks
 * for - the fine tier's 60 ("1m", backing 1m/5m/15m/30m) and the coarse
 * tier's 3600 ("1h", backing 1h/3h/4h/8h/1d) - are listed; see App.tsx's
 * own doc comment on why real data is fetched as two independent base
 * series rather than one.
 */
const BASE_SECONDS_TO_RESOLUTION: Record<number, string> = {
  60: "1",
  3600: "60",
};

interface CandlesResponse {
  candles?: Candle[];
  status?: string;
  error?: string;
}

/**
 * Fetches one tier's worth of real candles, for whichever symbol is
 * passed, from the local data-server to use as one of App's two
 * real-data base series (mirrors generateSampleCandles's role for the
 * synthetic base series - see App's own doc comment on why *two* shared
 * base series, each resampled per timeframe within its own tier, is the
 * shape both the real and sample paths now use).
 *
 * @param barCount How many `baseSeconds`-granularity bars to request.
 * @param baseSeconds Which tier to fetch - must be a key of
 *   BASE_SECONDS_TO_RESOLUTION above (60 or 3600 today). Determines both
 *   the resolution asked for and the width of the [from, to) window this
 *   requests (`barCount * baseSeconds` seconds), so a coarse-tier
 *   request spans the same number of *bars*, just each one covering more
 *   real time.
 * @param symbol Coinbase Exchange product id to request - see
 *   instruments.ts's own `Instrument.symbol` doc comment. Defaults to
 *   `DEFAULT_SYMBOL` (BTC-USD) for any caller that predates instrument
 *   selection; App.tsx always passes the currently-selected instrument's
 *   own symbol explicitly.
 * @param fromDate When omitted (the default), fetches the most recent
 *   `barCount` bars ending now - the "just show me recent real
 *   activity" case `App` opens with. When given, fetches `barCount`
 *   bars starting *from* that date instead - the date-picker case: a
 *   trader picks a day and replays forward from it, the same "pick a
 *   starting point, then move forward in time" shape the rest of this
 *   app's replay already has, just applied to *which* history loads
 *   rather than to playback speed. Clamped so `to` never asks for data
 *   past the present moment - Coinbase has nothing to return for a future
 *   range anyway (see the empty-`candles`/`null` handling below), so
 *   there's no reason to ask.
 */
export async function fetchRealBaseCandles(
  barCount: number,
  baseSeconds: number,
  symbol: string = DEFAULT_SYMBOL,
  fromDate?: Date
): Promise<Candle[] | null> {
  // A production build (import.meta.env.DEV is false for anything built
  // with `vite build`, true only under the `vite` dev server) has no
  // data-server behind it - there's nowhere to deploy that alongside a
  // static GitHub Pages site yet (see .github/workflows/deploy-pages.yml's
  // own comment), so every instrument would just show sample data anyway,
  // by definition. Skipping the request entirely there, rather than
  // letting it fail on its own, avoids a guaranteed-failing fetch to
  // `DATA_SERVER_URL` (each visitor's own localhost, not a real server -
  // and blocked as mixed content besides, since this app is served over
  // HTTPS on GitHub Pages) on every page load and instrument change. The
  // existing try/catch below still covers every other "couldn't get real
  // data" case (data-server not running locally, a network hiccup, an
  // unrecognized symbol) exactly as it always has - this is just one
  // more of them, decided up front instead of after a failed request.
  if (!import.meta.env.DEV) return null;

  const resolution = BASE_SECONDS_TO_RESOLUTION[baseSeconds];
  if (!resolution) {
    // A programmer error (App.tsx passing a tier this map doesn't know
    // about), not a runtime/network condition - thrown rather than
    // quietly returning null, which this function otherwise reserves for
    // "couldn't get real data, fall back to sample" cases a caller
    // should never need to distinguish from each other.
    throw new Error(`fetchRealBaseCandles: no resolution mapped for baseSeconds=${baseSeconds}.`);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = fromDate ? Math.floor(fromDate.getTime() / 1000) : nowSec - barCount * baseSeconds;
  const toSec = Math.min(fromDate ? fromSec + barCount * baseSeconds : nowSec, nowSec);
  const url =
    `${DATA_SERVER_URL}/api/candles?symbol=${encodeURIComponent(symbol)}` +
    `&resolution=${resolution}&from=${fromSec}&to=${toSec}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    // Most likely cause during local dev: the data-server isn't running
    // (see src/data-server's own README/scripts) - not a bug to surface
    // loudly, just a reason to stay on sample data.
    return null;
  }
  if (!response.ok) return null;

  let body: CandlesResponse;
  try {
    body = (await response.json()) as CandlesResponse;
  } catch {
    return null;
  }
  if (!body.candles || body.candles.length === 0) return null;

  // Defensive sort: App/resampleCandles both assume oldest-first
  // ordering (the same convention generateSampleCandles produces).
  // data-server's own fetchCoinbaseCandles already sorts ascending
  // before this ever arrives (Coinbase itself answers newest-first per
  // chunk) - this is cheap insurance regardless, against ever silently
  // feeding a reversed series in if that server-side guarantee changes.
  return [...body.candles].sort((a, b) => a.time - b.time);
}
