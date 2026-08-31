import { crispLine } from "../utils/pixel.js";
import { Line } from "./shapes/Line.js";
import { Rectangle } from "./shapes/Rectangle.js";

/**
 * Constructor options for `Grid` — see each field's own doc comment.
 * Grew from six positional parameters to this object specifically when
 * `verticalLineXs` was added (task: vertical time-gridlines): a seventh
 * and eighth positional parameter, both optional and both easy to
 * transpose with their neighbors at a call site, was the point at which
 * "one more argument" stopped being the cheaper option. Every existing
 * call site (just `ChartCore.render()`) was updated to match; there's
 * only ever been the one.
 */
export interface GridOptions {
  /** Plot area width, in CSS pixels — horizontal lines and the background span this, not the full canvas (the price ruler, if any, reserves its own strip outside this width). */
  paneWidth: number;
  /** Pane height, in CSS pixels — horizontal lines are spaced evenly across it, and vertical lines (if any) span it top to bottom. */
  paneHeight: number;
  /** Horizontal-line and vertical-line color. */
  color: string;
  /** Number of gaps between horizontal lines; there are `lineCount + 1` lines total, including the top and bottom edges. Default 4 (5 lines). */
  lineCount?: number;
  /** Left edge of the plot area, in CSS pixels — 0 unless the price ruler is on the left, in which case lines start after its reserved width instead of at the canvas edge. */
  offsetX?: number;
  /** Fill color for the plot pane, drawn before the gridlines. Falsy (the default, `""`) draws no fill at all, leaving the chart's own `backgroundColor` showing through underneath — unchanged from before this option existed. Kept separate from that option (rather than always painting it) specifically so a settings UI can offer "tint the plot area" as its own opt-in toggle, per the v1 plan's settings item, without every existing chart suddenly painting an extra rectangle it never asked for. */
  backgroundColor?: string;
  /** X position, in CSS pixels, of the vertical line marking where the plot pane ends and the price ruler strip begins — `undefined` (the default) draws no separator. The caller works out this position (it depends on which edge the ruler is on), `Grid` just draws a single vertical line spanning the pane's full height there; see `ChartCore.render()` for how it's derived. */
  separatorX?: number;
  /** Color for the ruler separator line. Ignored when `separatorX` is `undefined`. */
  separatorColor?: string;
  /**
   * X positions, in CSS pixels, of vertical time-gridlines spanning the
   * pane's full height — one per position, evenly spaced across the *bar
   * area* width by the caller (see `ChartCore.plotLayout()`'s
   * `barAreaWidth`), not the full plot width, since these lines exist to
   * mark where a candle is, and no candle is ever drawn past the bar
   * area's own right edge. `undefined`/omitted (the default) draws none,
   * matching this class's behavior before the option existed. Distinct
   * from `separatorX`/`separatorColor` — that one line marks the
   * *price-ruler* boundary and always renders in its own dedicated color;
   * these mark *time*, reuse the same `color` as the horizontal lines,
   * and there can be any number of them.
   */
  verticalLineXs?: number[];
}

/**
 * Evenly-spaced horizontal gridlines across a pane, built from `Line`
 * instances rather than raw canvas calls: the geometry — where each line
 * goes — lives entirely in the constructor, so `draw()` is just "draw
 * each line already built," and there's a real object per line to reason
 * about instead of loop-local coordinates.
 *
 * Also, optionally, the other things that live at the edges of (or
 * across) the plot pane rather than being one of its own gridlines: a
 * background fill for the pane itself (`backgroundColor`), vertical
 * time-gridlines corresponding to `ChartCore`'s new `TimeAxis` labels
 * (`verticalLineXs`), and a vertical divider where the pane ends and the
 * price ruler strip begins (`separatorX`/`separatorColor`). All three
 * reuse the same "geometry once in the constructor, draw() just replays
 * it" shape as the horizontal gridlines rather than becoming their own
 * render-object classes, since none has any geometry of its own beyond
 * "this pane's own bounds" or "a few more lines like the ones above" —
 * `Rectangle` and `Line` already say everything that needs saying.
 *
 * Rebuilt fresh every render (like `Bar`/`VolumeBar`) rather than held
 * onto — a `Grid` is nothing but a handful of small shape primitives,
 * cheap to construct, and the pane it spans can change size between
 * renders anyway.
 *
 * Spaces horizontal lines evenly regardless of what price each one lands
 * on — see `./PriceAxis.ts` for the tick labels that line up with these
 * same heights on whichever edge the price ruler renders. Vertical lines,
 * by contrast, are positioned entirely by the caller (`verticalLineXs`) —
 * see `./TimeAxis.ts` for the tick labels that line up with these same
 * x's along the new time-axis strip at the bottom of the chart.
 */
export class Grid {
  private readonly background: Rectangle | null;
  private readonly lines: Line[];
  private readonly verticalLines: Line[];
  private readonly separator: Line | null;

  constructor(opts: GridOptions) {
    const { paneWidth, paneHeight, color, lineCount = 4, offsetX = 0, backgroundColor = "", separatorX, separatorColor, verticalLineXs } = opts;

    this.background = backgroundColor ? new Rectangle(offsetX, 0, paneWidth, paneHeight, backgroundColor) : null;

    this.lines = [];
    for (let i = 0; i <= lineCount; i++) {
      // Horizontal 1px strokes need the half-pixel crisp-line offset (see
      // ../utils/pixel.ts) — Line itself stays unsnapped/generic (see its
      // own doc comment), so, like Wick, whichever composite knows its
      // own orientation applies the snap itself.
      const y = crispLine((paneHeight / lineCount) * i);
      this.lines.push(new Line(offsetX, y, offsetX + paneWidth, y, color));
    }

    // Same crisp-line treatment as the horizontal lines above, just
    // snapped on x instead of y since these are vertical. Spans the full
    // paneHeight, same as the ruler separator below — a time-gridline and
    // the price-ruler divider are both "a vertical line for the whole
    // pane," just at different x's and in different colors.
    this.verticalLines = (verticalLineXs ?? []).map((x) => {
      const cx = crispLine(x);
      return new Line(cx, 0, cx, paneHeight, color);
    });

    // Same crisp-line treatment as the horizontal lines above, just
    // snapped on x instead of y since this one's vertical.
    this.separator =
      separatorX !== undefined && separatorColor
        ? new Line(crispLine(separatorX), 0, crispLine(separatorX), paneHeight, separatorColor)
        : null;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.background?.draw(ctx);
    for (const line of this.lines) line.draw(ctx);
    for (const line of this.verticalLines) line.draw(ctx);
    this.separator?.draw(ctx);
  }
}
