import { ANCHOR_DOT_RADIUS, BaseDrawingTool, HIT_TEST_TOLERANCE_PX, SELECTED_STROKE_COLOR, drawArrowhead, pointToSegmentDistance } from "./BaseDrawingTool.js";

/**
 * Multi-point trace: click to place a point, click again to extend the
 * line from wherever the last one landed, and keep going - each click
 * adds another connected segment, so unlike `Trendline` (fixed at two
 * points, exactly one straight segment) this can zigzag through any
 * number of points - a "W"-shaped pattern, say - before it's done. The
 * last leg only (see `draw()`) carries an arrowhead pointing the way it
 * runs, so the shape always reads as "this is the direction the trend
 * is currently heading," not just a plain connect-the-dots outline.
 *
 * There's no fixed point count to reach (see `maxPoints` below), so
 * placement doesn't complete itself through `BaseDrawingTool`'s default
 * `isComplete()` the way every other current tool does - it ends only
 * on an explicit `finish()` call instead, which `ChartCore`'s
 * double-click and right-click/two-finger-click handling trigger (see
 * their own doc comments), matching how a trader would actually draw a
 * multi-legged pattern: keep clicking new legs, then double-click,
 * right-click, or (on a trackpad) two-finger-click once to say "that's
 * the whole shape," rather than any fixed number of clicks finishing it
 * on its own.
 */
export class TraceLine extends BaseDrawingTool {
  readonly name = "trace";
  // No natural fixed point count (unlike Trendline's 2) - large enough
  // that BaseDrawingTool's default addPoint() (points.length <
  // maxPoints) never turns away a click in practice. isComplete() is
  // overridden below instead of relying on maxPoints being reached, so
  // this is really just "no cap," not a real limit.
  readonly maxPoints = Infinity;
  private finished = false;

  /**
   * Ends placement without needing `points.length` to reach any fixed
   * count - see `ChartCore`'s double-click/right-click handling, the
   * only callers. Requires at least 2 points to actually finish, same
   * as any line needs two ends: called with fewer (e.g. right-clicking
   * immediately after only one point is placed) just leaves placement
   * open, a no-op rather than completing a degenerate 0- or 1-point
   * "line" - the user can simply keep clicking normally afterward.
   */
  finish(): void {
    if (this.points.length >= 2) this.finished = true;
    this.previewPoint = null;
  }

  isComplete(): boolean {
    return this.finished;
  }

  draw(ctx: CanvasRenderingContext2D, toPixel: (time: number, price: number) => { x: number; y: number }): void {
    if (this.points.length === 0) return;

    if (this.points.length === 1) {
      // Same "anchor dot, nothing to connect yet" treatment as
      // Trendline's own first-point case - see its own doc comment.
      const anchor = toPixel(this.points[0].time, this.points[0].price);
      ctx.save();
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, ANCHOR_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // One continuous stroked path through every placed point so far,
      // in order - this is what lets the shape zigzag through any
      // number of legs instead of Trendline's always-exactly-one
      // segment.
      const pixels = this.points.map((p) => toPixel(p.time, p.price));
      const strokeColor = this.selected ? SELECTED_STROKE_COLOR : this.color;
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = this.selected ? 2.5 : 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pixels[0].x, pixels[0].y);
      for (const p of pixels.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();

      // An arrowhead on the LAST leg only - not every leg - pointing the
      // way that leg runs, so the shape always reads as "this is the
      // direction the trend is currently heading," the same read a
      // single-segment trend line's own arrow would give, just anchored
      // to whichever segment is currently the open end here (the last
      // one placed so far, still updating as more points are added,
      // permanently fixed once `finish()` locks it in).
      const tail = pixels[pixels.length - 2];
      const tip = pixels[pixels.length - 1];
      drawArrowhead(ctx, tail.x, tail.y, tip.x, tip.y, strokeColor);
    }

    // Rubber-band preview from the *last committed* point to wherever
    // the mouse is hovering right now - same idea as Trendline's own
    // dashed preview, just anchored to whichever point is currently the
    // open end, which moves forward with every click here instead of
    // always being the first point. Never drawn once finished - at that
    // point there's no more open end left to preview from.
    if (!this.finished && this.previewPoint) {
      const lastPoint = this.points[this.points.length - 1];
      const last = toPixel(lastPoint.time, lastPoint.price);
      const preview = toPixel(this.previewPoint.time, this.previewPoint.price);
      ctx.save();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(preview.x, preview.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  hitTest(x: number, y: number, toPixel: (time: number, price: number) => { x: number; y: number }): boolean {
    if (this.points.length < 2) return false;
    const pixels = this.points.map((p) => toPixel(p.time, p.price));
    // A hit on ANY one of the trace's segments selects the whole thing -
    // same "click near any part of it" expectation Trendline's single
    // segment already gives, just checked leg by leg here.
    for (let i = 0; i < pixels.length - 1; i++) {
      if (pointToSegmentDistance(x, y, pixels[i].x, pixels[i].y, pixels[i + 1].x, pixels[i + 1].y) <= HIT_TEST_TOLERANCE_PX) {
        return true;
      }
    }
    return false;
  }
}
