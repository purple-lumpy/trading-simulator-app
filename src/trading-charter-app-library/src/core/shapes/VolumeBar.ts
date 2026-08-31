import { crispRect } from "../../utils/pixel.js";
import type { Candle } from "../types.js";
import { Rectangle } from "./Rectangle.js";
import type { BarColors } from "./Bar.js";

/**
 * Renders one candle's volume as a rectangle anchored to the bottom of
 * the volume pane, scaled proportionally to the largest volume currently
 * visible. Extends `Rectangle` directly, with no wick — unlike `Bar`,
 * volume has no "high/low" concept to draw a wick through.
 *
 * `maxVolume` is passed in rather than computed here because it's a
 * property of the *visible range* of candles, not of any one candle —
 * `ChartCore` scans the visible slice once per render and reuses that one
 * value for every `VolumeBar` it constructs that frame.
 */
export class VolumeBar extends Rectangle {
  private readonly maxVolume: number;

  /**
   * @param candle The candle whose volume this bar represents.
   * @param x Left edge of the candle's column, in CSS pixels.
   * @param width Width of the candle's column, in CSS pixels.
   * @param paneTop Top of the volume pane, in CSS pixels.
   * @param paneHeight Height of the volume pane, in CSS pixels.
   * @param maxVolume The largest volume among the currently visible candles — a `maxVolume` of 0 means there's nothing to scale against, and `draw()` becomes a no-op.
   * @param colors Up/down color pair to choose between, based on the candle's own direction.
   */
  constructor(
    candle: Candle,
    x: number,
    width: number,
    paneTop: number,
    paneHeight: number,
    maxVolume: number,
    colors: BarColors
  ) {
    const isUp = candle.close >= candle.open;
    const color = isUp ? colors.up : colors.down;
    // Pre-rounded here (not left to Rectangle.draw()'s own crispRect pass)
    // because it also has to feed the y calculation below — see Bar's
    // constructor comment for why top/height need to agree on rounding.
    const barHeight = maxVolume > 0 ? Math.max(1, crispRect((candle.volume / maxVolume) * paneHeight * 0.9)) : 0;
    super(x, paneTop + paneHeight - barHeight, width, barHeight, color);
    this.maxVolume = maxVolume;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.maxVolume <= 0) return; // nothing visible has any volume — drawing a 0-height rect is a wasted call, not just a harmless one
    super.draw(ctx);
  }
}
