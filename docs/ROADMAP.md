# Roadmap

A running list of direction, not a promise or a timeline. Items are grouped by area; within an area, roughly nearest-first. See `docs/requirements.md` for the full original product vision this all works toward, and `CONTRIBUTING.md` for how to pick something up.

## What's built today

- A dependency-free Canvas 2D charting engine (`trading-charter-app-library`): candlesticks, volume, crosshair, price/time axes, pan/zoom, a replay-driven update API.
- A replay engine (`ReplayController`) with adjustable speed, base-then-resample timeframe derivation, and intrabar path synthesis for a smoother in-progress candle.
- Drawing tools: Trendline, Horizontal Line, Vertical Line, and Trace (multi-point, click-to-extend, arrowhead on the final leg).
- One indicator: Moving Average.
- A React demo app (`simulator-app`) wiring all of the above together, with a settings panel for chart colors/options.
- Real historical crypto data (BTC/ETH/SOL/LTC vs. USD) via Coinbase Exchange's public API, proxied through a local Node server (`data-server`) so no API key ever reaches the browser.
- Sample (synthetic) data as the always-available fallback, and what the deployed demo runs on.
- A GitHub Pages deploy pipeline building the library then the app and publishing the static output.

## What's not built yet, vs. the original vision

`docs/requirements.md` describes a full trading simulator; this repo currently implements its charting/replay core only. Specifically still missing:

- **Simulated trading and account state** (§4.3) — no buy/sell, no positions, no cash balance, no realized/unrealized P&L, no fees/spread/slippage modeling. This is the single biggest gap and the highest-leverage place to contribute.
- **Training modes** (§4.5) — Random Challenge, Strategy Challenge, decision journal.
- **Session analytics & review** (§4.6) — end-of-session summary, equity curve, trade log, post-session replay review.
- **Server-authoritative replay / anti-cheat delivery** (§6.2, NFR-3–NFR-5) — today's replay is entirely client-side and trusts the browser with the full loaded candle series; the original spec treats "future data must never be recoverable from client inspection" as non-negotiable once real trading/scoring exists. See "Node server evolution" below for how this is expected to arrive.
- **1-minute timeframe data**, and **real data for anything beyond crypto** (forex, stocks) — see `docs/DATA_PROVIDERS.md`.
- More indicators (RSI, MACD, Bollinger Bands — §4.4) and Fibonacci drawing tools.

## Near-term

- **Forex (and stock) free-data feasibility.** The current real blocker to broadening real data past crypto — see `docs/DATA_PROVIDERS.md` for what's been tried, what looks promising but unverified (Deriv), and how to help.
- **Publish `trading-charter-app-library` to npm as its own package**, installable independently of this monorepo. Needs: a settled package name (currently `trading-charter-app-library` — matching the folder name, but a more distinctive published name may be worth choosing), a real README, `"license"` set to match the repo (currently `"UNLICENSED"` in that package's own `package.json`, left over from before this repo had a chosen license), a `publishConfig`, and trimming the `files` field down to just built output. Publishing itself needs whoever does it to be logged into npm locally — it's not something that happens through this repo's CI as currently set up.

## Node server (`data-server`) evolution

This is worth spelling out on its own, since where `data-server` is headed is a bigger jump than its current few hundred lines suggest.

**Today:** a stateless proxy. Every `/api/candles` request re-fetches from Coinbase live; nothing is cached or stored; it only runs locally during development; the deployed GitHub Pages site never talks to it at all.

**Next, once a real forex/stocks provider is confirmed (see `docs/DATA_PROVIDERS.md`):** a provider-routing layer, so `/api/candles` picks the right upstream provider per symbol/asset class instead of hardcoding Coinbase — crypto through Coinbase, forex/stocks through whatever provider(s) pan out, side by side without disturbing the existing crypto path.

**Then: an ingestion and local storage layer.** Per the original requirements doc's data strategy (§5, FR-22), the system shouldn't hit a provider's API on every replay step — a proper ingestion pipeline (fetch → normalize → validate → deduplicate) writes into a local store so replay speed and reliability stop depending on live provider latency or rate limits, the same reasoning that already justifies chunking and concurrency-limiting Coinbase requests today, just taken further. At this project's actual scale, that store can start as something as simple as a local SQLite file rather than jumping straight to the requirements doc's original PostgreSQL/TimescaleDB suggestion (§6.4, §8) — that's a "when it's actually needed" upgrade, not a day-one requirement.

**Eventually: the full server-authoritative replay model** from the requirements doc's NFR-3 through NFR-5 — the server, not the browser, decides which candles a given session is allowed to see, delivered incrementally (the spec suggests WebSocket) rather than the browser ever holding the full future series in memory the way it does today. This is sequenced deliberately *after* a real trading/account simulation exists, not before — the anti-cheat requirement only matters once there's something (a scored challenge, a training mode) worth cheating at. Building it ahead of the simulation engine would be solving a problem this app doesn't have yet.

**Also eventually: actually deploying `data-server` somewhere public.** It's local-dev-only today, which is why the GitHub Pages build skips it entirely. Once it holds more than a thin proxy — real caching/storage, multiple providers — it becomes worth deploying (a small free/cheap tier on something like Render, Fly.io, or Railway would likely be enough at this project's scale) so the live demo can eventually show real data too, not just sample.

## Library roadmap

- Indicator backlog: RSI, MACD, Bollinger Bands (all called out in the original requirements doc, §4.4).
- Fibonacci retracement/extension drawing tool.
- Performance profiling and stress-testing at large candle counts — untested territory today.
- Publish to npm on its own (see "Near-term" above).

## A note on scope

None of the above is a commitment or a timeline — it's a shared map of direction so contributors can see where a given piece of work fits into the bigger picture, and so "why hasn't X been built" has a documented answer instead of just silence. If your priorities differ, say so in an issue — this list should reflect what the project actually needs, not just what was written down first.
