import { Candle } from "../core/types.js";

/**
 * Aggregate a fine-grained candle series into a coarser timeframe by
 * bucketing consecutive source candles into wider time windows and
 * collapsing each window down to one OHLCV bar — open from the window's
 * first candle, close from its last, high/low from the window's extremes,
 * volume summed across it.
 *
 * Exists so a consumer only has to generate (or fetch) *one* base series
 * at the finest timeframe it cares about, then derive every coarser
 * timeframe a user might pick from that same series on demand, instead of
 * generating independent data per timeframe. Independent generation is
 * what produces inconsistent prices across a timeframe switch (each call
 * makes its own random walk, or its own fetch, with no relationship to
 * the others) — resampling one series instead means every timeframe is
 * just a different view of the same underlying prices, so switching
 * timeframe never changes what the market "did", only how coarsely it's
 * drawn.
 *
 * `targetSeconds` must be an exact multiple of `sourceSeconds` — bucket
 * boundaries are computed by dividing time, so a non-multiple would
 * silently produce lopsided buckets (some windows a candle short or long
 * of what the target timeframe's label promises) rather than a clean
 * error. `sourceSeconds` itself isn't re-derived from `candles` (e.g. by
 * diffing consecutive `time`s) because the source series is trusted to
 * already be evenly spaced at that interval, same assumption
 * `ReplayController` makes about whatever feeds it.
 *
 * `candles` must already be sorted ascending by `time`, same assumption
 * every other candle-consuming API in this library makes (`ChartCore`,
 * `ReplayController`) — resampling doesn't sort, just buckets in order.
 *
 * The final bucket is included even when it holds fewer than
 * `targetSeconds / sourceSeconds` source candles — the same "still
 * forming" partial-bar situation `CandleUpdate.final` models for live
 * data, just applied to the tail of a fixed historical array instead of a
 * live stream. A caller that wants only fully-elapsed target candles can
 * drop the last element of the result itself.
 */
export function resampleCandles(candles: readonly Candle[], sourceSeconds: number, targetSeconds: number): Candle[] {
  if (targetSeconds < sourceSeconds) {
    throw new Error(
      `resampleCandles: targetSeconds (${targetSeconds}) must be >= sourceSeconds (${sourceSeconds}) - ` +
        `this aggregates into coarser bars, it can't invent finer ones.`
    );
  }
  if (targetSeconds % sourceSeconds !== 0) {
    throw new Error(
      `resampleCandles: targetSeconds (${targetSeconds}) must be an exact multiple of sourceSeconds ` +
        `(${sourceSeconds}) - see this function's own doc comment for why a non-multiple isn't accepted.`
    );
  }
  if (candles.length === 0) return [];

  const result: Candle[] = [];
  let bucket: Candle | null = null;
  let bucketStart = -Infinity;

  for (const candle of candles) {
    const start = Math.floor(candle.time / targetSeconds) * targetSeconds;
    if (bucket === null || start !== bucketStart) {
      if (bucket !== null) result.push(bucket);
      bucketStart = start;
      bucket = { time: start, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume };
    } else {
      bucket.high = Math.max(bucket.high, candle.high);
      bucket.low = Math.min(bucket.low, candle.low);
      bucket.close = candle.close;
      bucket.volume += candle.volume;
    }
  }
  if (bucket !== null) result.push(bucket);

  return result;
}
