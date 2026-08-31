import { crispRect } from "../../utils/pixel.js";
import type { PriceScale } from "../Scale.js";
import type { Candle } from "../types.js";
import { Rectangle } from "./Rectangle.js";
import { Wick } from "./Wick.js";

/** The two colors a `Bar`/`VolumeBar` chooses between, based on whether the candle closed up or down. */
export interface BarColors {
  up: string;
  down: string;
}

/**
 * Renders exactly one candle: its body and its high-low wick together.
 *
 * `Bar` *is a* `Rectangle` — its own geometry (x/y/width/height/color) is
 * the candle's body — and it additionally owns a `Wick` for the high-low
 * line through that body. This mirrors the candle's own shape: a wick
 * that the body sits on top of and partially covers, not two independent
 * shapes that happen to be near each other. `draw()` renders the wick
 * first, then the body on top of it, for exactly that reason.
 *
 * A `Bar` is cheap to construct (it wraps a single candle's numbers, no
 * allocation beyond the instance and its one `Wick`) and is meant to be
 * created fresh per render call, not held onto — `ChartCore` builds one
 * per visible candle, every `render()`.
 */
export class Bar extends Rectangle {
  /** Whether this candle closed at or above its open — decides which of `BarColors` it (and its `VolumeBar`, independently) is drawn in. */
  readonly isUp: boolean;

  private readonly wick: Wick;

  /**
   * @param candle The candle this bar represents.
   * @param x Left edge of the candle's column, in CSS pixels.
   * @param width Width of the candle's column (before the gap to the next one), in CSS pixels.
   * @param priceScale Maps this candle's open/high/low/close to y pixels.
   * @param colors Up/down color pair to choose between.
   */
  constructor(candle: Candle, x: number, width: number, priceScale: PriceScale, colors: BarColors) {
    const isUp = candle.close >= candle.open;
    const color = isUp ? colors.up : colors.down;

    // Body: a filled rect, so its edges just need integer rounding. The
    // top/bottom are rounded independently before taking their difference
    // (rather than rounding a single "height" value) so a fractional
    // open/close from price-scale math can't round away a thin body
    // entirely — the doji case below is exactly this at its extreme.
    const yOpen = priceScale.priceToY(candle.open);
    const yClose = priceScale.priceToY(candle.close);
    const bodyTop = crispRect(Math.min(yOpen, yClose));
    const bodyBottom = crispRect(Math.max(yOpen, yClose));
    const bodyHeight = Math.max(1, bodyBottom - bodyTop); // never fully collapse a doji (open == close) to nothing

    super(x, bodyTop, width, bodyHeight, color);
    this.isUp = isUp;

    const wickCenterX = x + width / 2;
    this.wick = new Wick(wickCenterX, priceScale.priceToY(candle.high), priceScale.priceToY(candle.low), color);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.wick.draw(ctx);
    super.draw(ctx);
  }
}
