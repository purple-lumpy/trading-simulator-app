import { Polyline } from "./shapes/Polyline.js";
import type { TimeScale, PriceScale } from "./Scale.js";
import type { Candle, Indicator } from "./types.js";

/** Stroke color an `Indicator` gets when it doesn't set its own optional `color` field (`./types.js`). */
const DEFAULT_COLOR = "#42a5f5";

/**
 * One main-pane indicator (e.g. a `MovingAverage`), drawn as a single
 * `Polyline` over the visible candle range. Built the same way
 * `Grid`/`Markers` are: the geometry — which points the line actually
 * passes through — is resolved once in the constructor from
 * `indicator.compute()`, and `draw()` just replays the `Polyline` that
 * came out of it.
 *
 * Skips any index where the indicator has no value yet (its warm-up
 * period — see `Indicator.compute()`'s own doc comment) by leaving that
 * point out of the `Polyline` entirely, rather than passing `NaN`/
 * `undefined` through and letting the primitive cope: a gap in the data
 * means a gap in the line, not a segment drawn through a nonsense
 * coordinate.
 *
 * Rebuilt fresh every render (like `Bar`/`Grid`) — `indicator.compute()`
 * itself is called fresh on every `render()` today (`ChartCore` holds no
 * cache across frames for indicator output), so there's no benefit to
 * holding the `Polyline` built from its result onto between frames
 * either; both would need invalidating on the same events anyway. Worth
 * revisiting if a future indicator's `compute()` gets expensive enough
 * (e.g. a large lookback window) that recomputing every frame shows up.
 */
export class IndicatorLine {
  private readonly polyline: Polyline;

  /**
   * @param indicator The indicator to draw — `compute()` is called once here to get its full series.
   * @param candles The loaded candle buffer, passed straight through to `indicator.compute()`.
   * @param startIndex Index of the first visible candle — only this indicator's values within `[startIndex, endIndex]` are drawn.
   * @param endIndex Index of the last visible candle (inclusive).
   * @param timeScale Maps a candle index to an x pixel.
   * @param priceScale Maps an indicator value to a y pixel.
   * @param candleWidth Candle body width, in CSS pixels — `timeScale.indexToX()` gives a candle's left edge, so this centers each point within the candle's width instead of pinning it to that edge.
   */
  constructor(
    indicator: Indicator,
    candles: readonly Candle[],
    startIndex: number,
    endIndex: number,
    timeScale: TimeScale,
    priceScale: PriceScale,
    candleWidth: number
  ) {
    const values = indicator.compute(candles);
    const points = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const v = values[i];
      if (v === undefined || Number.isNaN(v)) continue;
      points.push({ x: timeScale.indexToX(i) + candleWidth / 2, y: priceScale.priceToY(v) });
    }
    this.polyline = new Polyline(points, indicator.color ?? DEFAULT_COLOR);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.polyline.draw(ctx);
  }
}
