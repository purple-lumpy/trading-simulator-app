import { useEffect, useMemo, useState } from "react";
import type { Candle } from "trading-charter-app-library";
import { TIMEFRAME_PRESETS, resampleCandles } from "trading-charter-app-library";
import { ChartNavBar, type DrawingToolName } from "./ChartNavBar";
import { ChartPanel } from "./ChartPanel";
import { generateSampleCandles } from "./sampleData";
import { fetchRealBaseCandles } from "./realData";
import { INSTRUMENTS, type Instrument } from "./instruments";
import "./index.css";

/**
 * Two "tiers" of base candle series exist, not one - see this
 * component's own doc comment below (just above `export function App()`)
 * for the general "one shared base, resampled per timeframe" shape both
 * real and sample data follow, and see this comment for why it's *two*
 * shared bases per path now, not one. A single base fine enough to
 * resample "15s" and long enough to still give "1d" a full 300-bar
 * history would need 300 * 86400 / 15 = 1,728,000 candles - workable in
 * principle, but wasteful, and for real data would mean fetching that
 * many 1-minute Coinbase bars in hundreds of chunked requests just to
 * show a handful of daily candles.
 *
 * Splitting TIMEFRAME_PRESETS at "30m" into a fine tier (15s through
 * 30m, resampled from a 1-minute base) and a coarse tier (1h through 1d,
 * resampled from a 1-hour base) keeps each base a few thousand candles
 * instead of millions. 3600 (not, say, 10800/"3h") is the coarse tier's
 * own base specifically because every coarse preset is an exact multiple
 * of 3600, where 3h/4h/8h are NOT exact multiples of each other - see
 * timeframes.test.ts's own assertions on this.
 *
 * The cost: a switch that crosses tiers (e.g. 30m -> 1h) is the one
 * place price history can visibly "jump" mid-session, since the two
 * tiers are independent series rather than one continuous one - for
 * sample data that's two unrelated random walks, for real data it's two
 * independently-fetched (but both genuinely real) Coinbase granularities.
 * Within a tier, switching timeframe still re-buckets the exact same
 * underlying prices exactly as before this split existed.
 */
const TIER_SPLIT_SECONDS = 1800; // 30m - <= this uses the fine tier, > this uses the coarse tier
const COARSE_BASE_SECONDS = 3600; // 1h - shared by both the sample and real coarse tiers
const LONGEST_PRESET_SECONDS = TIMEFRAME_PRESETS[TIMEFRAME_PRESETS.length - 1].seconds; // 1d

/**
 * Finest granularity the sample-data fine-tier base series is generated
 * at - every fine-tier preset (15/30/60/300/900/1800) is an exact
 * multiple of the shortest preset, which is exactly what lets
 * resampleCandles() derive any of them from this same series without a
 * remainder bucket (see that function's own doc comment on why a
 * non-multiple target is rejected). Reading it from the presets array
 * itself, rather than hardcoding 15, keeps this tied to whatever the
 * shortest shipped preset actually is.
 */
const SAMPLE_FINE_BASE_SECONDS = TIMEFRAME_PRESETS[0].seconds;
/** How many fine-tier-granularity candles to generate: enough that the fine tier's own longest preset (30m) still gets a 300-bar session, same reasoning as SAMPLE_COARSE_BASE_CANDLE_COUNT below just at the other tier's granularity. */
const SAMPLE_FINE_BASE_CANDLE_COUNT = (300 * TIER_SPLIT_SECONDS) / SAMPLE_FINE_BASE_SECONDS;
/** How many coarse-tier-granularity (1h) candles to generate: enough that the longest preset overall (1d) still gets a 300-bar session. */
const SAMPLE_COARSE_BASE_CANDLE_COUNT = (300 * LONGEST_PRESET_SECONDS) / COARSE_BASE_SECONDS;

/**
 * The finest resolution real data can ever supply (Coinbase Exchange's
 * candles endpoint has no sub-1-minute `granularity` value - see
 * realData.ts's own doc comment). "1m" is guaranteed to exist as a
 * preset (data-server and this constant would need updating together
 * if that ever changed), so this is read from TIMEFRAME_PRESETS rather
 * than hardcoded 60, the same way SAMPLE_FINE_BASE_SECONDS reads the
 * shortest preset instead of hardcoding 15.
 */
const REAL_FINE_BASE_SECONDS = TIMEFRAME_PRESETS.find((p) => p.label === "1m")?.seconds ?? 60;
/** Same reasoning as SAMPLE_FINE_BASE_CANDLE_COUNT above, just at the real-data fine-tier granularity. */
const REAL_FINE_BASE_CANDLE_COUNT = (300 * TIER_SPLIT_SECONDS) / REAL_FINE_BASE_SECONDS;
/** Same reasoning as SAMPLE_COARSE_BASE_CANDLE_COUNT above, just for real data's coarse tier. */
const REAL_COARSE_BASE_CANDLE_COUNT = (300 * LONGEST_PRESET_SECONDS) / COARSE_BASE_SECONDS;

