import { ANCHOR_DOT_RADIUS, BaseDrawingTool, HIT_TEST_TOLERANCE_PX, SELECTED_STROKE_COLOR, pointToSegmentDistance } from "./BaseDrawingTool.js";

/**
 * Two-point trendline: click once to place its start, click again to
 * fix its end. Implements the `DrawingTool` seam via `BaseDrawingTool`
 * (shared points-buffer/id/selection bookkeeping - see its own doc
 * comment), so `ChartCore` can draw and feed it without knowing anything
 * trendline-specific.
 *
 * `draw()` renders three different things depending on how far placement
 * has gotten, so the user always sees exactly what they're doing:
 *  - 0 points: nothing yet - there's no anchor to show anything against.
 *  - 1 point: a small solid dot at that anchor (the "pointer" the first
 *    click adds to the chart), plus - while `previewPoint` is set (see
 *    `BaseDrawingTool.previewPoint`'s own doc comment) - a dashed
 *    rubber-band line from that anchor to wherever the mouse is
 *    currently hovering, so dragging before the second click visibly
 *    previews where the line will end up.
 *  - 2 points (complete): a solid line between them, same as before this
 *    preview behavior existed - the dashed rubber-band and anchor dot
 *    are both placement-only, never drawn once a trendline is finished.
 */
export class Trendline extends BaseDrawingTool {
  readonly name = "trendline";
  readonly maxPoints = 2;

  draw(ctx: CanvasRenderingContext2D, toPixel: (time: number, price: number) => { x: number; y: number }): void {
    if (this.points.length === 1) {
      const anchor = toPixel(this.points[0].time, this.points[0].price);
      ctx.save();
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, ANCHOR_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (this.previewPoint) {
        const preview = toPixel(this.previewPoint.time, this.previewPoint.price);
        ctx.save();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(anchor.x, anchor.y);
        ctx.lineTo(preview.x, preview.y);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    if (this.points.length < 2) return;

    const [a, b] = this.points;
    const pa = toPixel(a.time, a.price);
    const pb = toPixel(b.time, b.price);
    ctx.save();
    ctx.strokeStyle = this.selected ? SELECTED_STROKE_COLOR : this.color;
    ctx.lineWidth = this.selected ? 2.5 : 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    ctx.restore();
  }

  hitTest(x: number, y: number, toPixel: (time: number, price: number) => { x: number; y: number }): boolean {
    if (this.points.length < 2) return false;
    const [a, b] = this.points;
    const pa = toPixel(a.time, a.price);
    const pb = toPixel(b.time, b.price);
    return pointToSegmentDistance(x, y, pa.x, pa.y, pb.x, pb.y) <= HIT_TEST_TOLERANCE_PX;
  }
}
