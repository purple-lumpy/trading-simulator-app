import { BaseDrawingTool, HIT_TEST_TOLERANCE_PX, LONG_SPAN, SELECTED_STROKE_COLOR } from "./BaseDrawingTool.js";

/**
 * A single horizontal price level, placed with one click - "draw a line
 * at this price" the way a trader marks support/resistance or a target
 * level. `maxPoints` is 1: once the click lands, `ChartCore` pushes this
 * instance into its permanent `drawings` list and starts a *new*
 * `HorizontalLine` for the next placement (see `DrawingTool`'s own doc
 * comment) - so placing a second one doesn't touch the first at all,
 * unlike the old single-persistent-instance-per-type design this
 * replaced.
 *
 * The point's own `time` is carried (the `DrawingTool` interface
 * requires both `time` and `price` on every point) but never actually
 * read by this tool's `draw()`/`hitTest()` - only `price` decides where
 * a horizontal line sits, so whichever candle happened to be under the
 * pointer when it was placed is irrelevant.
 *
 * Before the one click lands, `draw()` still renders something: a
 * dashed "ghost" line at wherever the mouse is currently hovering (via
 * `previewPoint`, set every mousemove by `ChartCore` while this tool is
 * active - see `BaseDrawingTool.previewPoint`'s own doc comment), so a
 * trader can see exactly where the line would land before clicking.
 */
export class HorizontalLine extends BaseDrawingTool {
  readonly name = "horizontal-line";
  readonly maxPoints = 1;

  draw(ctx: CanvasRenderingContext2D, toPixel: (time: number, price: number) => { x: number; y: number }): void {
    const anchor = this.points[0] ?? this.previewPoint;
    if (!anchor) return;
    const isGhost = this.points.length < 1;
    const { y } = toPixel(anchor.time, anchor.price);
    ctx.save();
    ctx.strokeStyle = this.selected ? SELECTED_STROKE_COLOR : this.color;
    ctx.lineWidth = this.selected ? 2.5 : 1.5;
    ctx.setLineDash(isGhost ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(-LONG_SPAN, y);
    ctx.lineTo(LONG_SPAN, y);
    ctx.stroke();
    ctx.restore();
  }

  hitTest(x: number, y: number, toPixel: (time: number, price: number) => { x: number; y: number }): boolean {
    if (this.points.length < 1) return false;
    const { y: lineY } = toPixel(this.points[0].time, this.points[0].price);
    return Math.abs(y - lineY) <= HIT_TEST_TOLERANCE_PX;
  }
}
