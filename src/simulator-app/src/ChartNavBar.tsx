import { TIMEFRAME_PRESETS } from "trading-charter-app-library";
import type { TimeframePreset } from "trading-charter-app-library";
import type { Instrument } from "./instruments";

/**
 * Which drawing tool a click on the chart currently does. Named after
 * each real `DrawingTool`'s own `.name` (`HorizontalLine`/`VerticalLine`/
 * `Trendline` in trading-charter-app-library) except `"none"`, which has
 * no `DrawingTool` at all - it's what "the cross tool" (plain chart
 * navigation, no drawing) maps to; see `ChartCore.setActiveDrawingTool()`'s
 * own doc comment for why `null` is what that state becomes once it
 * reaches the chart. Exported so `App` (which owns this as state, same
 * "own the state, hand props down" shape `timeframeSeconds`/`startDate`
 * already follow) and `ChartPanel` (which resolves it to a real
 * `DrawingTool` instance and calls `setActiveDrawingTool()`) can both
 * reference the same type instead of each declaring their own.
 */
export type DrawingToolName = "none" | "horizontal-line" | "vertical-line" | "trendline" | "trace";

/**
 * One entry per toolbar button, in display order - `label` is the icon
 * glyph shown on the button (no text caption - the group's own `title`
 * plus each button's `title` already explain what's what on hover, and
 * `aria-label` below covers the same ground for screen readers), `name`
 * is what actually reaches `App`/`ChartPanel` via `onActiveToolChange`.
 * "none" (the cross/reset tool) is listed last so the three actual
 * drawing tools read left to right as "pick one," with the way back to
 * plain navigation at the end.
 */
const DRAWING_TOOLS: ReadonlyArray<{ name: DrawingToolName; label: string; ariaLabel: string; title: string }> = [
  { name: "horizontal-line", label: "\u2015", ariaLabel: "Horizontal line", title: "Horizontal line \u2014 click once on the chart to mark a price level" },
  { name: "vertical-line", label: "\uFF5C", ariaLabel: "Vertical line", title: "Vertical line \u2014 click once on the chart to mark a moment in time" },
  { name: "trendline", label: "\u2197", ariaLabel: "Trend line", title: "Trend line \u2014 click once to start it, click again to set its end point" },
  // A squiggle ending in an arrowhead, not a plain "W" - matches what
  // the tool actually draws on the chart (a zigzag whose last leg
  // carries an arrow showing which way the trend is heading, see
  // TraceLine's own doc comment), so the button previews its own effect.
  {
    name: "trace",
    label: "\u21DD",
    ariaLabel: "Trace (multi-point line with a trend arrow)",
    title: "Trace \u2014 click to place each point, keep clicking to add more connected segments (zigzag through as many as you like); the last leg gets an arrow showing the trend's direction. Double-click, right-click, or a two-finger click to finish it",
  },
  // A plain "+" rather than an "X"/multiplication glyph - this is the
  // crosshair tool, matching the actual crosshair cursor it puts the
  // chart into (see ChartCore's cursorFor()), not a close/cancel symbol.
  { name: "none", label: "+", ariaLabel: "Cross (no drawing)", title: "Cross \u2014 back to normal chart navigation (pan/zoom/crosshair), no drawing" },
];

