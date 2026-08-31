# Market Replay Trainer

Requirements Specification · Draft v0.3 · Prepared August 29, 2026 · Updated August 30, 2026

## 1\. Overview

**Product concept.** A web application that trains traders on real historical market data. Users replay past markets candle\-by\-candle at adjustable speed, place simulated trades without any visibility into what happens next, and receive analytics and decision feedback once a session ends.

**Positioning.** A flight simulator for traders — not a general\-purpose charting platform, and not an attempt to reproduce all of TradingView. The product wins by making historical replay, decision\-making, challenges, and feedback substantially better than a generic chart, not by matching TradingView's feature breadth.

**Core principle.** At every point in a session, the trader can see only what a trader at that historical moment could have seen. Nothing about the future — price, outcome, or even the date — may leak to the client.

**Initial asset classes:** stocks, forex, and crypto.

## 2\. Goals & Success Criteria

The MVP is considered successful when:

- A user can start a historical session and see only the candles available up to the current replay point.
- A user can control replay speed (0.25× to 100×) without waiting on external data\-provider APIs.
- A user can place and manage simulated trades with accurate fills.
- The system correctly computes balance, equity, realized/unrealized P&L, fees, slippage, margin, and drawdown according to configured rules.
- A user can complete a session and receive meaningful performance analytics.
- Future market data cannot be trivially recovered by inspecting network traffic, WebSocket messages, or client\-side application state.

## 3\. Target Users

- **Self\-directed retail traders** practicing a strategy against real market history instead of a demo account with live (and costly) risk.
- **New traders** learning order types, risk management, and chart reading in a low\-stakes environment.
- **Trading educators / course creators** who want repeatable historical scenarios to assign as exercises (Phase 4).

## 4\. Functional Requirements

### 4\.1 Market Selection & Session Setup

- **FR\-1 — Instrument selection.** The user shall be able to choose an asset class (stock, forex, crypto), a symbol/instrument within that class, a timeframe, a historical period, and a starting capital amount before starting a session.
- **FR\-2 — Supported timeframes.** The MVP shall support 5\-minute, 15\-minute, 1\-hour, and daily candles. 1\-minute data is deferred to a later phase because of its substantially larger storage and licensing footprint.
- **FR\-3 — Session parameters.** Each session shall record its instrument, timeframe, date range, starting capital, and configuration (fees, spread, slippage, leverage) so the session can be scored and reviewed consistently.

### 4\.2 Replay Engine & Controls

- **FR\-4 — Sequential reveal.** The replay engine shall reveal historical candles one at a time in chronological order; candles beyond the current replay timestamp shall not exist anywhere in the client's reachable state.
- **FR\-5 — Playback controls.** The user shall be able to play, pause, step to the previous candle, and step to the next candle.
- **FR\-6 — Speed control.** Replay speed shall be adjustable from 0.25× to 100× without introducing visible stalls, since data is served from local storage rather than a live feed.
- **FR\-7 — Session clock.** The replay engine shall track session start time, current replay timestamp, end timestamp, and current candle index as authoritative server\-side state.

### 4\.3 Trading & Account Simulation

- **FR\-8 — Order actions.** The user shall be able to buy, sell, close a position, reverse a position, and increase or reduce an open position's size.
- **FR\-9 — Protective orders.** The user shall be able to attach a stop\-loss and a take\-profit to a position, and the engine shall trigger fills against them as replay candles cross those levels.
- **FR\-10 — Account state.** The engine shall maintain and expose: cash balance, equity, realized P&L, unrealized P&L, open position size and direction, applied fees, spread cost, slippage, margin used, and running drawdown.
- **FR\-11 — Fill logic.** Simulated fills shall apply configured spread and slippage assumptions rather than filling at an idealized mid\-price, so results reflect realistic execution.

### 4\.4 Trading Chart

