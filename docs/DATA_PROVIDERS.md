# Data providers

How real market data works today, why forex and stocks aren't covered yet, what's been explored for closing that gap, and how to plug in a provider of your own.

## Today: Coinbase Exchange, crypto only, no key required

`data-server` proxies Coinbase Exchange's public REST API (`https://api.exchange.coinbase.com/products/{id}/candles`) for historical candles. No account, no API key, no meaningful rate limit for a demo's worth of traffic — this is genuinely the easy case. It covers exactly the four crypto pairs listed in `src/simulator-app/src/instruments.ts`: BTC/USD, ETH/USD, SOL/USD, LTC/USD.

Binance's equivalent public endpoint was tried first (same idea — no key needed) but returned HTTP 451 ("unavailable for legal reasons") from this project's network, a geo-restriction on Binance's end that isn't fixable from this codebase. Coinbase Exchange answers the same kind of request with no such block, which is the only reason it was chosen over Binance — not a feature or licensing advantage, just the one that actually answers requests from here. If you're running this somewhere Binance isn't geo-blocked, its public kline endpoint is worth adding as an alternative (see "Adding a new provider" below) — no evidence either way from this project's own testing on whether it'd behave the same for you.

### Why Finnhub is still in the codebase but not used for candles

An earlier iteration used Finnhub. Its `/quote` endpoint is free-tier and works; every *candle* endpoint (`/stock/candle`, `/forex/candle`, `/crypto/candle`) returns 403 on this project's free-tier key. `data-server`'s `/diagnose` route exists specifically to check this empirically against your own key rather than trust Finnhub's documentation (which was found to be unreliable on this point) — hit it after setting `FINNHUB_API_KEY` in `.env` and it'll report, per candle endpoint, whether your account's tier actually includes it. If Finnhub ever opens candle access on your tier, that's a real, ready-made path to add stock/forex candles — the plumbing (`FINNHUB_BASE_URL`, the key handling, the diagnostic) is already there, just not wired into `/api/candles` because it wasn't usable when this was built.

## The forex (and stocks) gap

This is the real open problem, not a solved-and-forgotten one. Summarizing the research in `docs/implementation-plan.md` §2.2–2.3 (worth reading in full):

- **Crypto** is the easy case — Binance/Coinbase-style public endpoints give free, full-depth historical OHLCV with no key.
- **Stocks** have a usable-but-shallow free tier via Twelve Data or Finnhub, with exact historical depth undocumented and needing verification with a real trial key rather than trusted from marketing pages.
- **Forex is the real gap.** Most free "forex API" offerings (exchangerate.host, Frankfurter, and similar) are daily reference-rate services built for currency conversion, not charting — they don't provide intraday OHLC candles at all. Twelve Data and Finnhub both nominally cover forex, but at free-tier request volumes too low to backfill meaningful 5-minute history across even a handful of pairs.

This project has not found a solved answer here yet. EUR/USD is deliberately left in the instrument dropdown showing "Sample" rather than removed, precisely so this gap stays visible rather than quietly worked around.

### Leads worth investigating further

None of these are confirmed working end-to-end for this project yet — treat every line here the way this project treats every other provider claim: verify against a real trial/demo key before building on it, don't take a docs page's word for exact historical depth or rate limits.

- **Deriv API** — an early, preliminary look during this project's research suggested Deriv's WebSocket API may offer free access to forex (and synthetic-index) price data without requiring a funded trading account, which would make it a genuine candidate for the gap above. This has **not** been verified against this project's actual needs (real historical intraday OHLC depth, rate limits, terms of use for storing/replaying that data) — it's a promising lead, not a decision. If you investigate it (or have already), opening an issue or PR with what you found — working or not — is a real contribution.
- **OANDA** — commonly cited as a source of free-tier practice-account forex data with intraday granularity; worth testing against this project's specific needs (historical depth via REST, not just a live practice feed) before committing to it.
- **Twelve Data forex tier** — free-tier limits and coverage change over time; worth re-testing periodically rather than assuming the `implementation-plan.md` numbers still hold.
- **Anything else you know of.** If you've solved "free or cheap, real intraday forex OHLC history, redistributable for a training/replay product" elsewhere, this project would genuinely like to know — please open an issue even without code attached.

## Adding a new provider

The shape to follow, using Coinbase's own integration in `src/data-server/src/index.ts` as the reference:

1. **Fetch** — write a function that calls the provider's API and returns raw responses in whatever shape that provider uses.
2. **Normalize** — map the raw response into this project's shared `Candle` shape (`{ time, open, high, low, close, volume }`, `time` in Unix seconds), matching `trading-charter-app-library`'s own `Candle` type exactly so the browser side never has to reshape anything. See the `CoinbaseCandle` tuple-to-`Candle` mapping in `fetchCoinbaseCandles` for the pattern — including watching out for a provider that doesn't return fields in OHLC order (Coinbase's own tuple is `[time, low, high, open, close, volume]`, easy to get backwards).
3. **Respect the provider's own limits.** Coinbase caps a single request at 300 buckets and doesn't truncate silently past that — it 400s — so `fetchCoinbaseCandles` chunks a wide date range into multiple requests, bounded to a handful in flight at once via `mapWithConcurrencyLimit` (a small, reusable "run N at a time" helper, not Coinbase-specific — reuse it for a new provider with a similar cap). Check whether your provider has an equivalent cap before assuming a wide date-range request just works.
4. **Wire it into (or alongside) `/api/candles`.** Today `/api/candles` always calls Coinbase; a new provider that only covers different symbols (forex, stocks) should route by symbol/asset class rather than replacing the crypto path — see "Planned: provider routing" below for the shape this is expected to take as more than one provider exists.
5. **Keep the key server-side.** Whatever the provider, its API key stays in `data-server`, read from `.env` via `dotenv`, and is never sent to or read by browser-bundled code. This matters even for a demo project: `.env.example`'s own comment explains why — Vite only inlines `VITE_`-prefixed variables into client code, and none of this project's provider keys are named that way, on purpose.
6. **Expose it to the UI.** If the new provider covers symbols that should be selectable, add them to `src/simulator-app/src/instruments.ts`'s `INSTRUMENTS` list. No other wiring is needed — `App.tsx`'s fetch-and-fall-back-to-sample logic already treats "does this symbol actually have real data" as something discovered empirically per request, not a flag maintained anywhere.

## Planned: provider routing (not built yet)

Right now `data-server` only ever talks to one provider (Coinbase), so there's no routing logic to speak of. Once a second provider exists — covering forex and/or stocks — the plan is a small `DataProvider` interface each provider module implements (roughly: `supports(symbol): boolean` plus a `fetchCandles(...)` matching the shape above), with `/api/candles` picking the right provider per request instead of hardcoding Coinbase. This is deliberately not built speculatively ahead of having a second real provider to route to — see `docs/ROADMAP.md` for where this sits relative to the rest of the data-server's planned evolution (ingestion/local storage, and eventually the server-authoritative replay model from `docs/requirements.md`).

## Using your own API key locally

```bash
cp .env.example .env
# fill in FINNHUB_API_KEY if you want /diagnose and /quote to work — not required for real crypto candles
```

`.env` lives at the repo root (not inside `src/data-server/`) and is read via `dotenv` from `data-server`'s own process — see that file's top-of-file comment for why it's resolved relative to `__dirname` rather than assuming a working directory. `.env` is gitignored; never commit real keys.
