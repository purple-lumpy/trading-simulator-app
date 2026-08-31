import type { Candle } from "../core/types.js";

/**
 * Synthesizes a deterministic, plausible in-progress path through a
 * candle's OHLC — the illusion of "live" a real feed gives you for free
 * (every trade nudges O/H/L/C as it happens) but historical data doesn't
 * have, since it only records the bar after it settled. ReplayController
 * uses this when `intrabarTicks` is set so historical replay reveals each
 * bar building up instead of popping in fully formed.
 *
 * Routes the "current price" through open -> low -> high -> close for an
 * up candle (close >= open) or open -> high -> low -> close for a down
 * candle — the same "excursion away from open before resolving" shape a
 * real intrabar chart usually shows — and returns `steps - 1` intermediate,
 * non-final snapshots sampled evenly along it. The `steps`th tick is the
 * settled candle itself and isn't part of this function's output;
 * ReplayController emits that one separately, as `final: true`.
 */
export function synthesizeIntrabarPath(candle: Candle, steps: number): Candle[] {
  const count = Math.max(0, steps - 1);
  if (count === 0) return [];

  const up = candle.close >= candle.open;
  const waypoints = up
    ? [candle.open, candle.low, candle.high, candle.close]
    : [candle.open, candle.high, candle.low, candle.close];

  const prices = samplePath(waypoints, count);

  const snapshots: Candle[] = [];
  let runningHigh = candle.open;
  let runningLow = candle.open;
  for (let i = 0; i < count; i++) {
    const price = prices[i];
    runningHigh = Math.max(runningHigh, price);
    runningLow = Math.min(runningLow, price);
    snapshots.push({
      time: candle.time,
      open: candle.open,
      high: runningHigh,
      low: runningLow,
      close: price,
      volume: (candle.volume * (i + 1)) / steps,
    });
  }
  return snapshots;
}

/**
 * Evenly samples `count` points strictly between the start and end of a
 * piecewise-linear path through `waypoints` — excludes both endpoints,
 * since callers already know those (a candle's own open and close).
 */
export function samplePath(waypoints: number[], count: number): number[] {
  if (count <= 0) return [];
  const segments = waypoints.length - 1;
  const samples: number[] = [];
  for (let i = 1; i <= count; i++) {
    // Position along the whole path in (0, 1), excluding the endpoints.
    const t = i / (count + 1);
    const segmentPos = t * segments;
    const segmentIndex = Math.min(segments - 1, Math.floor(segmentPos));
    const localT = segmentPos - segmentIndex;
    const a = waypoints[segmentIndex];
    const b = waypoints[segmentIndex + 1];
    samples.push(a + (b - a) * localT);
  }
  return samples;
}
