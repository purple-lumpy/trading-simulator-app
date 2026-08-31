import { Shape } from "./Shape.js";

/**
 * A straight stroked line between two points. Deliberately does *not*
 * apply any pixel-snapping itself — unlike `Rectangle`, a line can be
 * diagonal (a `Trendline` drawing tool, for instance), and the
 * half-pixel-offset trick that keeps a 1px *axis-aligned* stroke crisp
 * (see `../pixel.ts`) only makes sense for a horizontal or vertical one.
 * A subclass that represents a specific kind of line — `Wick` is the only
 * one so far — is where that decision belongs, since only it knows its
 * own orientation.
 */
export class Line extends Shape {
  /**
   * @param x1 Start point x, in CSS pixels.
   * @param y1 Start point y, in CSS pixels.
   * @param x2 End point x, in CSS pixels.
   * @param y2 End point y, in CSS pixels.
   * @param color Stroke color.
   * @param lineWidth Stroke width, in CSS pixels. Default 1 (a hairline).
   */
  constructor(
    public x1: number,
    public y1: number,
    public x2: number,
    public y2: number,
    color: string,
    public lineWidth = 1
  ) {
    super(color);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1);
    ctx.lineTo(this.x2, this.y2);
    ctx.stroke();
    ctx.restore();
  }
}