/**
 * Presets a 15s/30s-less real-data base series can actually resample
 * into - resampleCandles() rejects a target finer than its source, so
 * offering "15s"/"30s" while real data is active would just be a
 * guaranteed crash the moment someone picked one.
 */
const REAL_DATA_PRESETS = TIMEFRAME_PRESETS.filter((p) => p.seconds >= REAL_FINE_BASE_SECONDS);

/**
 * Basic simulator shell: exists to prove trading-charter-app-library works
 * as a real installed dependency (not a relative import) end to end —
 * install, build, import, render, replay. Market selection, the trading
 * engine, and account simulation are later build-sequence steps
 * (implementation-plan.md §4, steps 2–6), not this component's job yet.
 *
 * Timeframe selection lives here, one level above ChartPanel, because it's
 * the state that decides which resampling of the data ChartPanel gets fed
 * — same "own the state, hand props down" shape as before. What changed
 * is *how* a change propagates: this used to regenerate an entirely
 * independent random candle set per timeframe and remount ChartPanel from
 * scratch (`key={timeframeSeconds}`) to force a fresh ChartCore/
 * ReplayController pair — simple, but it meant every switch "stopped
 * everything" (a hard replay reset) and showed different, inconsistent
 * prices at each timeframe. Instead, each tier's own base series (see the
 * tier-split comment above the constants) is generated/fetched exactly
 * once, and every timeframe's candle set is derived from whichever tier
 * it falls in via `resampleCandles()` — so switching timeframe re-buckets
 * already-consistent prices instead of rolling new ones (except across a
 * tier boundary - see that same comment), and ChartPanel (no longer
 * remounted — the `key` below is gone) picks the replay back up from the
 * equivalent point instead of starting over. See ChartPanel's own doc
 * comment for how it reacts to a `timeframeSeconds`/`candles` change
 * without a full remount.
 */
