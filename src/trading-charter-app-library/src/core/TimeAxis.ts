import { AxisLabels } from "./AxisLabels.js";
import { Label } from "./shapes/Label.js";
import type { TimeScale } from "./Scale.js";
import type { Candle } from "./types.js";

/**
 * The time ruler: a row of date/time labels along the bottom of the
 * chart, one under each of `Grid`'s vertical gridlines — `PriceAxis`'s
 * horizontal counterpart (see `./AxisLabels.ts` for the shared "build
 * `ticks` in the constructor, `draw()` just replays them" base both
 * extend), for the same reason: a trader glancing down from a gridline
 * should be able to read what time it marks without counting bars.
 *
 * Takes the *exact same* x positions `Grid`'s vertical lines were built
 * from (see `ChartCore.render()`), rather than recomputing its own — the
 * only way a label is guaranteed to sit under its own gridline is for
 * both to come from one shared array, the same reasoning `PriceAxis` and
 * `Grid` already share for their tick-spacing formula.
 *
 * A position with no candle under it (past the end of the loaded buffer —
 * e.g. inside the empty margin `ChartOptions.barAreaWidthRatio` reserves,
 * or while the visible window is still filling up) is silently skipped
 * rather than guessed, the same "no data, no draw" choice `Markers` and
 * `Crosshair`'s OHLC readout make.
 */
export class TimeAxis extends AxisLabels {
  /**
   * @param candles The loaded candle buffer — only `time` is read.
   * @param timeScale Maps an x pixel back to the candle index under it.
   * @param xs Exact x positions (CSS pixels) to place one label under each of — normally `Grid`'s own vertical-gridline x positions, so labels and gridlines can never drift apart.
   * @param y Top edge of the time-axis strip, in CSS pixels.
   * @param backgroundColor Each label's background — normally the chart's own `backgroundColor`, same reasoning as `PriceAxis`.
   * @param textColor Label text color — normally `ChartOptions.textColor`.
   */
  constructor(
    candles: readonly Candle[],
    timeScale: TimeScale,
    xs: readonly number[],
    y: number,
    backgroundColor: string,
    textColor: string
  ) {
    super();
    for (const x of xs) {
      const candle = candles[timeScale.xToIndex(x)];
      if (!candle) continue;
      const text = formatTimeLabel(candle.time);
      // Label doesn't know its own width until draw() measures the text
      // (see its own doc comment) — this estimate (monospace at the
      // default 12px font runs close to 7px/character, plus the label's
      // own default padding) is only good enough to visually center a
      // short "HH:MM" string under its gridline, not pixel-exact, which
      // is the same trade-off every other tag/tick in this file's sibling
      // classes makes rather than plumbing a live `ctx` through here just
      // to measure ahead of time.
      const estimatedWidth = text.length * 7 + 12;
      this.ticks.push(new Label(x - estimatedWidth / 2, y + 4, text, { textColor, backgroundColor }));
    }
  }
}

/**
 * Formats a `Candle`'s Unix-seconds `time` as a compact 24-hour "HH:MM".
 * Deliberately hand-rolled with UTC getters rather than
 * `Date.prototype.toLocaleTimeString`, whose output depends on the
 * runtime's locale/timezone (different in CI than on a developer's
 * machine, and liable to change this label's exact text between two
 * otherwise-identical test runs) — this chart has no timezone concept of
 * its own (`Candle.time`'s own doc comment: "Unix seconds (UTC)"), so the
 * label should be exactly as deterministic as the data it's labeling.
 *
 * A coarser timeframe (daily bars and up) would eventually want a date
 * instead of a time-of-day — out of scope for the intraday replay data
 * this library is built against today (see `replay/timeframes.ts`'s
 * presets, all under a day), but the seam for that belongs here, in this
 * one function, rather than spread across every caller that wants a
 * time-axis label.
 */
function formatTimeLabel(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Formats a `Candle`'s Unix-seconds `time` as a full "YYYY-MM-DD
 * HH:MM:SS" - `Crosshair`'s date/time tag uses this rather than
 * `formatTimeLabel` above, because a tag that only follows the pointer
 * while hovering can afford the extra width a compact always-on axis
 * label can't, and "what date and time is this candle" is exactly what
 * hovering one is usually trying to answer - the axis strip's own
 * "HH:MM" already tells you *when in the day*, on the (mostly true, for
 * this library's still intraday-only presets - see `formatTimeLabel`'s
 * own doc comment) assumption that every visible candle falls on the
 * same day. Exported (unlike `formatTimeLabel`) specifically for
 * `Crosshair.ts` to import, same "one function, not spread across every
 * caller" reasoning `formatTimeLabel`'s own doc comment already makes -
 * this is that same seam, just for a second caller that needs more
 * detail than the axis strip does.
 */
export function formatDetailedTimeLabel(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const yyyy = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mo}-${dd} ${hh}:${mm}:${ss}`;
}
