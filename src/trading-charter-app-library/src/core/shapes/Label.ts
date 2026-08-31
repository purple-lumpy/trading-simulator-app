import { Rectangle } from "./Rectangle.js";

/** Visual styling for a `Label`. */
export interface LabelStyle {
  /** Text color. */
  textColor: string;
  /** Background fill color. */
  backgroundColor: string;
  /** Border stroke color. Omit for no border. */
  borderColor?: string;
  /** CSS canvas font string. Default `"12px monospace"`. */
  font?: string;
  /** Horizontal padding, in CSS pixels, between the box edge and the text. Default 6. */
  padding?: number;
  /** Box height, in CSS pixels. Default 20. */
  height?: number;
}

/**
 * A small filled (and optionally bordered) box with one line of text —
 * the crosshair's OHLC readout, a price line's "SL 4123.50" tag, a
 * price-ruler tick (`../PriceAxis.ts`), and the current-price tag
 * (`../CurrentPriceLine.ts`) are all one of these.
 *
 * Extends `Rectangle` for its background: a label *is* a rectangle, plus
 * an optional border and text drawn on top of it — the same
 * "extend the shape that's mostly right, add what's different"
 * relationship `Bar` has with `Rectangle`.
 *
 * Its width can't be known at construction time — canvas text measurement
 * needs a live `CanvasRenderingContext2D`, which isn't available until
 * `draw()` is called — so unlike a plain `Rectangle` built with its final
 * geometry up front, `Label` resolves `this.width` just-in-time at the
 * start of `draw()`, from `ctx.measureText`, before painting the
 * background at that width.
 */
export class Label extends Rectangle {
  private readonly padding: number;
  private readonly font: string;
  private readonly textColor: string;
  private readonly borderColor?: string;

  /**
   * @param x Left edge, in CSS pixels.
   * @param y Top edge, in CSS pixels.
   * @param text The single line of text this label shows.
   * @param style Colors, font, padding, and height.
   */
  constructor(x: number, y: number, private text: string, style: LabelStyle) {
    super(x, y, 0, style.height ?? 20, style.backgroundColor);
    this.padding = style.padding ?? 6;
    this.font = style.font ?? "12px monospace";
    this.textColor = style.textColor;
    this.borderColor = style.borderColor;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = this.font;
    this.width = ctx.measureText(this.text).width + this.padding * 2;

    super.draw(ctx); // fills the background rect, now that width is known

    if (this.borderColor) {
      ctx.strokeStyle = this.borderColor;
      ctx.strokeRect(this.x, this.y, this.width, this.height);
    }

    ctx.fillStyle = this.textColor;
    ctx.font = this.font;
    ctx.fillText(this.text, this.x + this.padding, this.y + this.height - this.padding);
    ctx.restore();
  }
}
