import { Point, Shape } from "./Shape.js";

/**
 * A filled triangle over three arbitrary points — the third fillable
 * primitive alongside `Rectangle` (axis-aligned) and (once `Polyline`
 * lands) an open path, for the one shape in this chart that isn't a box
 * or a line: an entry/exit marker (see `./MarkerTriangle.ts`).
 *
 * Kept generic — three plain `Point`s, no notion of "apex" or
 * "direction" — so it stays reusable for whatever the next
 * triangle-shaped thing turns out to be; a subclass that *does* have a
 * direction (like `MarkerTriangle`) computes its own three points from
 * that domain concept and hands them up via `super()`, the same
 * "subclass resolves its own geometry, base class just draws" split
 * `Wick`/`Bar` already use with `Line`/`Rectangle`.
 *
 * Not pixel-snapped like `Rectangle`/`Wick` are: a filled triangle a few
 * pixels across (a marker) doesn't show the same hairline blur a 1px
 * stroke does, so there's nothing here worth rounding — see `../../utils/pixel.ts`'s
 * doc comment for why that snapping exists in the first place.
 */
export class Triangle extends Shape {
  /**
   * @param p1 First vertex.
   * @param p2 Second vertex.
   * @param p3 Third vertex.
   * @param color Fill color.
   */
  constructor(public p1: Point, public p2: Point, public p3: Point, color: string) {
    super(color);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(this.p1.x, this.p1.y);
    ctx.lineTo(this.p2.x, this.p2.y);
    ctx.lineTo(this.p3.x, this.p3.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