- **FR\-12 — Chart baseline.** The chart shall be a candlestick chart showing current price, a crosshair, volume, entry/exit markers, and stop\-loss/take\-profit levels, plus a live position P&L readout.
- **FR\-13 — Indicators (post\-MVP).** Moving averages, RSI, MACD, Bollinger Bands, Fibonacci tools, and freehand drawing tools are planned additions after the core chart ships (see Phase 3, §9).
- **FR\-14 — Charting library.** The chart shall be built on an existing, proven charting library (e.g., TradingView Lightweight Charts) rather than a custom\-built chart renderer, to avoid re\-solving a well\-understood problem.

### 4\.5 Training Modes

- **FR\-15 — Free Practice.** The user chooses asset, date, timeframe, capital, and speed directly.
- **FR\-16 — Random Challenge.** The system selects a historical starting point at random and withholds the date, market regime, and outcome from the user until the session ends.
- **FR\-17 — Strategy Challenge.** The system can impose a training objective (e.g., breakout trading, trend following, mean reversion, or a specific risk\-management rule) and score adherence to it.
- **FR\-18 — Decision Journal.** Before entering a trade, the user may record a reason (breakout, trend continuation, reversal, support/resistance, indicator signal, news, other) and free\-text notes, attached to that trade for later review.
- **FR\-24 — AI\-Generated Scenario Mode (future, not yet implemented).** In addition to real historical replay, the system shall support a mode where synthetic OHLCV data is generated by an AI model instead of sourced from a historical dataset, so a session can be built around a specific pattern or strategy rather than whatever the historical record happens to contain. Two entry points are anticipated: (a) the system feeds the AI one of a curated set of predefined scenario prompts (e.g., "head\-and\-shoulders reversal," "bull flag continuation," "range\-bound chop before a breakout") to teach a specific, known pattern; and (b) the user supplies a free\-text description of a scenario, pattern, or strategy they want to practice, and the AI generates a session designed to exercise exactly that. Generated data shall flow through the same replay pipeline (ReplayController / CandleUpdate) as historical data — from the chart's perspective a synthetic session is just another data source — and shall be clearly labeled to the user as AI\-generated, not real market history, so it is never confused with a genuine historical session during scoring or review. Captured here to avoid losing the idea; see Phase 5 (§9) and Open Questions (§12) — deliberately out of scope until the core simulator and training modes are stable.

### 4\.6 Session Analytics & Review

- **FR\-19 — End\-of\-session summary.** On session end, the system shall display starting balance, ending balance, return, trade count, win/loss count, win rate, profit factor, maximum drawdown, average winner/loser size, and basic risk metrics.
- **FR\-20 — Equity curve & trade log.** The system shall render an equity curve and a trade\-by\-trade history for the session.
- **FR\-21 — Replay Review.** After a session ends, the user shall be able to step back through their own decisions with subsequent market movement revealed — future\-data protection (§6.2) applies only during live play, not during this post\-session review.

## 5\. Data Requirements

### 5\.1 Data Model

Historical candles are normalized into one common structure regardless of source:

| Field | Description |
| --- | --- |
| symbol | Instrument identifier (e.g., BTC/USD, AAPL, EUR/USD) |
| asset\_type | stock \| forex \| crypto |
| timestamp | Candle open time (UTC) |
| timeframe | 5m \| 15m \| 1h \| 1D (1m planned later) |
| open, high, low, close | Price fields |
| volume | Traded volume for the interval |
| source | Originating data provider, for auditability |

*Example row:* `BTC/USD | crypto | 2024-04-15 10:05 | 5m | O/H/L/C | volume`

### 5\.2 Historical Data Strategy

- **FR\-22 — Own data store.** The system shall not call the market\-data provider on every replay step. A data\-ingestion pipeline shall acquire, normalize, validate, and deduplicate OHLCV data, then store it in the system's own database so replay speed and reliability are independent of provider latency and rate limits.
- **FR\-23 — Provider evaluation.** Twelve Data is the recommended initial provider to evaluate; Finnhub is a strong alternative. The final choice shall be made after testing actual historical 5\-minute data depth available under each provider's licensing and pricing terms — not on documentation claims alone (see §10, data\-feasibility study).

