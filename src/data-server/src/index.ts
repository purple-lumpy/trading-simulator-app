import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Local proxy server for real market data. Historical candles come from
 * Coinbase Exchange's public REST API (see /api/candles below) - no key,
 * no account, no rate limit that matters for a demo's worth of traffic.
 * Binance's public API was tried first (same idea, no key needed) but
 * its actual HTTP responses came back 451 "Service unavailable from a
 * restricted location" - a geo-block on Binance's end, not anything
 * fixable here - so this switched to Coinbase Exchange, which answers
 * real candle data from this same network with no such restriction
 * (confirmed empirically, the same way the Finnhub tier question below
 * was worked out). Finnhub itself is kept around only for /diagnose and
 * the always-free /quote endpoint it still answers - see that route's
 * own doc comment for why it's still here; every one of its *candle*
 * endpoints (stock/forex/crypto) is 403 on this project's free tier,
 * which is the reason candles don't come from Finnhub at all.
 *
 * FINNHUB_API_KEY, when present, still has to stay server-side for that
 * reason: a key embedded in Vite-bundled client code is visible to
 * anyone who opens devtools, which defeats the point of keeping it out
 * of the repo's git history in the first place (see the repo root
 * .env.example's own comment on this same reasoning). This process is
 * the ONLY thing that ever sees the raw key.
 *
 * ESM has no __dirname - derive it the standard way, so dotenv can find
 * the repo-root .env regardless of which directory this process happens
 * to be started from (npm workspace scripts don't always run with cwd
 * set to the package itself).
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const PORT = Number(process.env.DATA_SERVER_PORT) || 4001;
const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
// Coinbase's public Exchange market-data API - no API key required for
// historical candles, and (unlike Binance's equivalent, see this file's
// top-of-file comment) actually reachable from this network.
const COINBASE_BASE_URL = "https://api.exchange.coinbase.com";

/** One returned OHLCV bar - deliberately identical in shape to trading-charter-app-library's own `Candle` (time in Unix seconds, per that type's own doc comment) so simulator-app can feed a response straight into the chart with no reshaping of its own. Duplicated here rather than imported from the library - this package has no reason to depend on the charting library itself, just to agree on a shape with whatever does. */
interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const app = express();
// dev-only server on its own port (see PORT above), separate from Vite's
// 5173 - the browser fetching across that port difference is a
// cross-origin request, which needs this or the browser blocks it before
// simulator-app's fetch() ever gets a response.
app.use(cors());

// No UI lives at "/" - this is a JSON API only, hit directly from a
// browser tab or curl mostly to sanity-check "is this thing running at
// all," which Express's own default 404 ("Cannot GET /") answers
// correctly but unhelpfully: that response *is* proof the server
// answered a request (a genuinely dead/unreachable server times out or
// refuses the connection instead - see the two actual routes below for
// the ones simulator-app talks to). This route exists purely to make
// that same "yes, I'm up" check point somewhere self-explanatory instead.
app.get("/", (_req, res) => {
  res.json({
    name: "trading-data-server",
    ok: true,
    routes: ["/health", "/diagnose", "/api/candles?symbol=BTC-USD&resolution=1&from=<unix s>&to=<unix s>"],
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(FINNHUB_API_KEY) });
});

/**
 * One-off diagnostic, not something simulator-app ever calls: Finnhub's
 * docs are a JS-rendered SPA that's not reliably fetchable, and forum
 * reports of which candle endpoints are free-tier-accessible are mixed
 * and unconfirmed (see this repo's own README/session notes) - so rather
 * than trust either, this hits /quote (Finnhub's own documented
 * always-free control - if this fails, the key itself is bad, not a
 * tier issue) plus every *candle* endpoint this account might actually
 * be able to use (stock, forex, crypto) with the exact same key, and
 * reports which of them come back ok. The key never leaves this server
 * either way, only a pass/fail per endpoint does.
 */
