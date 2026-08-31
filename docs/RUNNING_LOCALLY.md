# Running locally

## Prerequisites

- Node.js 20 or newer (the deploy workflow pins Node 20; local dev has been used with Node 22 without issue).
- npm (this repo uses npm workspaces — one install at the repo root covers all three packages, you never `cd` into a package to install its own dependencies separately).

## Install

```bash
git clone https://github.com/SigaukeCogitater/trading-simulator-app.git
cd trading-simulator-app
npm install
```

## Option A — sample data only (no setup beyond install)

```bash
npm run dev:simulator
```

Opens the app on Vite's dev server (default `http://localhost:5173`). Every instrument shows a "Sample" badge and renders locally-generated, realistic-looking synthetic candles — no network calls, no API keys, nothing else to configure. This is the fastest path to working on the chart, the replay controls, drawing tools, or the settings panel.

## Option B — real data (crypto only, today)

Real data currently means live historical crypto candles from Coinbase Exchange's public API, for BTC/USD, ETH/USD, SOL/USD, and LTC/USD — see [`DATA_PROVIDERS.md`](DATA_PROVIDERS.md) for why it's crypto-only right now and what's being explored for forex/stocks.

1. Copy the env template and (optionally) fill it in:

   ```bash
   cp .env.example .env
   ```

   No key is actually required for Coinbase — it's a public, unauthenticated endpoint. `.env`'s `FINNHUB_API_KEY` is optional and only powers `data-server`'s `/diagnose` and `/quote` routes (diagnostic/reference only, not used for any candle data); leave it blank and real candle data still works.

2. In one terminal, run the data proxy:

   ```bash
   npm run dev:server
   ```

   Starts `data-server` on `http://localhost:4001`. You should see `[data-server] listening on http://localhost:4001` in the terminal.

3. In another terminal, run the app as usual:

   ```bash
   npm run dev:simulator
   ```

4. Pick BTC/USD (or another Coinbase-listed pair) in the instrument dropdown — it should now show a "Live"/real badge instead of "Sample". Picking EUR/USD or AAPL still shows Sample, correctly — Coinbase has no data for those, see `DATA_PROVIDERS.md`.

If `data-server` isn't running, or the fetch fails for any reason, `simulator-app` silently falls back to sample data rather than erroring — that's intentional (see `realData.ts`'s own doc comments), so a blank "Live" badge that never lights up is your cue to check the `data-server` terminal for errors, not a broken app.

## Building for production

```bash
npm run build:lib        # builds trading-charter-app-library first — simulator-app imports its compiled dist/, not source
npm run build:simulator  # builds simulator-app, output in src/simulator-app/dist/
# or, both in the right order:
npm run build:site
```

Preview a production build locally:

```bash
npm run --workspace=src/simulator-app preview
```

The production build always runs on sample data, even locally — `realData.ts` skips the real-data fetch entirely outside Vite's dev server (see `docs/ARCHITECTURE.md`'s note on why). This isn't a bug to work around; it's the same reason the deployed GitHub Pages site is sample-data-only.

## Running the library's tests

```bash
npm run test:lib
```

Runs the `trading-charter-app-library` Jest suite (`ChartCore`, `ReplayController`, every drawing tool, shapes, etc.). `simulator-app` and `data-server` don't have test suites yet.

## Troubleshooting

- **Port already in use (5173 or 4001).** Something else is already running there — stop it, or pass Vite a different port (`npm run dev:simulator -- --port 5174`) / set `DATA_SERVER_PORT` in `.env` for `data-server`. If you change `data-server`'s port, update `DATA_SERVER_URL` in `src/simulator-app/src/realData.ts` to match — it's hardcoded rather than read from an env var (see that file's own comment on why).
- **CORS error in the browser console.** `data-server` should already send permissive CORS headers for local dev (`app.use(cors())` in `src/data-server/src/index.ts`) — if you're seeing this, double-check you're hitting `data-server` on its own port and not accidentally proxying through Vite.
- **"Live" badge never appears, no console error.** `data-server` is probably not running, or the terminal running it shows a fetch error reaching Coinbase — check that terminal, and confirm the instrument you picked is one of the four real Coinbase pairs.
- **A production build (`vite preview` or the deployed site) never shows real data, even for BTC/USD.** Expected — see the note above.
- **`npm run build:simulator` fails resolving `trading-charter-app-library`.** Run `npm run build:lib` first — the simulator app depends on the library's built `dist/`, which only exists after that build runs.