interface ChartNavBarProps {
  /** Every selectable instrument - see instruments.ts's own doc comment. Passed down rather than imported directly here so this stays "props in, callback out" like every other control in this bar. */
  instruments: readonly Instrument[];
  /** Which instrument is currently selected. `App` owns this the same "state up here, callback back down" way it owns `startDate`/`activeTool`. */
  instrument: Instrument;
  /** Called with the newly picked instrument. */
  onInstrumentChange: (instrument: Instrument) => void;
  /**
   * Whether the currently-loaded candle set is real historical data
   * (true) or the sample/synthetic fallback (false) - `App`'s own
   * `isReal`, threaded through so the badge next to the instrument
   * picker can say which one this instrument actually ended up with
   * (real data is discovered empirically per-symbol, see instruments.ts's
   * own doc comment - the same instrument can be sample data one moment
   * and real the next, right after its fetch resolves).
   */
  isReal: boolean;
  /** The candle set's own bar duration, in seconds — same value `ChartPanel` receives, see its own prop doc comment. */
  timeframeSeconds: number;
  /** Called with the newly selected preset's `seconds` — `App` owns the actual state (see its own doc comment on why timeframe selection lives there, one level above `ChartPanel`), this component just renders whatever it's given and reports a choice back up. */
  onTimeframeChange: (seconds: number) => void;
  /**
   * Which presets are selectable right now — defaults to every preset
   * the library ships (`TIMEFRAME_PRESETS`), but `App` passes a
   * restricted list while real data is active, since real data's
   * 1-minute base series can't be resampled into the sub-minute presets
   * (resampleCandles rejects a finer target than its source — see
   * App's own REAL_DATA_PRESETS doc comment). Kept as a prop rather than
   * this component reading data-mode itself, so it stays "props in,
   * callback out" with no knowledge of *why* a preset might be missing.
   */
  presets?: readonly TimeframePreset[];
  /** Replay start date, or `null` for "most recent data" - see App's own doc comment on this state. */
  startDate: Date | null;
  /** Called with the newly picked date, or `null` when cleared back to "most recent". */
  onStartDateChange: (date: Date | null) => void;
  /** Which drawing tool is currently selected - see `DrawingToolName`'s own doc comment. `App` owns this the same "state up here, callback back down" way it owns `startDate`. */
  activeTool: DrawingToolName;
  /** Called with the newly selected tool's name, including `"none"` for the cross/reset button. */
  onActiveToolChange: (tool: DrawingToolName) => void;
}

/**
 * Explains the date picker on hover - a `title` attribute (a native
 * browser tooltip, no extra component needed) rather than a visible
 * caption next to it, matching how the timeframe `<select>` right next
 * to it already favors an accessible-but-not-visible label. Its own
 * constant (not inlined in the JSX below) because it's long enough that
 * inlining it would swamp the markup around it.
 */
const START_DATE_TOOLTIP =
  "Load real historical BTC/USD data starting from this date and replay it forward from there, " +
  "same as the default \"most recent data\" view just starting from a day you pick instead of today. " +
  "Needs the local data-server running (see src/data-server) - no API key required, it talks to " +
  "Coinbase's public API directly - if it's not reachable, or this date has no data, the chart " +
  "quietly falls back to sample data instead. " +
  "Clear the date to go back to the most recent data.";

