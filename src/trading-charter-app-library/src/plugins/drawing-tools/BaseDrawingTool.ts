import type { DrawingTool } from "../../core/types.js";

/**
 * A generously oversized pixel span a "spans the whole pane" drawing
 * tool (`HorizontalLine`, `VerticalLine`) strokes its line across, in
 * each direction from the placed point - "wide enough that no realistic
 * pane size could ever show its actual endpoint" rather than a computed
 * exact one. `DrawingTool.draw()`'s `toPixel` parameter can convert a
 * (time, price) point to pixels, but has no way to answer "how wide/tall
 * is the pane" - and doesn't need one: `ChartCore.render()` already
 * clips every drawing tool to the price pane's own rectangle before any
 * of them draw (see its own comment on why), so drawing far past either
 * edge and letting that clip crop it to the pane's real boundary is
 * simpler, and exactly as visually correct, as computing those real
 * edges here would be. Shared here rather than declared per-subclass so
 * `HorizontalLine`/`VerticalLine` can't quietly drift to different span
 * sizes.
 */
export const LONG_SPAN = 100_000;

/** Canvas-relative CSS-pixel tolerance every concrete tool's `hitTest()` clicks-to-select within - generous enough to grab a thin 1.5px line without needing pixel-perfect precision, narrow enough that two nearby lines stay individually selectable. Shared here so every tool feels equally "grabbable" rather than each picking its own. */
export const HIT_TEST_TOLERANCE_PX = 6;

/** Radius (CSS px) of the small filled circle `Trendline` draws at its first point while its second is still being placed - the literal "pointer" the user's first click adds to the chart, so there's something visible to anchor the eye on before the rubber-band preview line even appears. */
export const ANCHOR_DOT_RADIUS = 3;

/** Stroke color a selected placed drawing renders with instead of its own `color`, so a click-to-select (see `ChartCore`'s "cross"-tool handling) is visually obvious before Delete/Backspace removes it. */
export const SELECTED_STROKE_COLOR = "#ff9800";

let nextDrawingId = 1;

/**
 * A short, unique-within-this-page-load id for a newly-constructed
 * drawing instance - `BaseDrawingTool`'s own constructor calls this so
 * every concrete subclass gets one for free. Not a UUID (no need for
 * global/cross-session uniqueness - `ChartCore` only ever compares ids
 * against other instances alive in the same page) or based on `Date.now()`
 * (two instances constructed in the same tick, e.g. back-to-back
 * placements in a test, would otherwise collide) - a plain incrementing
 * counter can't collide either way.
 */
export function generateDrawingId(prefix: string): string {
  return `${prefix}-${nextDrawingId++}`;
}

/**
 * Shortest distance from point (`px`, `py`) to the line SEGMENT (not
 * infinite line) between (`x1`, `y1`) and (`x2`, `y2`) - the standard
 * "project onto the segment, clamp the projection to its own two ends"
 * formula. `Trendline.hitTest()`'s own click-to-select math; pulled out
 * here (rather than inlined there) since it's plain geometry with
 * nothing trendline-specific about it, in case a future multi-point tool
 * needs the same segment-distance test.
 */
export function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Shared bookkeeping every concrete `DrawingTool` (`HorizontalLine`,
 * `VerticalLine`, `Trendline`, …) needs identically: a unique `id`
 * (`generateDrawingId()`, above), a `points` buffer capped at
 * `maxPoints`, `isComplete()`/`setPreviewPoint()` for `ChartCore`'s
 * placement lifecycle (see `DrawingTool`'s own doc comment for the full
 * "one instance per placed drawing, a fresh one starts the next"
 * picture), and a `selected` flag `draw()` implementations read for
 * their own selected styling.
 *
 * A concrete subclass only has to declare `name`/`maxPoints` and
 * implement `draw()`/`hitTest()` - see `HorizontalLine`/`VerticalLine`/
 * `Trendline` for the three current ones.
 *
 * `color` lives here too (not per-subclass) since every current tool
 * draws one plain stroked line/segment and none has needed a different
 * default yet - a subclass that does can still just reassign
 * `this.color` in its own constructor, `readonly` isn't used here on
 * purpose.
 */
export abstract class BaseDrawingTool implements DrawingTool {
  abstract readonly name: string;
  abstract readonly maxPoints: number;
  readonly id: string;
  points: Array<{ time: number; price: number }> = [];
  color = "#2196f3";
  selected = false;
  /**
   * The not-yet-committed point a hovering mouse is currently over,
   * while `points.length < maxPoints` - i.e. mid-placement. `null` once
   * complete (`addPoint()` clears it the moment a real point commits) or
   * whenever the pointer isn't over a valid spot. Concrete `draw()`
   * implementations use this to render a dashed "ghost"/rubber-band
   * preview of where the next click would land, live as the mouse
   * moves - see `setPreviewPoint()` and each concrete tool's own
   * `draw()`.
   */
  previewPoint: { time: number; price: number } | null = null;

  constructor() {
    this.id = generateDrawingId(this.constructor.name);
  }

  addPoint(point: { time: number; price: number }): void {
    if (this.points.length < this.maxPoints) this.points.push(point);
    this.previewPoint = null;
  }

  setPreviewPoint(point: { time: number; price: number } | null): void {
    this.previewPoint = point;
  }

  isComplete(): boolean {
    return this.points.length >= this.maxPoints;
  }

  abstract draw(ctx: CanvasRenderingContext2D, toPixel: (time: number, price: number) => { x: number; y: number }): void;
  abstract hitTest(x: number, y: number, toPixel: (time: number, price: number) => { x: number; y: number }): boolean;
}
