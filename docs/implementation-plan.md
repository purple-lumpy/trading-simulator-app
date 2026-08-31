# Implementation Plan

Market Replay Trainer · Draft v0.1 · August 29, 2026

## 1\. Purpose

This plan resolves the two open technical decisions blocking Phase 1 of the [requirements spec](#)\: which historical\-data provider(s) to build the ingestion pipeline against, and what renders the trading chart. It ends with a concrete build sequence so Phase 1 work can start.

## 2\. Decision 1 — Historical Data Providers

Free tiers change often and marketing pages routinely omit the numbers that matter (exact intraday depth), so the figures below are current as of this research pass and should be re\-verified with a trial key before committing spend — this is still the data\-feasibility study called for in the requirements doc.

### 2\.1 Crypto — solved, and free

**Binance's public REST kline endpoint is the clear answer.** No API key, no cost, a modest weight of 2 per request, intervals from 1 second up to 1 month, and full historical depth back to a pair's listing date. For crypto specifically, there is no reason to pay for or license historical OHLCV data.

CoinGecko's free Demo plan (100 calls/min, 10,000 monthly credits) is a fallback for coin metadata, but its OHLC data is far weaker for our purposes: daily/hourly history only one year back, and 5\-minute granularity restricted to the Enterprise plan. Binance covers our 5m/15m/1h/1D needs directly.

### 2\.2 Stocks — usable free tier, but shallow and worth verifying

| Provider | Free\-tier limit | Historical intraday | Verdict |
| --- | --- | --- | --- |
| Twelve Data | 800 requests/day | Depth not disclosed publicly — must test with a trial key | Best free starting point; plan to test before relying on it |
| Finnhub | 60 calls/min | Candle\-endpoint free\-tier depth unclear from docs; historically restricted for US stocks | Good for quotes/fundamentals; verify candle access before depending on it |
| Alpha Vantage | 25 requests/day (tightened from historical 500/day) | Intraday (`TIME_SERIES_INTRADAY`) is now premium\-only; free tier gets only a 100\-point compact window | No longer viable as a primary intraday source |
| Polygon.io | Severely rate\-limited | \~1 year of history on free tier | Free tier reads as a demo, not a build target |

**Recommendation:** pilot against Twelve Data's free plan for a handful of symbols to validate the ingestion pipeline mechanically, but budget for its paid plan (\~$100/month tier) once real coverage (≈100 symbols × 5–10 years × 5\-minute bars) is needed — the free tier will not get us there.

### 2\.3 Forex — the actual gap

This is the asset class free APIs do not cover well. Most free "forex API" offerings (exchangerate.host, Frankfurter, similar) provide daily reference rates, not intraday OHLC candles — they're built for currency conversion, not charting. Twelve Data and Finnhub both offer forex, but at free\-tier request volumes too low to backfill meaningful 5\-minute history across even a handful of pairs.

**Recommendation:** either defer forex from the initial pilot (ship stocks \+ crypto first, add forex once a paid data budget is confirmed), or accept from the outset that forex requires a paid provider — don't plan the pilot around a free forex source that doesn't really exist at the depth we need.

### 2\.4 Action item

Before writing a line of ingestion code: pull real trial\-key data from Twelve Data and Finnhub for one stock symbol at 5\-minute resolution, and confirm exactly how many days/months of history each returns. That single test resolves most of the uncertainty in the table above and should happen before any provider commitment.

## 3\. Decision 2 — PixiJS vs React for the Chart

Framed as "PixiJS or React" the question doesn't quite parse — they're not substitutes. React owns the application shell (controls, account panel, forms, WebSocket wiring, training\-mode UI) regardless of what renders the chart; that part of the stack isn't in question. The real decision is what draws the candlesticks: a purpose\-built charting library, or a custom renderer built on PixiJS's WebGL engine.

### 3\.1 What each option actually is

**TradingView Lightweight Charts** is a charting library: canvas\-based, Apache\-2.0 licensed, extremely small footprint, and built specifically for candlesticks, volume, crosshair, time/price scales, and price\-line markers — which is nearly a checklist match for FR\-12 in the requirements doc. It's mounted into a React component imperatively (a ref \+ `useEffect`), and updated by calling its API directly (`series.update()` for the next bar) rather than through React re\-renders — React never re\-renders the chart itself, it just owns the container. This pattern is already proven for exactly our use case: community toolkits built on top of Lightweight Charts (e.g., candlekit\-charts) implement historical replay as a small controller that drives `updateBar()` calls off a cursor rather than the wall clock — the same model our replay engine needs.

**PixiJS** is a general\-purpose 2D WebGL rendering engine — built for games and custom visual experiences, not charts. It has no concept of a candlestick, a price axis, or a crosshair; all of that would be built from scratch on top of Pixi's sprites and graphics primitives. It integrates with React the same imperative way Lightweight Charts does (mount a canvas, drive it outside React's render loop), so the integration pattern isn't the differentiator — the amount of charting infrastructure we'd have to build ourselves is.