app.get("/diagnose", async (_req, res) => {
  if (!FINNHUB_API_KEY) {
    res.status(500).json({ error: "FINNHUB_API_KEY is not set." });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 60 * 60 * 24;

  async function check(label: string, path: string, params: Record<string, string>) {
    const url = new URL(`${FINNHUB_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("token", FINNHUB_API_KEY!);
    try {
      const upstream = await fetch(url);
      const body = await upstream.text();
      return { label, path, status: upstream.status, ok: upstream.ok, body: body.slice(0, 300) };
    } catch (err) {
      return { label, path, status: null, ok: false, body: `fetch failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  const results = await Promise.all([
    check("quote (control - always free)", "/quote", { symbol: "AAPL" }),
    check("stock candles", "/stock/candle", { symbol: "AAPL", resolution: "1", from: String(dayAgo), to: String(now) }),
    check("forex candles", "/forex/candle", { symbol: "OANDA:EUR_USD", resolution: "1", from: String(dayAgo), to: String(now) }),
    check("crypto candles", "/crypto/candle", { symbol: "BINANCE:BTCUSDT", resolution: "1", from: String(dayAgo), to: String(now) }),
  ]);

  res.json({
    results,
    verdict: results[0].ok
      ? "Key is valid and authenticated (the /quote control succeeded) - whichever of stock/forex/crypto candles show ok:true below are what this account's tier actually includes."
      : "Key itself is being rejected even on Finnhub's always-free /quote endpoint - check it was copied correctly into .env and that this server was restarted after any .env edit.",
  });
});

// Finnhub-style resolution strings ("1"/"5"/"15"/"60" minutes, "D") mapped
// to Coinbase Exchange's own supported granularities, in seconds - kept
// as the query param shape simulator-app already sends, so realData.ts
// didn't need to change how it builds this request, only which symbol
// it asks for. Coinbase's supported set is smaller than Finnhub's or
// Binance's (no 30-minute or weekly/monthly bucket exists on this
// endpoint at all) - not a problem in practice, since realData.ts only
// ever requests "1" (see its own doc comment on why 1-minute is the only
// granularity this app's real-data base series uses).
const RESOLUTION_TO_GRANULARITY_SECONDS: Record<string, number> = {
  "1": 60,
  "5": 300,
  "15": 900,
  "60": 3600,
  D: 86400,
};

/** One raw Coinbase Exchange candle: a 6-element tuple, not an object, and in `[time, low, high, open, close, volume]` order - notably NOT open-high-low-close order, easy to get backwards - see https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles for the full shape. */
type CoinbaseCandle = [number, number, number, number, number, number];

// Coinbase's own hard cap: a single request can return at most this many
// buckets - asking for a wider [from, to] range at a given granularity
// gets a 400 back instead of being silently truncated. This app's
// REAL_FINE_BASE_CANDLE_COUNT/REAL_COARSE_BASE_CANDLE_COUNT
// (simulator-app/src/App.tsx) are both comfortably past that, so
// fetchCoinbaseCandles below splits a wide request into multiple chunk
// requests rather than hitting that cap.
const MAX_CANDLES_PER_COINBASE_REQUEST = 300;

// How many chunk requests fetchCoinbaseCandles lets run at once. A
// single App.tsx page load can now ask for a base series spanning
// dozens of chunks (the coarse tier's 300-bar-at-1d request alone is
// ~24) - firing all of them through one unthrottled Promise.all risked
// tripping Coinbase's public-endpoint rate limit the moment a second
// tier's fetch (or a second browser tab) overlapped with the first.
// Capping concurrency, not chunk count, keeps every request still
// getting made - just a handful at a time - so a large request degrades
// to "takes a bit longer" instead of "some chunks come back 429/blocked
// and the whole series is silently short a few candles."
const COINBASE_MAX_CONCURRENT_REQUESTS = 6;

/**
 * Runs `task` over every item in `items`, but never lets more than
 * `limit` calls be in flight at once - unlike `Promise.all(items.map(task))`,
 * which starts all of them immediately regardless of how many that is.
 * Implemented as `limit` worker loops racing through one shared cursor
 * (`nextIndex`) rather than batching in fixed-size groups: a batch-of-N
 * design has every group wait on its slowest member before the next
 * group can start, so one slow chunk request stalls requests that could
 * otherwise already be running; a shared cursor keeps exactly `limit`
 * requests in flight at all times; a finished one is immediately replaced
 * by the next pending item instead of waiting for its whole batch.
 * General enough to reuse anywhere else in this file that ever needs the
 * same "many small requests, bounded concurrency" shape - not specific
 * to Coinbase or to candles.
 */
async function mapWithConcurrencyLimit<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await task(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/**
 * Fetches one product's candles from Coinbase Exchange across
 * [fromSec, toSec), transparently chunked into multiple requests when the
 * range would otherwise exceed MAX_CANDLES_PER_COINBASE_REQUEST buckets,
 * at most COINBASE_MAX_CONCURRENT_REQUESTS of which are ever in flight at
 * once (see mapWithConcurrencyLimit above). Consecutive chunks share
 * their boundary instant, which Coinbase can hand back on both sides of
 * it - deduplicated here via a Map keyed by time before the result is
 * returned, so callers never see a repeated bar. Returned oldest-first
 * (Coinbase itself answers newest-first per chunk - see the sort below),
 * matching every other candle source in this codebase.
 */
async function fetchCoinbaseCandles(productId: string, granularitySec: number, fromSec: number, toSec: number): Promise<Candle[]> {
  const chunkSpanSec = MAX_CANDLES_PER_COINBASE_REQUEST * granularitySec;
  const chunkRanges: Array<{ start: number; end: number }> = [];
  for (let start = fromSec; start < toSec; start += chunkSpanSec) {
    chunkRanges.push({ start, end: Math.min(toSec, start + chunkSpanSec) });
  }

  const chunkResults = await mapWithConcurrencyLimit(chunkRanges, COINBASE_MAX_CONCURRENT_REQUESTS, async ({ start, end }) => {
      const url = new URL(`${COINBASE_BASE_URL}/products/${encodeURIComponent(productId)}/candles`);
      url.searchParams.set("granularity", String(granularitySec));
      url.searchParams.set("start", new Date(start * 1000).toISOString());
      url.searchParams.set("end", new Date(end * 1000).toISOString());

      const upstream = await fetch(url, {
        // Coinbase's public endpoint has been seen rejecting requests
        // with no User-Agent at all (some Node fetch defaults send
        // none) - a harmless, honest one avoids that entirely.
        headers: { "User-Agent": "trading-simulator-app-data-server/1.0 (+local dev)" },
      });
      if (!upstream.ok) {
        const body = await upstream.text();
        throw new Error(`Coinbase responded ${upstream.status} ${upstream.statusText}: ${body.slice(0, 300)}`);
      }
      return (await upstream.json()) as CoinbaseCandle[];
    },
  );

  const byTime = new Map<number, Candle>();
  for (const raw of chunkResults.flat()) {
    const [time, low, high, open, close, volume] = raw;
    byTime.set(time, { time, open, high, low, close, volume });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/**
 * GET /api/candles?symbol=BTC-USD&resolution=1&from=<unix s>&to=<unix s>
 *
 * Proxies Coinbase Exchange's public /products/{id}/candles endpoint (no
 * API key needed - see this file's own top-of-file comment for why
 * neither Finnhub's nor Binance's candle endpoints are used here) and
 * reshapes its array-of-arrays response into an array of `Candle`
 * objects - one per bar, each already in the exact shape
 * ChartCore/ReplayController expect - so simulator-app's own code never
 * has to know Coinbase's response format at all, only this server's.
 *
 * resolution keeps the same query param shape simulator-app already
 * sends ("1", "5", "15", "60", "D") and is translated to Coinbase's
 * granularity-in-seconds via RESOLUTION_TO_GRANULARITY_SECONDS above.
 *
 * symbol follows Coinbase's own product-id format (e.g. "BTC-USD",
 * dash-separated base-quote) - different from both Finnhub's
 * "BINANCE:BTCUSDT" style and Binance's bare "BTCUSDT" style, which is
 * why realData.ts's SYMBOL constant changed alongside this route.
 */
app.get("/api/candles", async (req, res) => {
  const symbol = typeof req.query.symbol === "string" ? req.query.symbol : "BTC-USD";
  const resolution = typeof req.query.resolution === "string" ? req.query.resolution : "1";
  const granularitySec = RESOLUTION_TO_GRANULARITY_SECONDS[resolution];
  if (!granularitySec) {
    res.status(400).json({ error: `Unsupported resolution "${resolution}". Expected one of: ${Object.keys(RESOLUTION_TO_GRANULARITY_SECONDS).join(", ")}.` });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const to = typeof req.query.to === "string" && req.query.to !== "" ? Number(req.query.to) : now;
  // Default window: the last 24h of 1-minute bars - plenty for a replay
  // session (300+ bars) without asking Coinbase for more history than a
  // demo actually needs.
  const from = typeof req.query.from === "string" && req.query.from !== "" ? Number(req.query.from) : to - 60 * 60 * 24;

  try {
    const candles = await fetchCoinbaseCandles(symbol, granularitySec, from, to);
    res.json({ candles, status: "ok" });
  } catch (err) {
    // Covers both a network-level failure reaching Coinbase (DNS,
    // connection refused/reset, timeout) and Coinbase itself responding
    // with an error status (thrown explicitly inside
    // fetchCoinbaseCandles above) - either way, nothing simulator-app
    // can do about it, so it's reported the same way as the other
    // "couldn't get real data" cases.
    res.status(502).json({ error: `Could not reach Coinbase: ${err instanceof Error ? err.message : String(err)}` });
  }
});

app.listen(PORT, () => {
  console.log(`[data-server] listening on http://localhost:${PORT}`);
  if (!FINNHUB_API_KEY) {
    console.warn("[data-server] FINNHUB_API_KEY is not set - /api/candles will return 500 until .env is filled in.");
  }
});
