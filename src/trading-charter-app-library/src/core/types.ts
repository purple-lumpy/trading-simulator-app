/**
 * Core data shapes for the chart engine. Mirrors the OHLCV structure from
 * the Market Replay Trainer requirements doc (symbol, timestamp, timeframe,
 * OHLCV, source) but the chart itself only needs the price/time fields.
 */
export interface Candle {
  /** Unix seconds (UTC) for the candle's open time. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * One update to a single bar, in-progress or settled — the canonical,
 * provider-agnostic shape every data source feeds into
 * ChartCore.applyUpdate(), whether that's historical replay
 * (see replay/ReplayController.ts) or, eventually, a live feed.
 *
 * The shape is deliberately modeled on the "isFinal" flag exchanges like
 * Binance already send on their kline WebSocket (`k.x`), rather than on
 * any one provider's exact message. A provider that only streams raw
 * ticks (Twelve Data, Finnhub) needs its own small adapter upstream that
 * aggregates ticks into bars and sets `final` itself — that adapter is the
 * only thing that has to know which provider it's talking to. Neither
 * ChartCore nor ReplayController do.
 */
export interface CandleUpdate {
  /** The bar as it stands right now — same OHLCV shape whether it's still forming or already settled. */
  candle: Candle;
  /** The bar's position in the full sequence (the replay cursor index, or the equivalent for a live feed). */
  index: number;
  /** false while the bar can still change and is safe to overwrite in place; true once it's locked — the next update starts a new bar. */
  final: boolean;
}

/** A trading annotation drawn at a specific candle's time/price — where a position was entered or exited. Rendered by `./Markers.ts`. */
export interface Marker {
  /** Must match a loaded candle's `time` exactly; a marker for a bar that's scrolled out of the buffer is silently skipped rather than drawn at a guess. */
  time: number;
  price: number;
  kind: "entry" | "exit";
  label?: string;
}

/** A horizontal stop-loss/take-profit level drawn across the whole price pane, independent of any single candle. Rendered by `./PriceLines.ts`. */
export interface PriceLine {
  price: number;
  kind: "stop-loss" | "take-profit";
  label?: string;
}

/** The currently-visible slice of the loaded candles, plus the price range they span — the same shape `ChartCore` derives internally each render, exposed here for a consumer that wants to read it. */
export interface Viewport {
  /** Index of the first visible candle. */
  startIndex: number;
  /** Index of the last visible candle (inclusive). */
  endIndex: number;
  minPrice: number;
  maxPrice: number;
}

/** Which edge of the chart the price ruler (`./PriceAxis.ts`) renders along. User-selectable per the v1 plan, not fixed at build time. */
export type PriceAxisPosition = "left" | "right";

/** Visual/layout options a `ChartCore` accepts at construction, merged over `DEFAULT_OPTIONS` — every field is optional for exactly that reason. */
export interface ChartOptions {
  /** Candle body width in px, before spacing. */
  candleWidth?: number;
  /** Gap between candles in px. */
  candleGap?: number;
  /** Fraction of canvas height given to the volume pane (0 disables it). */
  volumePaneRatio?: number;
  upColor?: string;
  downColor?: string;
  backgroundColor?: string;
  gridColor?: string;
  textColor?: string;
  /** Which side of the chart the price ruler renders on. */
  priceAxisPosition?: PriceAxisPosition;
  /** Width reserved for the price ruler, in px — plot area (candles/grid/price lines) shrinks by this much. */
  priceAxisWidth?: number;
  /** Whether the price ruler (a column of tick labels down one edge, see `./PriceAxis.ts`) renders at all. */
  showPriceAxis?: boolean;
  /** Whether the dashed current-price line and its ruler tag (see `./CurrentPriceLine.ts`) render. */
  showCurrentPriceLine?: boolean;
  /**
   * Color of the current-price line and its ruler tag. Kept as its own
   * option rather than reusing `upColor`/`downColor` (whether the *last*
   * candle happened to close up or down says nothing about whether the
   * *current* price is a level worth drawing attention to) and, more to
   * the point, because this is the first piece of the chart likely to get
   * a user-facing color picker once a settings UI exists — see the v1
   * plan's price-ruler item.
   */
  currentPriceLineColor?: string;
  /**
   * Background color of the price tag `Crosshair` pins to the ruler at
   * the pointer's y — "what price is under my cursor right now," as
   * distinct from `currentPriceLineColor`'s "what's the last traded
   * price." Deliberately its own option rather than reusing that one
   * (or `textColor`/`gridColor`): a trader glancing at the ruler needs to
   * tell the two tags apart at a glance, which only works if they're
   * visually distinct by default — and, like `currentPriceLineColor`,
   * this is a plain option specifically so a future settings UI can let
   * someone pick their own.
   */
  crosshairPriceTagColor?: string;
  /**
   * Background color of the detailed date/time tag `Crosshair` pins to
   * the time axis at the pointer's x - the time-axis counterpart to
   * `crosshairPriceTagColor` above, added for exactly the same reason:
   * a trader glancing down needs it to read as visually distinct from
   * the ordinary `TimeAxis` labels sitting right next to it, and from
   * `crosshairPriceTagColor` itself (the two point at different axes and
   * needn't share a color just because they're both "crosshair tags").
   * See `Crosshair`'s own doc comment for what the tag actually shows.
   */
  crosshairTimeTagColor?: string;
  /**
   * Text color for that same time tag - unlike `crosshairPriceTagColor`
   * (whose text always renders in the plain `textColor` every other
   * axis label uses), this one gets its own dedicated text-color option
   * too, since the tag's whole point is to stand out from the ordinary
   * time-axis labels beneath it, and a background color alone can't
   * guarantee enough contrast against every `textColor`/`backgroundColor`
   * combination a settings UI might land on.
   */
  crosshairTimeTagTextColor?: string;
  /**
   * Fill color for the plot pane's own background, drawn beneath the
   * gridlines. Falsy (the default, "") draws nothing extra, leaving
   * `backgroundColor` showing through underneath exactly as it did before
   * this option existed. Its own setting rather than folded into
   * `backgroundColor` because that one also underlies the price ruler
   * strip and volume pane, and a settings UI wants to let someone tint
   * just the plot area without repainting the whole canvas - see
   * `./Grid.ts` for where it's actually drawn.
   */
  gridBackgroundColor?: string;
  /**
   * Color of the vertical line marking where the plot pane ends and the
   * price ruler strip begins ("separate prices and the rest of the
   * chart", per the v1 plan's settings item). Only drawn at all when a
   * price ruler strip is actually reserved (`showPriceAxis` or
   * `showCurrentPriceLine`) - with neither on there's no boundary to mark.
   * A dedicated option rather than reusing `gridColor` so the boundary
   * can read as more prominent than an ordinary gridline by default.
   */
  gridSeparatorColor?: string;
  /**
   * Fraction of the plot area's width actually used to lay out candles
   * (and the vertical time-gridlines/TimeAxis labels that align with
   * them) - the remainder is left empty after the most recent bar, room
   * to see "what's ahead" rather than the chart running edge to edge.
   * Default 0.75. `Grid`'s horizontal lines, `PriceLines`, and
   * `CurrentPriceLine` are unaffected - they still span the *full* plot
   * width, since a price level or the current-price line means the same
   * thing whether or not there's a candle directly under it right now.
   */
  barAreaWidthRatio?: number;
  /**
   * Fraction of the price pane's height the visible price range is
   * scaled to fill; the rest splits evenly as padding above the highest
   * price and below the lowest (see `PriceScale`'s own `topPad`/
   * `bottomPad`). Default 0.75 (12.5% padding each side) - a bit more
   * breathing room than `PriceScale`'s own 0.08/0.08 default, so bars
   * don't read as flush against the pane's top/bottom edges.
   */
  priceAreaHeightRatio?: number;
  /** Height reserved for the time-axis label strip at the bottom, in CSS pixels — see `./TimeAxis.ts`. */
  timeAxisHeight?: number;
  /** Whether the time-axis label strip (a row of date/time labels under the vertical gridlines, see `./TimeAxis.ts`) renders at all. */
  showTimeAxis?: boolean;
}

/** `ChartOptions` with every field filled in — what a `ChartCore` actually renders with once the caller's partial options are merged over this. */
export const DEFAULT_OPTIONS: Required<ChartOptions> = {
  candleWidth: 6,
  candleGap: 3,
  volumePaneRatio: 0.18,
  upColor: "#26a69a",
  downColor: "#ef5350",
  backgroundColor: "#0e0f12",
  gridColor: "#22252b",
  textColor: "#9aa0a6",
  priceAxisPosition: "right",
  priceAxisWidth: 64,
  showPriceAxis: true,
  showCurrentPriceLine: true,
  currentPriceLineColor: "#9aa0a6",
  crosshairPriceTagColor: "#37474f",
  crosshairTimeTagColor: "#37474f",
  crosshairTimeTagTextColor: "#9aa0a6",
  gridBackgroundColor: "",
  gridSeparatorColor: "#3a3f47",
  barAreaWidthRatio: 0.75,
  priceAreaHeightRatio: 0.75,
  timeAxisHeight: 24,
  showTimeAxis: true,
};

/** Extension seam every indicator implements (see plugins/indicators). */
export interface Indicator {
  readonly name: string;
  /** Compute one output value per input candle (NaN where undefined, e.g. warm-up period). */
  compute(candles: readonly Candle[]): number[];
  /** "main" draws over the price pane; "aux" gets its own stacked pane (e.g. RSI, MACD). */
  readonly pane: "main" | "aux";
  color?: string;
}

/**
 * Extension seam every drawing tool implements (see
 * plugins/drawing-tools) - `BaseDrawingTool` there implements the
 * `points`/`addPoint`/`id`/`selected`/`isComplete`/`setPreviewPoint`
 * bookkeeping every concrete tool needs identically, so a new tool
 * (HorizontalLine, VerticalLine, Trendline, …) only has to extend it and
 * supply `name`/`maxPoints`/`draw()`/`hitTest()`.
 *
 * One `DrawingTool` instance is exactly one placed drawing, not a
 * reusable "current line" slot - `ChartCore` builds a brand-new instance
 * (via `plugins/drawing-tools/factory.ts`'s `createDrawingTool()`) every
 * time a tool type is selected, and again every time a placement
 * completes, pushing the just-finished one into its own permanent
 * `drawings` list. That's what lets any number of, say, horizontal
 * lines coexist on screen forever instead of each new one replacing the
 * last (the single-persistent-instance-per-type design this replaced).
 */
export interface DrawingTool {
  /** Unique for this instance's whole lifetime (see `BaseDrawingTool`'s constructor) - what `ChartCore` tracks selection and deletion by, since two placed lines of the same type otherwise look identical. */
  readonly id: string;
  readonly name: string;
  /** Chart (time, price) points the user has placed so far - NOT screen/pixel coordinates, so a placed point stays anchored to the same candle/price across pan, zoom, and re-render (see `draw()`'s own `toPixel` parameter for where the pixel conversion actually happens, fresh every frame). */
  points: Array<{ time: number; price: number }>;
  readonly maxPoints: number;
  /** Whether this instance is the one the user most recently clicked on (via `ChartCore`'s "cross"-tool click-to-select handling) - `ChartCore.render()` sets this fresh from its own selection state every frame, before calling `draw()`, so a concrete tool's `draw()` just reads it to decide whether to render its selected styling. */
  selected: boolean;
  /**
   * Feed one newly-placed point in. `ChartCore`'s `mousedown` handling
   * calls this on every click over the price pane while this instance is
   * the active tool's current in-progress placement (see
   * `ChartCore.setActiveDrawingTool()`'s own doc comment). A call once
   * `isComplete()` is already true is expected to be a safe no-op -
   * `ChartCore` stops feeding a completed instance and starts a fresh
   * one instead, so this should never actually happen in practice, but
   * implementations shouldn't throw or silently corrupt `points` if it
   * does.
   */
  addPoint(point: { time: number; price: number }): void;
  /** True once `points.length` has reached `maxPoints` - tells `ChartCore` to stop feeding this instance, push it into its permanent `drawings` list, and start a fresh instance (via `createDrawingTool()`) for the next placement. */
  isComplete(): boolean;
  /**
   * Sets (or, with `null`, clears) the not-yet-committed point a
   * hovering mouse is currently over, while this instance still has
   * fewer than `maxPoints` committed - lets `draw()` render a "ghost"/
   * rubber-band preview of where the next click would land (a trendline
   * dragging its still-open end, a horizontal/vertical line following
   * the pointer before its one click fixes it), so a trader can see
   * exactly where a line will be placed before committing to it.
   */
  setPreviewPoint(point: { time: number; price: number } | null): void;
  /**
   * True if the canvas-relative CSS-pixel position (`x`, `y`) is within
   * this drawing's own click-to-select tolerance. Used by `ChartCore`'s
   * "cross"-tool click handling to pick a specific placed drawing to
   * select (and, via Delete/Backspace or `deleteSelectedDrawing()`,
   * remove) - only ever called on completed (`isComplete()`) instances,
   * since only those ever make it into `ChartCore`'s `drawings` list.
   */
  hitTest(x: number, y: number, toPixel: (time: number, price: number) => { x: number; y: number }): boolean;
  draw(ctx: CanvasRenderingContext2D, toPixel: (time: number, price: number) => { x: number; y: number }): void;
  /**
   * Optional: explicitly ends placement without needing `points.length`
   * to reach `maxPoints` - for a tool with no natural fixed point count
   * (e.g. `TraceLine`, which keeps adding connected segments click after
   * click until the user says they're done). `ChartCore`'s double-click
   * and right-click/two-finger-click handling call this (via `?.`, so
   * tools that don't define it are simply unaffected) when such a
   * drawing is pending, then check `isComplete()` the same way the
   * normal per-click path already does to decide whether to commit it.
   * `HorizontalLine`/`VerticalLine`/`Trendline` don't need to implement
   * this at all - reaching their fixed `maxPoints` already completes
   * them through the ordinary `addPoint()`/`isComplete()` path.
   */
  finish?(): void;
}
