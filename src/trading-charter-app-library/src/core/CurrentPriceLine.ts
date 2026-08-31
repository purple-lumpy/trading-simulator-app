import { crispLine } from "../utils/pixel.js";
import { DashedLine } from "./shapes/DashedLine.js";
import { Label } from "./shapes/Label.js";
import type { PriceScale } from "./Scale.js";

/** Tag text color for the current-price badge — dark, so it reads clearly against `currentPriceLineColor`'s default neutral gray and against reasonable custom colors a future settings UI might offer. Mirrors `PriceLines`' own hardcoded badge text color for the same reason: both are small colored tags meant to be read at a glance, not a place to spend a second contrast decision per instance. */
const TAG_TEXT_COLOR = "#0e0f12";

/**
 * The "you are here" marker for price: a dashed horizontal line at the
 * latest candle's close, spanning the plot area, plus a solid tag on the
 * price ruler carrying the exact value — the one price level a trader
 * should never have to hunt for on a busy chart.
 *
 * Built from the same `DashedLine`/`Label` primitives `PriceLines` and
 * `Crosshair` already use, just anchored to whichever candle is currently
 * forming rather than a configured stop-loss/take-profit level.
 * `ChartCore` derives that anchor itself — the latest loaded candle's
 * close — rather than this class taking a live price feed, since for
 * replay (and, later, live data fed through the same `CandleUpdate` path)
 * "the current price" and "the last candle's close" are the same number
 * by construction.
 *
 * `color` is a plain constructor argument (see
 * `ChartOptions.currentPriceLineColor`) rather than hardcoded — see that
 * option's own doc comment for why this, of everything on the chart, is
 * the one most likely to want a settings-UI color picker first.
 */
export class CurrentPriceLine {
  private readonly line: DashedLine;
  private readonly tag: Label;

  /**
   * @param price The latest close to draw the line at.
   * @param plotOffsetX Left edge of the plot area the dashed line spans, in CSS pixels — 0 unless the price ruler is on the left.
   * @param plotWidth Width of the plot area the dashed line spans, in CSS pixels (the canvas width minus the ruler's reserved width).
   * @param axisX Left edge of the price-ruler tag, in CSS pixels — see `PriceAxis`'s own `axisX` parameter for how `ChartCore` derives it.
   * @param priceScale Maps price to a y pixel for the current visible range.
   * @param color Line and tag-background color — see `ChartOptions.currentPriceLineColor`.
   */
  constructor(
    price: number,
    plotOffsetX: number,
    plotWidth: number,
    axisX: number,
    priceScale: PriceScale,
    color: string
  ) {
    const y = crispLine(priceScale.priceToY(price));
    // A tighter dash than PriceLines' default [6, 4] so the current-price
    // line reads as distinct from a configured stop-loss/take-profit
    // level at a glance, even in the same color family.
    this.line = new DashedLine(plotOffsetX, y, plotOffsetX + plotWidth, y, color, [3, 3]);
    this.tag = new Label(axisX + 2, y - 10, price.toFixed(2), {
      textColor: TAG_TEXT_COLOR,
      backgroundColor: color,
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.line.draw(ctx);
    this.tag.draw(ctx);
  }
}
