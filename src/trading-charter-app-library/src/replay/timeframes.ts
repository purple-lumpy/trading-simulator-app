/**
 * Standard candle timeframe presets. Picking one of these is how a
 * consumer answers "what does 1x actually mean here": at 1x speed,
 * `ReplayController({ baseIntervalMs: realtimeIntervalMs(seconds) })`
 * takes genuinely that many real seconds to reveal one bar — the same
 * pace it would arrive at from a live feed. There's nothing forcing 1x to
 * be real-time (`setSpeed` still fast-forwards on top of it, same as
 * always); this just makes real-time an honest, selectable option instead
 * of an arbitrary constant, so a 5m candle actually takes 5 real minutes
 * at 1x and a 15s candle takes 15 real seconds — whichever one is picked.
 *
 * The shorter timeframes exist mainly so testing and day-to-day
 * development don't require sitting through real 5-minute bars to see
 * replay behavior: pick 15s or 30s bars while iterating, and 5m (or
 * larger, once the data pipeline supports it) for a session meant to feel
 * like an actual trading session.
 */
export interface TimeframePreset {
  readonly label: string;
  readonly seconds: number;
}

/**
 * The eleven timeframes this library ships presets for — see the module
 * doc comment above for what picking one means. Ordered shortest to
 * longest; every entry from "1m" up is an exact multiple of every entry
 * before it that a real base series could plausibly resample from (see
 * resample.ts's own doc comment on why that matters) — consumers split
 * these into a "fine" tier (up to "30m") and a "coarse" tier ("1h" and
 * up) rather than resampling all the way from one shared base, since a
 * single base fine enough for "15s" and long enough to give "1d" a full
 * 300-bar history would need an unworkable number of candles (see
 * simulator-app's App.tsx for that split in practice).
 */
export const TIMEFRAME_PRESETS: readonly TimeframePreset[] = [
  { label: "15s", seconds: 15 },
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
  { label: "30m", seconds: 1800 },
  { label: "1h", seconds: 3600 },
  { label: "3h", seconds: 10800 },
  { label: "4h", seconds: 14400 },
  { label: "8h", seconds: 28800 },
  { label: "1d", seconds: 86400 },
];

/**
 * The genuinely-real-time `baseIntervalMs` for a timeframe: at 1x speed, a
 * `ReplayController` configured with this takes exactly `timeframeSeconds`
 * real seconds to reveal one bar, matching how long that bar actually
 * represents in the market.
 */
export function realtimeIntervalMs(timeframeSeconds: number): number {
  return timeframeSeconds * 1000;
}
