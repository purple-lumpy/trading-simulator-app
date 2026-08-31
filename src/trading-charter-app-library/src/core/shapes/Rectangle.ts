import { crispRect } from "../../utils/pixel.js";
import { Shape } from "./Shape.js";

/**
 * A filled, axis-aligned rectangle, pixel-snapped at draw time so its
 * edges land on whole device pixels instead of anti-aliasing into a blur
 * (see `../pixel.ts` for why that matters and how `crispRect` does it).
 *
 * This is the base shape for anything in this chart drawn as a solid
 * block of color: a candle's body (`Bar`) and a volume bar (`VolumeBar`)
 * both extend this rather than each hand-rolling their own
 * `fillRect` + rounding.
 *
 * Snapping happens in `draw()`, not the constructor, so a subclass that
 * has already computed exact, final pixel values (see `Bar`'s body-height
 * math) doesn't get a *second*, different rounding pass — `crispRect` is
 * idempotent on an already-integer value, so pre-rounded fields pass
 * through unchanged.
 */
export class Rectangle extends Shape {
  /**
   * @param x Left edge, in CSS pixels.
   * @param y Top edge, in CSS pixels.
   * @param width Width, in CSS pixels.
   * @param height Height, in CSS pixels.
   * @param color Fill color.
   */
  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
    color: string
  ) {
    super(color);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.fillRect(crispRect(this.x), crispRect(this.y), crispRect(this.width), crispRect(this.height));
    ctx.restore();
  }
}