/** `Date` -> the `YYYY-MM-DD` an `<input type=\"date\">` expects, read with UTC getters - this app treats every candle time as UTC throughout (see TimeAxis.ts's own doc comment on why), so the date picker stays on that same convention rather than silently switching to the browser's local timezone. */
function toDateInputValue(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The nav bar rendered directly above the chart — pulled out of `App`'s
 * header (where the timeframe `<select>` used to live inline) into its
 * own component specifically so it has somewhere to grow: the v1 plan's
 * settings item calls for "other settings in future" living alongside
 * the timeframe picker here, and a dedicated component with its own file
 * is a one-line JSX addition away from that, where a `<select>` sitting
 * loose in `App`'s header markup wasn't.
 *
 * Purely presentational — it owns no state of its own, the same
 * "props in, callback out" shape `ColorSetting` uses one level down in
 * the settings panel. `App` still owns `timeframeSeconds` itself (see
 * its own doc comment on why: changing it regenerates the whole candle
 * set, not just how `ChartPanel` plays one back), this component just
 * renders whatever it's given.
 */
export function ChartNavBar({
  instruments,
  instrument,
  onInstrumentChange,
  isReal,
  timeframeSeconds,
  onTimeframeChange,
  presets = TIMEFRAME_PRESETS,
  startDate,
  onStartDateChange,
  activeTool,
  onActiveToolChange,
}: ChartNavBarProps) {
  return (
    <div className="chart-nav-bar">
      {/* Same "no visible caption, aria-label carries the accessible
          name" reasoning as the timeframe picker just below - traders
          read the instrument's own label ("BTC/USD") straight off the
          selected option. The badge right after it is the "if there is
          not real data, mark sample" ask - always visible, right next to
          the thing it's describing, rather than only spelled out in the
          smaller header line above the chart. */}
      <label className="instrument-picker" aria-label="Instrument" title="Choose which instrument to load. Real historical data is fetched where available (see the badge); otherwise this falls back to sample data automatically.">
        <select
          value={instrument.symbol}
          onChange={(e) => {
            const next = instruments.find((i) => i.symbol === e.target.value);
            if (next) onInstrumentChange(next);
          }}
        >
          {instruments.map((i) => (
            <option key={i.symbol} value={i.symbol}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
      <span
        className={isReal ? "data-mode-badge data-mode-badge--real" : "data-mode-badge data-mode-badge--sample"}
        title={
          isReal
            ? "Real historical data, replayed as if live - not a live feed (see the header below)."
            : "No real data source for this instrument yet, or it's still loading - showing generated sample data instead."
        }
      >
        {isReal ? "Real" : "Sample"}
      </span>
      {/* Traders read "5m"/"1h" etc. straight off the option labels below
          without needing a "Timeframe" caption spelled out next to it -
          the select still carries an accessible name via aria-label, just
          not a visible one, per the v1 plan's own audience assumptions. */}
      <label className="timeframe-picker" aria-label="Timeframe">
        <select value={timeframeSeconds} onChange={(e) => onTimeframeChange(Number(e.target.value))}>
          {presets.map((preset) => (
            <option key={preset.seconds} value={preset.seconds}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      {/* title= is the hover explanation this control needs (see
          START_DATE_TOOLTIP's own comment) - "Start date" alone, without
          it, would leave someone guessing whether this replays sample
          data or real data, and what happens with it left blank. */}
      <label className="start-date-picker" title={START_DATE_TOOLTIP}>
        Start date
        <input
          type="date"
          value={startDate ? toDateInputValue(startDate) : ""}
          max={toDateInputValue(new Date())}
          onChange={(e) => {
            const value = e.target.value;
            onStartDateChange(value ? new Date(`${value}T00:00:00Z`) : null);
          }}
        />
        {startDate && (
          // Only rendered once a date is actually picked - clearing an
          // already-empty picker back to "most recent" isn't a choice
          // worth offering a button for.
          <button
            type="button"
            className="start-date-clear"
            title="Clear - go back to the most recent data"
            onClick={() => onStartDateChange(null)}
          >
            ×
          </button>
        )}
      </label>
      {/* One toggle-style button per DRAWING_TOOLS entry - exactly one is
          ever "pressed" (aria-pressed, and the drawing-tool-active class
          for the visible highlight), matching a real toolbar's radio-like
          tool selection rather than a set of independent checkboxes. */}
      <div
        className="drawing-tools"
        role="group"
        aria-label="Drawing tools"
        title="Pick a tool, then click the chart to place it - the same tool stays selected so you can place several in a row. With Cross selected, click a placed line to select it, then press Delete or Backspace to remove just that one."
      >
        {DRAWING_TOOLS.map((tool) => (
          <button
            key={tool.name}
            type="button"
            className={tool.name === activeTool ? "drawing-tool-active" : undefined}
            aria-pressed={tool.name === activeTool}
            aria-label={tool.ariaLabel}
            title={tool.title}
            onClick={() => onActiveToolChange(tool.name)}
          >
            {tool.label}
          </button>
        ))}
      </div>
      {/* Future settings controls (per the v1 plan's "and other settings
          in future") slot in here, beside the timeframe picker, without
          this bar's own layout needing to change shape. */}
    </div>
  );
}
