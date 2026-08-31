import type { Candle, Indicator } from "../../core/types.js";

/**
 * Simple or exponential moving average over close price. One of the four
 * v1 indicators (plan §3.4). Implements the `Indicator` seam so
 * `ChartCore.registerIndicator()` can compute and draw it without knowing
 * anything SMA/EMA-specific.
 */
export class MovingAverage implements Indicator {
  readonly pane = "main" as const;
  readonly name: string;

  /**
   * @param period Number of candles the average is taken over.
   * @param type `"sma"` (simple) or `"ema"` (exponential). Default `"sma"`.
   * @param color Line color drawn by `IndicatorLine.ts`. Default a light blue.
   */
  constructor(private period: number, private type: "sma" | "ema" = "sma", public color = "#42a5f5") {
    this.name = `${type.toUpperCase()}(${period})`;
  }

  /**
   * One output value per input candle, `NaN` for indices before the
   * warm-up period completes (there aren't yet `period` candles behind
   * that index to average). `IndicatorLine.ts` skips `NaN` rather than
   * drawing through it.
   */
  compute(candles: readonly Candle[]): number[] {
    return this.type === "sma" ? sma(candles, this.period) : ema(candles, this.period);
  }
}

/**
 * Simple moving average via a running sum (add the new close, subtract
 * the one that's `period` candles behind it) rather than re-summing the
 * whole window every index — O(n) instead of O(n·period).
 */
function sma(candles: readonly Candle[], period: number): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average: seeded from the SMA at the warm-up index
 * (the standard way to start an EMA without an arbitrary first value),
 * then each subsequent value blends the new close in at weight
 * `k = 2 / (period + 1)` against the running average.
 */
function ema(candles: readonly Candle[], period: number): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    const close = candles[i].close;
    if (prev === null) {
      if (i === period - 1) {
        const seed = sma(candles.slice(0, period), period)[period - 1];
        prev = seed;
        out[i] = seed;
      }
      continue;
    }
    prev = close * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
