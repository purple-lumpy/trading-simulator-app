import { DashedLine } from "./shapes/DashedLine.js";
import { Label } from "./shapes/Label.js";
import { PriceScale, TimeScale } from "./Scale.js";
import { formatDetailedTimeLabel } from "./TimeAxis.js";
import type { Candle, ChartOptions } from "./types.js";

/** Pointer position, in CSS pixels relative to the canvas's top-left — what `ChartCore` tracks via its mousemove listener and passes to `Crosshair`. */
export interface CrosshairPosition {
  x: number;
  y: number;
}

/**
 * The pointer crosshair: a vertical + horizontal dashed guide line
 * crossing at the pointer, an OHLC + price readout `Label` pinned to the
 * pane's top-left corner, and a price tag pinned to the ruler at the
 * pointer's own y — "what price is under my cursor," the same thing most
 * charting platforms show as you move up and down the pane. Composed
 * from the same `DashedLine`/`Label` primitives `PriceLines`/`PriceAxis`/
 * `CurrentPriceLine` use, rather than bespoke drawing code of its own —
 * four small shapes built once in the constructor; `draw()` just draws
 * each.
 *
 * The ruler price tag and the OHLC readout answer different questions
 * and so behave differently: the OHLC readout needs an actual candle
 * under the pointer's x and is skipped when there isn't one (see the
 * constructor), but the ruler tag is pure y-axis math — it has a price
 * for any pointer position inside the pane — so it always draws
 * alongside the guide lines, candle or no candle.
 *
 * The time tag, pinned to the time axis at the pointer's x, is the
 * price tag's horizontal counterpart - "what date and time is under my
 * cursor," TimeAxis's own always-on "HH:MM" labels made more precise on
 * demand. It behaves like the OHLC readout rather than the price tag,
 * though: an x with no candle under it (past the last revealed bar, in
 * the empty margin barAreaWidthRatio reserves) has no time to show, so
 * it's skipped rather than guessed - pixel position alone doesn't map
 * to a time the way it maps to a price, since candles are indexed, not
 * laid out on a continuous time scale.
 *
 * Both tags' backgrounds are their own dedicated options
 * (`crosshairPriceTagColor`/`crosshairTimeTagColor`), deliberately
 * different from `CurrentPriceLine`'s `currentPriceLineColor` — see
 * that option's own doc comment for why the two need to read as
 * visually distinct, and why every one of these is a plain
 * constructor-reachable color rather than hardcoded, in anticipation of
 * a settings UI.
 *
 * Built fresh on every mousemove/render (like `Bar`/`Grid`/`PriceLines`)
 * — there's no reason to hold a crosshair onto between frames when
 * reconstructing one is this cheap.
 */
export class Crosshair {
  private readonly verticalLine: DashedLine;
  private readonly horizontalLine: DashedLine;
  private readonly priceTag: Label;
  private readonly label?: Label;
  private readonly timeTag?: Label;

  /**
   * @param pos Pointer position.
   * @param candles The loaded candle buffer, used to find the one nearest the pointer for the OHLC readout.
   * @param timeScale Maps pointer x to a candle index.
   * @param priceScale Maps pointer y to a price.
   * @param paneWidth Plot area width, in CSS pixels — the horizontal guide line spans this, not the full canvas (the price ruler, if any, reserves its own strip outside this width).
   * @param paneHeight Price pane height, in CSS pixels — the vertical guide line spans this.
   * @param opts Resolved chart options — supplies the guide-line color and the readout/ruler-tag colors.
   * @param offsetX Left edge of the plot area, in CSS pixels — 0 unless the price ruler is on the left, in which case the horizontal guide line starts after its reserved width instead of at the canvas edge. The vertical guide line needs no adjustment: it's drawn at the pointer's own x, which is already an absolute canvas coordinate.
   * @param axisX Left edge of the ruler strip the price tag pins to, in CSS pixels — see `PriceAxis`'s own `axisX` parameter for how `ChartCore` derives it. Defaults to just past the plot area (`offsetX + paneWidth`), matching the "ruler on the right, flush against the plot" case, for callers (older tests included) that don't pass one explicitly.
   * @param timeAxisY Top edge of the time-axis strip the time tag pins to, in CSS pixels — the same y `TimeAxis`'s own labels sit under (`ChartCore.render()`'s `footerSeparatorY`: `priceHeight + volumeHeight`). Defaults to `paneHeight` (no volume pane) for callers that don't pass one explicitly.
   */
  constructor(
    pos: CrosshairPosition,
    candles: readonly Candle[],
    timeScale: TimeScale,
    priceScale: PriceScale,
    paneWidth: number,
    paneHeight: number,
    opts: Required<ChartOptions>,
    offsetX = 0,
    axisX = offsetX + paneWidth,
    timeAxisY = paneHeight
  ) {
    const dash = [4, 4];
    this.verticalLine = new DashedLine(pos.x, 0, pos.x, paneHeight, opts.textColor, dash);
    this.horizontalLine = new DashedLine(offsetX, pos.y, offsetX + paneWidth, pos.y, opts.textColor, dash);

    const price = priceScale.yToPrice(pos.y);
    this.priceTag = new Label(axisX + 2, pos.y - 10, price.toFixed(2), {
      textColor: opts.textColor,
      backgroundColor: opts.crosshairPriceTagColor,
      borderColor: opts.gridColor,
    });

    const candle = candles[timeScale.xToIndex(pos.x)];
    if (candle) {
      const readout = `O ${candle.open.toFixed(2)}  H ${candle.high.toFixed(2)}  L ${candle.low.toFixed(2)}  C ${candle.close.toFixed(2)}   ${price.toFixed(2)}`;
      this.label = new Label(8, 8, readout, {
        textColor: opts.textColor,
        backgroundColor: opts.backgroundColor,
        borderColor: opts.gridColor,
      });

      // Same "estimate for centering, Label re-measures at draw()"
      // trade-off TimeAxis's own labels make (see its own comment) - this
      // one just carries a longer string ("YYYY-MM-DD HH:MM:SS" vs.
      // "HH:MM"), so it needs its own estimate rather than reusing theirs.
      const timeText = formatDetailedTimeLabel(candle.time);
      const estimatedWidth = timeText.length * 7 + 12;
      this.timeTag = new Label(pos.x - estimatedWidth / 2, timeAxisY + 4, timeText, {
        textColor: opts.crosshairTimeTagTextColor,
        backgroundColor: opts.crosshairTimeTagColor,
        borderColor: opts.gridColor,
      });
    }
    // No candle under the pointer (e.g. it's past the last revealed bar) —
    // the guide lines and ruler price tag still draw, just without an
    // OHLC readout or time tag to show (neither has a candle to read a
    // time or O/H/L/C off of — see this class's own doc comment on why
    // the time tag needs a real candle the way the price tag never does).
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.verticalLine.draw(ctx);
    this.horizontalLine.draw(ctx);
    this.priceTag.draw(ctx);
    this.label?.draw(ctx);
    this.timeTag?.draw(ctx);
  }
}
