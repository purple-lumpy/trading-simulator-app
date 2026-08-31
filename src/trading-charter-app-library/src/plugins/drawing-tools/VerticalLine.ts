import { BaseDrawingTool, HIT_TEST_TOLERANCE_PX, LONG_SPAN, SELECTED_STROKE_COLOR } from "./BaseDrawingTool.js";

/**
 * A single vertical time marker, placed with one click - "mark this
 * moment" the way a trader flags a news event or a session boundary.
 * `maxPoints` is 1, same "the completed instance is pushed to
 * `ChartCore`'s permanent `drawings` list and a fresh instance starts
 * the next placement" lifecycle as `HorizontalLine`'s own doc comment
 * (see `DrawingTool`'s doc comment for the full picture).
 *
 * The point's own `price` is carried (the `DrawingTool` interface
 * requires both `time` and `price` on every point) but never actually
 * read by this tool's `draw()`/`hitTest()` - only `time` decides where a
 * vertical line sits, so whatever price happened to be under the
 * pointer's y when it was placed is irrelevant.
 *
 * Spans a fixed, deliberately oversized pixel range vertically rather
 * than the pane's actual height, for the same "let ChartCore's own clip
 * do the real cropping" reason `HorizontalLine` spans an oversized range
 * horizontally - see `LONG_SPAN`'s own doc comment in BaseDrawingTool.ts.
 *
 * Before the one click lands, `draw()` renders a dashed "ghost" line at
 * wherever the mouse is currently hovering (via `previewPoint`) - see
 * `HorizontalLine`'s own doc comment for why, mirrored here vertically.
 */
export class VerticalLine extends BaseDrawingTool {
  readonly name = "vertical-line";
  readonly maxPoints = 1;

  draw(ctx: CanvasRenderingContext2D, toPixel: (time: number, price: number) => { x: number; y: number }): void {
    const anchor = this.points[0] ?? this.previewPoint;
    if (!anchor) return;
    const isGhost = this.points.length < 1;
    const { x } = toPixel(anchor.time, anchor.price);
    ctx.save();
    ctx.strokeStyle = this.selected ? SELECTED_STROKE_COLOR : this.color;
    ctx.lineWidth = this.selected ? 2.5 : 1.5;
    ctx.setLineDash(isGhost ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x, -LONG_SPAN);
    ctx.lineTo(x, LONG_SPAN);
    ctx.stroke();
    ctx.restore();
  }

  hitTest(x: number, y: number, toPixel: (time: number, price: number) => { x: number; y: number }): boolean {
    if (this.points.length < 1) return false;
    const { x: lineX } = toPixel(this.points[0].time, this.points[0].price);
    return Math.abs(x - lineX) <= HIT_TEST_TOLERANCE_PX;
  }
}