### 3\.2 Recommendation

Use **TradingView Lightweight Charts**, mounted in a React component, as the core chart renderer for Phase 1–2. It already covers FR\-12 (candlesticks, crosshair, volume, entry/exit and SL/TP markers, position P&L readout) and has a demonstrated replay pattern to follow. Building the same thing in PixiJS means re\-solving axis scaling, panning/zooming, and crosshair hit\-testing before writing any training\-specific logic — weeks of infrastructure work with no product\-visible payoff.

Keep PixiJS in reserve for Phase 3\+, and only for things that are genuinely outside a charting library's job — a custom drawing\-tools canvas, or gamified visual feedback for Random/Strategy Challenge results (§4.4–4.5 of the requirements doc). Don't reach for it to render candles.

## 4\. Revised Build Sequence

This sequences Phase 1 of the requirements doc against the decisions above:

1. **Data\-feasibility spike** — pull real historical candles from Binance (crypto) and Twelve Data/Finnhub trial keys (stocks); confirm the forex gap; lock the provider mix and any paid\-plan budget needed.
2. **Ingestion pipeline skeleton** — fetch → normalize → validate → deduplicate → store, run end\-to\-end for one symbol per asset class into PostgreSQL/TimescaleDB.
3. **Replay engine skeleton** — server\-authoritative session and candle\-reveal logic (NFR\-3–NFR\-5 in the requirements doc), exposed over WebSocket.
4. **Chart integration** — React app shell \+ a Lightweight Charts component wired to the replay WebSocket, rendering one revealed candle at a time.
5. **Trading engine** — orders, fills, and account state (FR\-8–FR\-11) layered onto the same session.
6. **Session analytics & review mode** — end\-of\-session summary and Replay Review (FR\-19–FR\-21).

## 5\. Risks Specific to This Plan

- **Forex is the real cost driver.** If forex ships in the pilot, budget for a paid data plan from day one rather than assuming a free source will appear.
- **Free\-tier documentation is unreliable.** Twelve Data's and Finnhub's public pages don't state exact historical depth; treat the numbers in §2.2 as provisional until verified with a trial key.
- **PixiJS scope creep.** If "use WebGL, it's faster" becomes the default reasoning, expect a multi\-week detour rebuilding chart infrastructure that Lightweight Charts already provides for free.

## 6\. Open Questions

- Is there a budget ceiling in mind for a paid data plan once free tiers prove insufficient (Twelve Data's \~$100/month tier, or a Polygon/Finnhub equivalent)?
- Should forex be in the initial pilot at all, or deferred until a data budget is confirmed — dropping it would remove the plan's single biggest cost risk.

## Sources

- [Twelve Data pricing](https://twelvedata.com/pricing)
- [Finnhub](https://finnhub.io/)
- [Alpha Vantage documentation](https://www.alphavantage.co/documentation/)
- [Alpha Vantage premium/rate limits](https://www.alphavantage.co/premium/)
- [Binance market data endpoints](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints)
- [CoinGecko API pricing](https://www.coingecko.com/en/api/pricing)
- [Best free stock market APIs, 2026 roundup](https://thenextgennexus.com/2026/05/15/10-best-free-stock-market-apis-2026/)
- [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts)
- [PixiJS](https://pixijs.com/)
- [candlekit\-charts — replay controller over Lightweight Charts](https://github.com/rohanbeingsocial/candlekit-charts)
- [Smooth trading charts with PixiJS & React](https://adikris.in/blog/pixijs-trading-chart/)