export function App() {
  const [timeframeSeconds, setTimeframeSeconds] = useState<number>(300); // 5m — matches a real bar's actual duration

  // Generated once (empty deps) regardless of the selected timeframe —
  // one per tier now, see the tier-split comment above the constants.
  // Both stay populated even once real data loads - together they're the
  // fallback dataMode never leaves the app without, and what a
  // failed/pending real fetch is quietly still showing.
  const sampleFineBaseCandles = useMemo(() => generateSampleCandles(SAMPLE_FINE_BASE_CANDLE_COUNT, SAMPLE_FINE_BASE_SECONDS), []);
  const sampleCoarseBaseCandles = useMemo(() => generateSampleCandles(SAMPLE_COARSE_BASE_CANDLE_COUNT, COARSE_BASE_SECONDS), []);

  // "real" only ever gets entered once BOTH tiers' fetches succeed with a
  // non-empty candle set (see the effect below) - a partial success
  // (e.g. the fine tier loads but the coarse one fails) stays on sample
  // data entirely rather than mixing a real fine tier with a synthetic
  // coarse one, which would make a tier-crossing switch (30m -> 1h) jump
  // between a real price path and a fake one instead of just between two
  // real (if independent) ones. There is deliberately no "loading" state
  // of its own, since the sample base series are already a complete,
  // valid series to render from the very first paint; real data just
  // quietly takes over in place if and when both tiers arrive.
  const [dataMode, setDataMode] = useState<"sample" | "real">("sample");
  const [realFineBaseCandles, setRealFineBaseCandles] = useState<Candle[] | null>(null);
  const [realCoarseBaseCandles, setRealCoarseBaseCandles] = useState<Candle[] | null>(null);
  // `null` means "most recent data" (the default, fetched on mount below)
  // - the date picker in ChartNavBar sets this to replay forward from a
  // chosen day instead (see fetchRealBaseCandles's own `fromDate` doc
  // comment). Lives here, not in ChartNavBar, for the same "App owns the
  // state that decides which data ChartPanel gets fed" reasoning
  // `timeframeSeconds` already follows - ChartNavBar only renders the
  // control and reports a choice back up.
  const [startDate, setStartDate] = useState<Date | null>(null);
  /**
   * Which instrument is selected - see instruments.ts's own doc comment
   * for why this alone (no separate "has real data" flag) is enough to
   * drive the fetch effect below. Lives here, not in ChartNavBar, for
   * the same "App owns the state that decides which data ChartPanel
   * gets fed" reasoning startDate/activeTool already follow.
   */
  const [instrument, setInstrument] = useState<Instrument>(INSTRUMENTS[0]);
  // Which drawing tool the toolbar (rendered by ChartNavBar) currently
  // has selected - "none" is the cross/reset tool, plain chart
  // navigation. Lives here rather than in ChartPanel (which is what
  // actually resolves it to a real DrawingTool instance and calls
  // chart.setActiveDrawingTool()) for the same reason startDate lives
  // here rather than in ChartNavBar: ChartNavBar (the control) and
  // ChartPanel (the consumer) are siblings under App, not parent/child,
  // so the state that connects them has to live at the level both can
  // reach - see DrawingToolName's own doc comment.
  const [activeTool, setActiveTool] = useState<DrawingToolName>("none");

  useEffect(() => {
    let cancelled = false;
    // Reset to sample immediately, before the new instrument's fetch
    // even starts - without this, switching from an instrument that had
    // real data (BTC/USD) to one that doesn't (AAPL) would keep showing
    // BTC's own real candles, now mislabeled under AAPL's name, until
    // the new fetch resolved and failed. The two base-candle states are
    // cleared alongside dataMode for the same reason - isReal below
    // requires both non-null, so leaving them populated from the
    // previous instrument couldn't actually cause a mislabel by itself,
    // but it's still stale data from a different symbol sitting in
    // state for no reason.
    setDataMode("sample");
    setRealFineBaseCandles(null);
    setRealCoarseBaseCandles(null);
    Promise.all([
      fetchRealBaseCandles(REAL_FINE_BASE_CANDLE_COUNT, REAL_FINE_BASE_SECONDS, instrument.symbol, startDate ?? undefined),
      fetchRealBaseCandles(REAL_COARSE_BASE_CANDLE_COUNT, COARSE_BASE_SECONDS, instrument.symbol, startDate ?? undefined),
    ]).then(([fine, coarse]) => {
      if (cancelled || !fine || !coarse) return; // either tier down/unreachable/no data for this symbol - stay on sample, silently (see instruments.ts's own doc comment: this is also how a no-real-data instrument like EUR/USD or AAPL always ends up here)
      setRealFineBaseCandles(fine);
      setRealCoarseBaseCandles(coarse);
      setDataMode("real");
      // 15s/30s have no real-data equivalent (see REAL_FINE_BASE_SECONDS) -
      // if that's what was selected while sample data was still active,
      // move up to the shortest timeframe real data actually supports
      // rather than leaving a selection resampleCandles would reject.
      setTimeframeSeconds((current) => (current < REAL_FINE_BASE_SECONDS ? REAL_FINE_BASE_SECONDS : current));
    });
    // Re-fetches whenever startDate or instrument changes (picking a new
    // date or symbol, or clearing the date back to "most recent") - not
    // a polling/refetch loop for the *same* range: this is still a
    // historical-replay trainer, not a live feed (see the header copy
    // below), so a fetch only ever fires in response to the user
    // actually asking for a different range or symbol, on mount or via
    // the date picker/instrument dropdown.
    return () => {
      cancelled = true;
    };
  }, [startDate, instrument]);

  const isReal = dataMode === "real" && realFineBaseCandles !== null && realCoarseBaseCandles !== null;
  // Belt-and-braces alongside the setTimeframeSeconds bump above: React
  // batches both state updates from the same effect callback into one
  // render, but clamping here too means a stray render that somehow saw
  // dataMode flip before timeframeSeconds did still can't hand
  // resampleCandles a target finer than its source (which throws, per
  // its own doc comment) instead of just briefly rendering the wrong bar size.
  const effectiveTimeframeSeconds = isReal ? Math.max(timeframeSeconds, REAL_FINE_BASE_SECONDS) : timeframeSeconds;

  // Which tier effectiveTimeframeSeconds falls into - see the tier-split
  // comment above the constants for why this, not a single shared base,
  // decides what resampleCandles() below reads from. `!` is safe on the
  // real branches: isReal is only true once both real base states are
  // non-null (see its own definition just above).
  const useCoarseTier = effectiveTimeframeSeconds > TIER_SPLIT_SECONDS;
  const activeBaseCandles = isReal
    ? useCoarseTier
      ? realCoarseBaseCandles!
      : realFineBaseCandles!
    : useCoarseTier
      ? sampleCoarseBaseCandles
      : sampleFineBaseCandles;
  const activeBaseSeconds = useCoarseTier ? COARSE_BASE_SECONDS : isReal ? REAL_FINE_BASE_SECONDS : SAMPLE_FINE_BASE_SECONDS;

  const candles = useMemo(
    () => resampleCandles(activeBaseCandles, activeBaseSeconds, effectiveTimeframeSeconds),
    [activeBaseCandles, activeBaseSeconds, effectiveTimeframeSeconds]
  );
  const availablePresets = isReal ? REAL_DATA_PRESETS : TIMEFRAME_PRESETS;

  return (
    <div className="app">
      {/* Instrument/timeframe/real-vs-sample status and the real-time-pacing
          explanation used to be spelled out again here as plain text under
          the title - removed as redundant now that the instrument picker,
          its Real/Sample badge, and the timeframe picker just below already
          show all of the same information live, per-selection, without
          needing a separate line to keep in sync. */}
      <header>
        <h1>Market Replay Trainer</h1>
      </header>
      <ChartNavBar
        instruments={INSTRUMENTS}
        instrument={instrument}
        onInstrumentChange={setInstrument}
        isReal={isReal}
        timeframeSeconds={effectiveTimeframeSeconds}
        onTimeframeChange={setTimeframeSeconds}
        presets={availablePresets}
        startDate={startDate}
        onStartDateChange={setStartDate}
        activeTool={activeTool}
        onActiveToolChange={setActiveTool}
      />
      <ChartPanel candles={candles} timeframeSeconds={effectiveTimeframeSeconds} activeTool={activeTool} />
    </div>
  );
}