## 6\. Non\-Functional Requirements

### 6\.1 Performance

- **NFR\-1.** Replay speed changes (0.25×–100×) shall feel immediate (target: \<100ms to next\-candle render) since candles are served from local storage, not a live upstream feed.
- **NFR\-2.** The system shall support many concurrent replay sessions without one session's speed affecting another's, implying per\-session state rather than a shared global clock.

### 6\.2 Future\-Data Protection (Security)

This is treated as a hard, non\-negotiable requirement rather than an implementation detail, because it is the one failure mode that breaks the product's core promise.

- **NFR\-3 — No bulk shipping of future data.** The complete historical dataset for a session shall never be transmitted to the browser with future candles merely hidden by client\-side JavaScript. A user who inspects network traffic, WebSocket frames, or in\-memory application state must not be able to recover prices beyond the current replay point.
- **NFR\-4 — Server\-authoritative reveal.** The data flow shall be: **Database → Replay Server → currently\-allowed candle stream → Browser.** The replay server, not the client, decides which timestamp/candles may be revealed at any moment, validated per session.
- **NFR\-5 — Session\-scoped delivery.** Each replay session shall carry server\-side state binding a session ID to its current allowed timestamp; a WebSocket or request for "next candle" shall be checked against that state before any data is returned.

### 6\.3 Reliability & Data Integrity

- **NFR\-6.** Ingested OHLCV data shall be validated (no negative prices/volume, high ≥ low ≥ 0, monotonic timestamps) and deduplicated before being written to the market database.
- **NFR\-7.** P&L, fee, slippage, and drawdown calculations shall be deterministic and covered by unit tests, since incorrect account math directly undermines training value.

### 6\.4 Scalability & Portability

- **NFR\-8.** The market database shall be a time\-series\-appropriate store (e.g., PostgreSQL \+ TimescaleDB) so query patterns over large OHLCV history remain performant as symbol and history coverage grows.
- **NFR\-9.** A caching layer (e.g., Redis) is not required for MVP but should be straightforward to introduce if session concurrency grows.

### 6\.5 Licensing & Compliance

- **NFR\-10.** Historical market data usage shall comply with the selected provider's redistribution and storage licensing terms — "store locally for replay" is a different license class than "display live quotes," and must be confirmed before committing to a provider.

## 7\. System Architecture

| Layer | Primary responsibility |
| --- | --- |
| Data providers | Historical stock, forex, and crypto data |
| Ingestion | Download, normalize, validate, deduplicate |
| Market database | Store OHLCV / time\-series data |
| Replay engine | Control time, speed, candle visibility, and sessions |
| Trading engine | Orders, fills, positions, fees, slippage, P&L |
| WebSocket | Deliver only permitted replay data, in real time |
| Frontend | Chart, controls, account, orders, and training UI |
| Analytics | Performance, risk, drawdown, and trade statistics |

**Data flow:** Data providers → Ingestion → Normalization/validation → PostgreSQL/TimescaleDB → Replay engine → WebSocket → Trading UI → Analytics engine.

## 8\. Suggested Technology Stack

- **Frontend:** Next.js / React.
- **Chart:** TradingView Lightweight Charts.
- **Backend:** Node.js/TypeScript or Python/FastAPI.
- **Database:** PostgreSQL \+ TimescaleDB for time\-series market data.
- **Real\-time transport:** WebSockets.
- **Cache:** Redis, introduced if and when session concurrency requires it.

*This stack is a starting recommendation, not a locked decision — validate against team familiarity and the data\-feasibility findings in §10 before committing.*

## 9\. Development Phases

