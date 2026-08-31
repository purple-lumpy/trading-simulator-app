import { crispLine } from "../utils/pixel.js";
import { DashedLine } from "./shapes/DashedLine.js";
import { Label } from "./shapes/Label.js";
import type { PriceScale } from "./Scale.js";
import type { PriceLine } from "./types.js";

const STOP_LOSS_COLOR = "#ef5350";
const TAKE_PROFIT_COLOR = "#26a69a";

/**
 * Each configured stop-loss/take-profit level as a dashed horizontal line
 * across the price pane, with a small colored tag carrying its label when
 * it has one — a `DashedLine` plus, for a labeled line, a `Label` badge in
 * that same up/down color. (Earlier this drew bare `fillText` with no
 * background, which was easy to lose against busy candles; the `Label`
 * primitive introduced for the crosshair's readout fixes that for free.)
 *
 * Built fresh every render, like `Grid`/`Bar` — a price-lines overlay is
 * just `priceLines.length` small shapes, cheap to reconstruct.
 */
export class PriceLines {
  private readonly items: Array<{ line: DashedLine; label?: Label }>;

  /**
   * @param priceLines The configured stop-loss/take-profit levels.
   * @param paneWidth Plot area width, in CSS pixels — every line spans this, not the full canvas (the price ruler, if any, reserves its own strip outside this width).
   * @param priceScale Maps each line's price to a y pixel.
   * @param offsetX Left edge of the plot area, in CSS pixels — 0 unless the price ruler is on the left, in which case lines (and each label's near-edge position) shift right by its reserved width instead of starting at the canvas edge.
   */
  constructor(priceLines: readonly PriceLine[], paneWidth: number, priceScale: PriceScale, offsetX = 0) {
    this.items = priceLines.map((priceLine) => {
      const color = priceLine.kind === "stop-loss" ? STOP_LOSS_COLOR : TAKE_PROFIT_COLOR;
      const y = crispLine(priceScale.priceToY(priceLine.price));
      const line = new DashedLine(offsetX, y, offsetX + paneWidth, y, color);
      const label = priceLine.label
        ? new Label(offsetX + paneWidth - 90, y - 22, priceLine.label, {
            textColor: "#0e0f12",
            backgroundColor: color,
          })
        : undefined;
      return { line, label };
    });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const { line, label } of this.items) {
      line.draw(ctx);
      label?.draw(ctx);
    }
  }
}
