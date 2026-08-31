import type { Candle } from "./types.js";

/**
 * Maps candle index <-> x pixel, and price <-> y pixel, for one pane.
 * Kept deliberately dumb: no animation/easing here, just the arithmetic.
 * Pan/zoom mutate startIndex/endIndex on the ChartCore and this class is
 * re-derived from that each frame, which keeps state in one place.
 */
export class TimeScale {
  /**
   * @param startIndex Index of the first visible candle.
   * @param endIndex Index of the last visible candle (inclusive).
   * @param paneWidth Plot area width, in CSS pixels — the price ruler, if any, reserves its own strip outside this width.
   * @param candleWidth Candle body width, in CSS pixels.
   * @param candleGap Gap between candles, in CSS pixels.
   * @param offsetX Left edge of the plot area, in CSS pixels — 0 unless the price ruler is on the left, in which case every x this scale produces (and expects back) shifts right by its reserved width. Kept in absolute canvas coordinates throughout, rather than plot-local ones, so a pointer position straight off the canvas's mousemove event can be fed to `xToIndex` with no translation at the call site.
   */
  constructor(
    private startIndex: number,
    private endIndex: number,
    private paneWidth: number,
    private candleWidth: number,
    private candleGap: number,
    private offsetX = 0
  ) {}

  /** Horizontal pixel distance from one candle's x to the next (its width plus the gap after it). */
  get step(): number {
    return this.candleWidth + this.candleGap;
  }

  /** Map a candle index to the x of its left edge, in CSS pixels (absolute — already includes `offsetX`). Candles before `startIndex` map to negative x (off the left edge) rather than clamping — callers that iterate `startIndex..endIndex` never see this. */
  indexToX(index: number): number {
    return this.offsetX + (index - this.startIndex) * this.step + this.candleGap / 2;
  }

  /** Inverse of `indexToX`: map an absolute x pixel (e.g. the pointer's position straight off a mousemove event) back to the nearest candle index. Used by the crosshair readout. */
  xToIndex(x: number): number {
    return Math.round((x - this.offsetX) / this.step + this.startIndex);
  }

  /** How many candles fit across the pane at the current step size, rounded up so a partially-visible trailing candle still counts. Always at least 1. */
  visibleCount(): number {
    return Math.max(1, Math.ceil(this.paneWidth / this.step));
  }
}

/** Maps price <-> y pixel for one pane. See `TimeScale`'s class doc comment — same "dumb, re-derived each frame" design. */
export class PriceScale {
  /**
   * @param minPrice Lowest price in the visible range.
   * @param maxPrice Highest price in the visible range.
   * @param paneHeight Pane height, in CSS pixels.
   * @param topPad Fraction of `paneHeight` left empty above the highest price (default 8%).
   * @param bottomPad Fraction of `paneHeight` left empty below the lowest price (default 8%).
   */
  constructor(
    private minPrice: number,
    private maxPrice: number,
    private paneHeight: number,
    private topPad = 0.08,
    private bottomPad = 0.08
  ) {}

  /** Map a price to its y pixel within the pane — higher prices map to smaller y (screen space grows downward), inset by `topPad`/`bottomPad` so the highest/lowest visible candle isn't drawn flush against the pane edge. A degenerate zero-width price range (`maxPrice === minPrice`) is treated as a range of 1 rather than dividing by zero. */
  priceToY(price: number): number {
    const range = this.maxPrice - this.minPrice || 1;
    const usable = this.paneHeight * (1 - this.topPad - this.bottomPad);
    const top = this.paneHeight * this.topPad;
    return top + usable * (1 - (price - this.minPrice) / range);
  }

  /** Inverse of `priceToY`: map a y pixel (e.g. the pointer's position) back to a price. Used by the crosshair readout. */
  yToPrice(y: number): number {
    const range = this.maxPrice - this.minPrice || 1;
    const usable = this.paneHeight * (1 - this.topPad - this.bottomPad);
    const top = this.paneHeight * this.topPad;
    return this.minPrice + (1 - (y - top) / usable) * range;
  }
}

/**
 * Min low / max high across the visible slice `[startIndex, endIndex]`
 * (clamped to the array's actual bounds), used to size a `PriceScale` for
 * one render. Falls back to `{ min: 0, max: 1 }` for an empty or
 * out-of-bounds slice rather than returning `Infinity`/`-Infinity`, so a
 * caller can construct a `PriceScale` from the result unconditionally.
 */
export function priceRangeFor(candles: readonly Candle[], startIndex: number, endIndex: number) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = Math.max(0, startIndex); i <= Math.min(candles.length - 1, endIndex); i++) {
    const c = candles[i];
    if (c.low < min) min = c.low;
    if (c.high > max) max = c.high;
  }
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1 };
  return { min, max };
}