- **Phase 1 — Core simulator.** Accounts, market selection, 5m/15m/1h/1D charts, historical data, replay with speed control, buy/sell, positions, P&L, basic end\-of\-session results.
- **Phase 2 — Training.** Random Challenge, Strategy Challenge, decision journal, risk rules, stop\-loss/take\-profit, scoring, session replay review.
- **Phase 3 — Advanced trading.** Indicators, drawing tools, multiple simultaneous positions, leverage, configurable fees/slippage, advanced order types, short selling, multi\-asset portfolios.
- **Phase 4 — Education.** Structured courses → lessons → historical challenges → performance feedback → next recommended lesson.
- **Phase 5 — AI\-generated scenarios (future).** AI\-generated synthetic OHLCV sessions from predefined or user\-described scenarios (FR\-24), built once the core simulator, training modes, and data pipeline are stable enough to build on top of.

## 10\. Recommended Next Step: Data Feasibility Study

Before committing to a data provider, model actual requirements against real pricing and coverage rather than provider marketing pages:

- Target MVP coverage: roughly 100 stocks, 30 forex pairs, and 30 crypto pairs, at 5\-minute resolution, across 5–10 years of history.
- For each candidate provider (Twelve Data, Finnhub, and any other viable alternative), determine: actual historical 5\-minute depth available, API request volume and rate limits needed to backfill that coverage, storage footprint, licensing terms for local storage and redistribution within a training product, and total cost at MVP scale.
- Output: a recommendation for the provider (or combination of providers) that yields the largest practical, legally usable historical dataset within the MVP budget.

## 11\. Out of Scope for MVP

- Live/real\-money trading or brokerage integration of any kind.
- 1\-minute timeframe data (deferred — see FR\-2).
- Multi\-asset portfolios and simultaneous multi\-position management (Phase 3).
- Technical indicators and drawing tools (Phase 3).
- Structured courses and lesson sequencing (Phase 4).
- AI\-generated synthetic scenario data (FR\-24, Phase 5) — captured in these requirements so the idea isn't lost, but deliberately not scoped or implemented yet.

## 12\. Open Questions & Risks

- **Data licensing risk.** Provider terms may restrict local storage or redistribution in ways that limit dataset size or require a different provider mix than assumed in §10.
- **Cost at scale.** Historical 5\-minute data across \~160 instruments for 5–10 years may be materially more expensive than headline provider pricing suggests; this is the reason §10 is sequenced before further build\-out.
- **Fill\-model realism.** Slippage and spread assumptions are simulated, not derived from historical order\-book depth; results will be directionally, not perfectly, realistic. Worth stating explicitly to users so they calibrate expectations.
- **Definition of "random" in Random Challenge.** Needs a decision on sampling method (uniform over available history vs. stratified by volatility regime) so challenges are neither trivially easy nor unrepresentative.
- **Anti\-cheat scope.** NFR\-3–NFR\-5 cover network/client inspection. Whether to also guard against a user simply looking up the real historical date/price externally is a product decision, not a technical one, and should be resolved before Phase 2 scoring is finalized.
- **Synthetic data realism & trust (FR\-24).** AI\-generated OHLCV must still satisfy basic candle invariants (high ≥ open/close ≥ low, no discontinuities that break the chart or the replay engine) and needs to be unmistakably labeled as synthetic in the UI and in analytics, so neither a trainee nor an educator assigning it ever confuses a generated session with a real historical outcome. Determinism/reproducibility (can the same prompt regenerate the same session for grading?), generation cost at scale, and guarding against unsafe or nonsensical content in free\-text user prompts are all unresolved and should be scoped before Phase 5 begins.

## 13\. Glossary

- **OHLCV** — Open, High, Low, Close, Volume: the standard fields describing one candle/bar of price history.
- **Slippage** — The difference between an order's expected fill price and its actual simulated fill price.
- **Drawdown** — The decline from a peak in account equity to a subsequent trough, typically expressed as a percentage.
- **Profit factor** — Gross profit divided by gross loss across all trades in a session.
- **Synthetic Scenario** — A replay session whose OHLCV data was generated by an AI model from a scenario description (predefined or user\-supplied) rather than sourced from real historical market data (see FR\-24).
