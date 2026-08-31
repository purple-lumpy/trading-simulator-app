import { Line } from "./Line.js";

/**
 * A stroked line drawn with a dash pattern instead of solid. The
 * crosshair's two guide lines and each configured stop-loss/take-profit
 * price line are all one of these — `Grid`'s lines stay plain `Line`s
 * since they're solid.
 *
 * Adds exactly one thing to `Line`: the dash pattern passed to
 * `ctx.setLineDash()`, scoped to just this line's own `draw()` call via
 * its own `save()`/`restore()` (nested inside `Line.draw()`'s own pair)
 * so the dash can never leak into whatever draws next.
 */
export class DashedLine extends Line {
  /**
   * @param x1 Start point x, in CSS pixels.
   * @param y1 Start point y, in CSS pixels.
   * @param x2 End point x, in CSS pixels.
   * @param y2 End point y, in CSS pixels.
   * @param color Stroke color.
   * @param dash Dash pattern for `ctx.setLineDash()`. Default `[6, 4]`.
   * @param lineWidth Stroke width, in CSS pixels. Default 1.
   */
  constructor(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    public dash: number[] = [6, 4],
    lineWidth = 1
  ) {
    super(x1, y1, x2, y2, color, lineWidth);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.setLineDash(this.dash);
    super.draw(ctx);
    ctx.restore();
  }
}
