import { Point, Shape } from "./Shape.js";

/** Stroke width `Polyline` uses when the caller doesn't specify one — matches the indicator-line thickness this primitive was introduced for. */
const DEFAULT_LINE_WIDTH = 1.5;

/**
 * A single open stroked path through an ordered list of points — the
 * multi-point generalization of `Line`. `Line` stays its own simple,
 * fast, 2-endpoint primitive (used everywhere a shape only ever needs
 * exactly two points: wicks, gridlines, guide lines) rather than being
 * rewritten in terms of this one; `Polyline` exists for the one case that
 * genuinely needs an arbitrary number of points joined into a single
 * path — an indicator series (see `../IndicatorLine.ts`) that can have as
 * many points as there are visible candles.
 *
 * Points with a gap in between (e.g. an indicator's warm-up period,
 * where consecutive values are `NaN`) aren't this primitive's concern —
 * a caller that wants a broken line resolves that upstream by only
 * including the points that should actually be connected, the same way
 * `IndicatorLine` skips `NaN`/`undefined` values before ever constructing
 * one of these.
 *
 * Drawing zero or one point is a harmless no-op stroke (an empty or
 * single-point path draws nothing visible) rather than a special case
 * this class needs to guard against — real canvases handle it silently,
 * and a mocked one in a test still records the `stroke()` call.
 */
export class Polyline extends Shape {
  /**
   * @param points Ordered vertices the path passes through, in CSS pixels. The first point starts the path (`moveTo`); every point after it extends it (`lineTo`).
   * @param color Stroke color.
   * @param lineWidth Stroke width, in CSS pixels. Default `1.5` — a touch heavier than a 1px hairline (`Line`'s default) so an indicator overlay reads clearly against the candles/gridlines underneath it.
   */
  constructor(public points: readonly Point[], color: string, public lineWidth = DEFAULT_LINE_WIDTH) {
    super(color);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();
    this.points.forEach((point, i) => {
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  }
}
