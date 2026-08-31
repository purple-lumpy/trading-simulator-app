# Contributing to Market Replay Trainer

Thanks for taking a look — this project is genuinely early and there's a lot of real, non-busywork to do: a charting engine that needs more indicators and drawing tools, a simulator that doesn't yet simulate trading at all, and a data story that's solid for crypto and open for everything else. Contributions of any size are welcome, from a typo fix to taking on a whole roadmap item.

## Before you start

Skim [`README.md`](README.md) for the lay of the land, and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the three packages fit together. If you're picking up something non-trivial, it's worth opening an issue first to say what you're planning — mainly so two people don't end up building the same thing, not because permission is required.

## Dev setup

Full instructions (including running the real-data proxy and the library's tests) are in [`docs/RUNNING_LOCALLY.md`](docs/RUNNING_LOCALLY.md). Short version:

```bash
npm install
npm run dev:simulator   # app on sample data, http://localhost:5173
```

## How this repo is organized

npm workspaces, three packages, one root `npm install`:

- `src/trading-charter-app-library` — the charting engine. No framework dependency, no React import anywhere in it. If a change belongs conceptually to "how a chart is drawn or replayed" rather than "how the demo app is laid out," it goes here.
- `src/simulator-app` — the React app that consumes the library as an installed dependency (`trading-charter-app-library`'s built `dist/`, not its source — see the note in Architecture about why `npm run build:lib` has to run before the simulator app can build).
- `src/data-server` — the local real-data proxy. Currently just Coinbase Exchange for crypto; see [`docs/DATA_PROVIDERS.md`](docs/DATA_PROVIDERS.md) if you're working on data sources.

## Coding conventions

- **TypeScript throughout**, reasonably strict. Match the existing style in whichever file you're editing rather than introducing a new pattern for one change.
- **Comments explain *why*, not *what*.** This codebase leans heavily on doc comments that record the reasoning behind a non-obvious choice (why Coinbase and not Binance, why a resize observer isn't used here, why a value is hardcoded instead of configurable yet) so the next person doesn't have to rediscover it or accidentally undo it. When you make a non-obvious choice, leave the same kind of note.
- **No dead configurability.** Options exist on `ChartOptions` because something already needs them (or a settings-panel UI already exposes them), not speculatively "in case someone wants it later."
- **Tests live next to what they test**, in `__tests__` directories, using Jest. Look at an existing test file for a plugin/tool before adding a new one — there's an established local `mockCtx()` pattern for canvas-context mocking that new drawing-tool/indicator tests should follow rather than reinvent.

## Running tests

```bash
npm run test:lib   # trading-charter-app-library's Jest suite
```

`simulator-app` and `data-server` don't have automated tests yet — adding a first one for either is a welcome contribution on its own.

## Where help is most useful right now

**In the charting library:**
- More indicators — only a Moving Average exists today. RSI, MACD, and Bollinger Bands are called out as post-MVP targets in [`docs/requirements.md`](docs/requirements.md) (§4.4) and have no implementation yet.
- More drawing tools — Fibonacci retracement/extension is explicitly wanted per the requirements doc and isn't built. The `DrawingTool` interface and the `Trendline`/`HorizontalLine`/`VerticalLine`/`TraceLine` implementations in `src/trading-charter-app-library/src/plugins/drawing-tools/` are the pattern to follow.
- Rendering performance at large candle counts hasn't been profiled or stress-tested yet.

**In the simulator app:**
- There is currently **no simulated trading at all** — no buy/sell, no positions, no account balance, no P&L. That's the single biggest gap between what exists today and the product described in `docs/requirements.md` (§4.3, FR-8 through FR-11). This is the highest-leverage area for a substantial contribution.
- Training modes (Random Challenge, Strategy Challenge, decision journal — §4.5) and session analytics/review (§4.6) build on top of that trading layer and are unstarted.

**In data:**
- Finding (or confirming/ruling out) a free or cheap source of real, charting-grade **intraday forex** OHLC history is an open problem — see [`docs/DATA_PROVIDERS.md`](docs/DATA_PROVIDERS.md) for what's been tried so far (including an early, unverified look at Deriv's API) and what "good enough" would look like. If you know of one, or have tested one, opening an issue or a PR with what you found is genuinely valuable even without any code attached.
- Same for single-stock intraday data, which has the same free-tier scarcity problem per `docs/implementation-plan.md` §2.2.

**Docs and DX:**
- More `__tests__` coverage for `simulator-app` and `data-server`.
- Anything in this docs set that turns out to be unclear or wrong once you've actually tried following it — please open a PR fixing it rather than working around it silently.

## Making a change

1. Fork or branch, make your change, and run whatever tests apply (`npm run test:lib` at minimum if you touched the library).
2. Keep commits focused — one logical change per commit is easier to review than a batch of unrelated ones.
3. Open a PR describing **what** changed and, more importantly, **why** — the same "why, not just what" standard this codebase's own comments hold to. Link the issue it addresses if there is one.
4. Be patient — this is a small project without a dedicated review team yet, so turnaround may not be fast.

## Ground rules

Be respectful and assume good faith in issues, PRs, and reviews — critique the code and the idea, not the person. Disagreement about a technical approach is normal and welcome; how it's said is what matters.

## License

By contributing, you agree your contribution is licensed under this project's [Apache License 2.0](LICENSE).
