import { Label } from "./shapes/Label.js";

/**
 * Shared base for the two "row/column of tick `Label`s" render objects —
 * `PriceAxis` (a column of price ticks down one edge of the price pane)
 * and `TimeAxis` (a row of time ticks along the bottom). Both build their
 * `ticks` array entirely in their own constructor from whatever
 * scale/positions they're each given, and `draw()` — replaying whatever
 * ended up in `ticks` — turns out to be *exactly* the same one line of
 * code for both, once the geometry is out of the way.
 *
 * This is the "subclass resolves its own geometry, base class just
 * draws" split `Wick`/`Bar` and `MarkerTriangle`/`Triangle` already use
 * one level down at the shape-primitive layer, applied one level up: the
 * subclasses here don't share a shape, they share a *pattern* of how a
 * render object is put together. `Grid`/`PriceLines`/`Markers` don't fit
 * this base — they draw a mix of `Line`s and `Label`s, or `Label`s that
 * aren't laid out along a single axis — so it's scoped to exactly the two
 * classes it actually describes, not stretched to cover every render
 * object that happens to build an array of shapes in its constructor.
 */
export abstract class AxisLabels {
  protected readonly ticks: Label[] = [];

  draw(ctx: CanvasRenderingContext2D): void {
    for (const tick of this.ticks) tick.draw(ctx);
  }
}
