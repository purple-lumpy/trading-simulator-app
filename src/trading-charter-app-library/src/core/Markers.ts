import { MarkerTriangle } from "./shapes/MarkerTriangle.js";
import type { TimeScale, PriceScale } from "./Scale.js";
import type { Candle, Marker } from "./types.js";

/**
 * The set of entry/exit markers drawn on the price pane — one
 * `MarkerTriangle` per configured `Marker` whose `time` matches a
 * currently-loaded candle. Built the same way `Grid`/`PriceLines` are:
 * the geometry (where each triangle goes, resolved from the marker's
 * candle index and price) lives entirely in the constructor, so `draw()`
 * is just "draw each triangle already built."
 *
 * A marker whose `time` doesn't match any currently-loaded candle (e.g.
 * it refers to a bar that's scrolled out of the replay buffer) is simply
 * skipped rather than drawn at a guessed position — silently dropping a
 * marker for data that isn't there is safer than drawing it somewhere
 * wrong.
 *
 * Rebuilt fresh every render (like `Bar`/`Grid`) rather than held onto —
 * cheap to reconstruct, and the candle buffer/scales it depends on can
 * change between renders anyway.
 */
export class Markers {
  private readonly triangles: MarkerTriangle[];

  /**
   * @param markers The configured entry/exit markers.
   * @param candles The loaded candle buffer — a marker's `time` is looked up here to find its pixel position; see class doc comment for the no-match case.
   * @param timeScale Maps a candle index to an x pixel.
   * @param priceScale Maps a marker's price to a y pixel.
   * @param candleWidth Candle body width, in CSS pixels — `timeScale.indexToX()` gives a candle's left edge, so this centers each marker within the candle's width instead of pinning it to that edge.
   */
  constructor(
    markers: readonly Marker[],
    candles: readonly Candle[],
    timeScale: TimeScale,
    priceScale: PriceScale,
    candleWidth: number
  ) {
    this.triangles = [];
    for (const marker of markers) {
      const index = candles.findIndex((c) => c.time === marker.time);
      if (index < 0) continue;
      const x = timeScale.indexToX(index) + candleWidth / 2;
      const y = priceScale.priceToY(marker.price);
      this.triangles.push(new MarkerTriangle(x, y, marker.kind));
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const triangle of this.triangles) triangle.draw(ctx);
  }
}
