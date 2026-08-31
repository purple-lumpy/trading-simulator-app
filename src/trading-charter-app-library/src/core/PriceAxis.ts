import { AxisLabels } from "./AxisLabels.js";
import { Label } from "./shapes/Label.js";
import type { PriceScale } from "./Scale.js";

/**
 * The price ruler: a column of tick labels down one edge of the price
 * pane, each showing the price at an evenly-spaced height — the same
 * heights `Grid` draws its horizontal gridlines at (same `lineCount`,
 * same spacing formula), so every tick lines up with a gridline instead
 * of floating independently of it.
 *
 * Built from `Label` the same way `PriceLines`'/`Crosshair`'s badges are:
 * a small background rect sized to its own text, drawn on top of
 * whatever's underneath. Passing the chart's own `backgroundColor` as
 * each tick's background (see `ChartCore.render()`) is what turns that
 * into "read as part of the frame" rather than "a label pasted over the
 * chart" — a busy candle or gridline running behind a tick's strip gets
 * cleanly painted over, not layered under half-transparent text.
 *
 * Purely presentational and stateless like `Grid`/`PriceLines` — rebuilt
 * fresh every render from whatever `PriceScale` that render is using, so
 * panning/zooming (which changes the visible price range) is reflected
 * automatically without this class needing to know anything changed.
 *
 * Extends `AxisLabels` (see its own doc comment) — `TimeAxis` is this
 * class's horizontal counterpart, built the same way for the same reason.
 */
export class PriceAxis extends AxisLabels {
  /**
   * @param priceScale Maps a y pixel to the price at that height — used in reverse here (height to price) to label each tick.
   * @param paneHeight Price pane height, in CSS pixels — ticks are spaced evenly across it, matching `Grid`.
   * @param axisX Left edge of the axis strip, in CSS pixels (0 if the ruler is on the left; `canvasWidth - axisWidth` if on the right — `ChartCore` works this out from `ChartOptions.priceAxisPosition`).
   * @param backgroundColor Each tick's background — normally the chart's own `backgroundColor`, so a tick reads as part of the chart's frame rather than an overlay (see class doc comment).
   * @param textColor Tick text color — normally `ChartOptions.textColor`.
   * @param lineCount Number of gaps between ticks; there are `lineCount + 1` ticks total, including the top and bottom edges. Default 4 (5 ticks) — matches `Grid`'s default so ticks and gridlines align without either side needing to be told the other's count.
   */
  constructor(
    priceScale: PriceScale,
    paneHeight: number,
    axisX: number,
    backgroundColor: string,
    textColor: string,
    lineCount = 4
  ) {
    super();
    for (let i = 0; i <= lineCount; i++) {
      const y = (paneHeight / lineCount) * i;
      const price = priceScale.yToPrice(y);
      this.ticks.push(
        new Label(axisX + 4, y - 9, price.toFixed(2), {
          textColor,
          backgroundColor,
        })
      );
    }
  }
}
