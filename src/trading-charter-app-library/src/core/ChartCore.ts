import { PriceScale, priceRangeFor, TimeScale } from "./Scale.js";
import { Crosshair } from "./Crosshair.js";
import type { CrosshairPosition } from "./Crosshair.js";
import { Grid } from "./Grid.js";
import { PriceLines } from "./PriceLines.js";
import { PriceAxis } from "./PriceAxis.js";
import { TimeAxis } from "./TimeAxis.js";
import { CurrentPriceLine } from "./CurrentPriceLine.js";
import { Markers } from "./Markers.js";
import { IndicatorLine } from "./IndicatorLine.js";
import { Bar } from "./shapes/Bar.js";
import { VolumeBar } from "./shapes/VolumeBar.js";
import { Line } from "./shapes/Line.js";
import { crispLine } from "../utils/pixel.js";
import {
  Candle,
  CandleUpdate,
  ChartOptions,
  DEFAULT_OPTIONS,
  DrawingTool,
  Indicator,
  Marker,
  PriceLine,
  Viewport,
} from "./types.js";
import { createDrawingTool } from "../plugins/drawing-tools/factory.js";
import type { DrawingToolTypeName } from "../plugins/drawing-tools/factory.js";

/**
 * The chart's rendering core: candlesticks + volume on Canvas 2D, pan/zoom,
 * crosshair, trading overlays (markers/price lines), and a plugin seam for
 * indicators/drawing tools. See docs/implementation-plan.md §3.4 for the
 * v1 feature list this class is scoped against.
 *
 * `ChartCore` itself owns orchestration only — instance state (which
 * candles are loaded, which window is visible, the pointer position) and
 * the order render() calls things in. The actual drawing is delegated
 * out: `./shapes/` holds the object-oriented primitives that know how to
 * paint themselves (`Rectangle`/`Line` → `Bar`/`VolumeBar`/`Wick`/
 * `DashedLine` → … , plus `Triangle`/`Polyline` for the two shapes that
 * are neither a box nor a straight line — see each file's own doc
 * comment), and every render object this file constructs (`Grid`,
 * `PriceLines`, `PriceAxis`, `CurrentPriceLine`, `Crosshair`, `Markers`,
 * `IndicatorLine`) is a class composed from one or more of those
 * primitives, built fresh from current state on every `render()` call and
 * thrown away once drawn. Keeping *how* each piece renders inside its own
 * well-documented, independently-testable class is what keeps *this*
 * file a short, readable list of *what* renders and in what order — none
 * of it needs to be read to understand the sequence below, only to change
 * one piece's behavior.
 *
 * The price ruler (`PriceAxis`) reserves a strip of canvas width on
 * whichever edge `ChartOptions.priceAxisPosition` names, and everything
 * else that spans the price pane horizontally — `Grid`, `PriceLines`,
 * `CurrentPriceLine`, the candles/volume bars themselves (via
 * `TimeScale`), and the crosshair's horizontal guide line — is handed a
 * plot width and offset that already exclude it, computed once per
 * `render()` and threaded through. Nothing downstream needs to know which
 * side the ruler is on; it just draws within the width and starting-x
 * it's given.
 *
 * Data flows in one direction only: setData()/applyUpdate() mutate the
 * candle buffer, render() is the only thing that touches the canvas. The
 * replay controller (../replay/ReplayController.ts) drives applyUpdate()
 * off a cursor, not a wall clock — this class doesn't know or care which,
 * or whether the update it's given is a settled bar or one still forming
 * (see applyUpdate's own doc comment).
 *
 * Sharpness: the canvas's backing store is sized at CSS size × devicePixelRatio
 * (see applyPixelRatio) and every draw call below works in CSS-pixel
 * coordinates via a scaled transform — without this, a canvas on a Retina
 * display renders at half the physical pixel density it has available, and
 * that softness is exactly what shows up when a screenshot gets zoomed in.
 * The shapes in `./shapes/` additionally snap their own coordinates to
 * whole device pixels (see `./pixel.ts`) so 1px strokes don't straddle two
 * rows and anti-alias into a blur.
 */
export class ChartCore {
  private candles: Candle[] = [];
  private markers: Marker[] = [];
  private priceLines: PriceLine[] = [];
  private indicators: Indicator[] = [];
  /**
   * Every drawing (line/trendline/…) that's been fully placed - a click
   * completing a tool's last point pushes it here (see
   * `handleMouseDown`) and it renders on every future `render()` call
   * forever after, independent of whichever tool (if any) is active now.
   * This is what lets placing a new horizontal line, say, leave every
   * earlier one still on screen instead of replacing it - see
   * `DrawingTool`'s own doc comment for the full picture. Removed
   * individually via `deleteSelectedDrawing()`, never cleared in bulk
   * (no UI for that yet).
   */
  private drawings: DrawingTool[] = [];
  /**
   * The in-progress instance the active tool (`activeDrawingToolName`)
   * is currently placing points into - a fresh one built by
   * `createDrawingTool()` every time `setActiveDrawingTool()` selects a
   * tool, and again every time a placement completes (see
   * `handleMouseDown`), so the *next* click starts an independent new
   * instance rather than continuing to edit the one that was just
   * pushed into `drawings` above. `null` whenever no tool is active (the
   * "cross" tool).
   */
  private pendingDrawing: DrawingTool | null = null;
  /**
   * Which drawing-tool TYPE a click over the price pane should currently
   * feed a point into (via `pendingDrawing` above), or `null` for plain
   * pan/zoom/crosshair/selection behavior - see
   * `setActiveDrawingTool()`'s own doc comment and `handleMouseDown`'s
   * first branch for how this changes what a click does.
   */
  private activeDrawingToolName: DrawingToolTypeName | null = null;
  /**
   * The id of whichever placed drawing (in `drawings` above) the user
   * most recently clicked on while the "cross" tool is active - `null`
   * when nothing's selected. This is what Delete/Backspace
   * (`handleKeyDown`) and the public `deleteSelectedDrawing()` actually
   * remove; `render()` sets each drawing's own `selected` flag fresh
   * from this every frame, which is what its `draw()` reads to render
   * selected styling.
   */
  private selectedDrawingId: string | null = null;
  /**
   * Registered by `onRender()` below - fired at the end of every
   * `render()` call. The general "something about the chart's own drawn
   * state may have changed" signal a consumer needs for UI it overlays
   * on top of the canvas (an HTML button, say) whose position depends on
   * state ChartCore owns and has no more specific event for. See
   * `onRender()`'s own doc comment for why this is simpler than teaching
   * every state-changing method to notify separately.
   */
  private onRenderCallback: (() => void) | null = null;

  private startIndex = 0;
  private endIndex = 0;
  private crosshairPos: CrosshairPosition | null = null;
  /** Multiplies the auto-fitted price range's half-width around its own center every render — 1 is "exactly what auto-fit produced," <1 zooms in (a narrower range, so the same candles are stretched taller), >1 zooms out. Manual, user-driven zoom via the price axis (wheel/drag — see `zoomPrice()`, `handleWheel`, `handleMouseMove`); nothing here disables auto-fit itself, this just scales whatever range it comes up with each frame, so newly-revealed candles keep adjusting the *center* while a zoom the user dialed in keeps applying on top. */
  private priceZoomFactor = 1;
  /**
   * Added to the auto-fitted price range's center every render, after
   * `priceZoomFactor` stretches it — the vertical mirror of a manual pan,
   * wired to dragging up/down over the chart body (see `handleMouseMove`'s
   * `"pan"` branch) the same gesture that already shifts `startIndex`/
   * `endIndex` horizontally. Unlike `panByCandles()`, this is never
   * clamped to the data's bounds — the whole point is being able to drag
   * into empty space above the highest price or below the lowest, e.g.
   * to make room to see (or draw) a strategy level that's nowhere near
   * the currently-visible candles. 0 is "auto-fit's own center,
   * unshifted"; positive shifts the visible range toward higher prices,
   * negative toward lower ones. See `panPrice()`'s own doc comment for
   * the sign convention this follows and why.
   */
  private pricePanOffset = 0;
  /**
   * Multiplies `ChartOptions.candleWidth`/`candleGap` every render — the
   * time-axis mirror of `priceZoomFactor` right above, and deliberately
   * built the same way: 1 is "candles at their configured pixel size,"
   * <1 shrinks each candle (more fit in the same space, the time-axis
   * labels under them read closer together), >1 grows each candle (fewer
   * fit, labels spread apart). See `zoomedCandleWidth()`/
   * `zoomedCandleGap()` for where this actually gets applied, and
   * `zoom()`'s own doc comment for why this replaced an earlier design
   * that resized the visible *index* window instead of the candles
   * themselves — which never actually changed a candle's drawn size.
   */
  private timeZoomFactor = 1;
  /**
   * Which gesture a click-drag is currently performing, or `null` between
   * drags — set once by `handleMouseDown`, based on which of the three
   * regions the drag *started* in (`isOverPriceAxis()`/`isOverTimeAxis()`),
   * and never reconsidered mid-drag even if the pointer wanders into a
   * different region: `"price"`/`"time"` zoom the price/time axis (over
   * the price-ruler strip or the time-axis label strip, respectively —
   * see `zoomPrice()`/`zoom()`); `"pan"` shifts the visible window in
   * both directions at once without resizing it (everywhere else — the
   * price and volume panes, i.e. the chart's actual content — see
   * `panByCandles()` horizontally and `pricePanOffset` vertically). Read
   * and cleared by `handleMouseMove`/`handleMouseUp`.
   */
  private dragMode: "price" | "time" | "pan" | null = null;
  /**
   * The drag's reference pointer coordinate — what it means depends on
   * `dragMode`. For `"price"`/`"time"` (exponential zoom, composed factor
   * by factor every move) it's the *previous* move's coordinate, updated
   * every move, so `handleMouseMove` diffs one incremental step at a
   * time. For `"pan"` (linear, no compounding) it's the coordinate the
   * drag *started* at, left unchanged for the drag's whole duration, so
   * every move recomputes the pan fresh from that one fixed anchor
   * instead of accumulating per-move rounding error — see
   * `panDragStartIndex` alongside it, and `handleMouseMove`'s own doc
   * comment for why anchor-based beats incremental for a linear gesture.
   */
  private lastDragCoord = 0;
  /**
   * `startIndex` at the moment a `"pan"` drag began — `handleMouseMove`
   * recomputes `startIndex` fresh from this anchor and the total drag
   * distance so far on every move, rather than incrementally shifting it
   * (see `lastDragCoord`'s own doc comment for why anchor-based is the
   * right choice here). Unused for `"price"`/`"time"` drags.
   */
  private panDragStartIndex = 0;
  /**
   * `pricePanOffset` at the moment a `"pan"` drag began — the vertical
   * counterpart to `panDragStartIndex` right above, used the same
   * anchor-based way: `handleMouseMove` recomputes `pricePanOffset` fresh
   * from this anchor and the total vertical drag distance so far on every
   * move, rather than incrementally accumulating per-move deltas. Kept
   * anchor-based purely for symmetry with the horizontal half of the same
   * gesture in that same branch — unlike `panDragStartIndex`, there's no
   * clamping here `pricePanOffset` needs protecting from (see its own
   * doc comment), so incremental accumulation would have been equally
   * safe; this just means both axes read the same way at the call site.
   */
  private priceOffsetDragStart = 0;
  /** Pointer y at the moment a `"pan"` drag began — the vertical counterpart to `lastDragCoord`'s anchor role for `"pan"` mode specifically (x and y need separate anchors since a single drag moves both at once). Paired with `priceOffsetDragStart` above; unused for `"price"`/`"time"` drags, same as `panDragStartIndex`. */
  private panDragStartY = 0;

  private opts: Required<ChartOptions>;
  private ctx: CanvasRenderingContext2D;

  /** Logical (CSS-pixel) canvas size — what all drawing math below is in terms of, regardless of devicePixelRatio. */
  private width: number;
  private height: number;

  /**
   * @param canvas The `<canvas>` element to render into. Its current
   *   `clientWidth`/`clientHeight` (or, failing that, its `width`/`height`
   *   attributes, or a 600×400 fallback) become the chart's initial
   *   logical size — call `resize()` later if the element's size changes.
   * @param options Visual/layout options, merged over `DEFAULT_OPTIONS`.
   */
  constructor(private canvas: HTMLCanvasElement, options: ChartOptions = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("ChartCore: canvas 2D context unavailable");
    this.ctx = ctx;
    this.opts = { ...DEFAULT_OPTIONS, ...options };

    this.width = canvas.clientWidth || canvas.width || 600;
    this.height = canvas.clientHeight || canvas.height || 400;
    this.applyPixelRatio();

    this.attachInteraction();
  }

  /**
   * Sizes the canvas's backing store to CSS size × `devicePixelRatio` and
   * scales the context so every draw call below can keep working in
   * CSS-pixel coordinates without knowing or caring what the device's
   * pixel density actually is. Takes no parameters and returns nothing —
   * it reads `this.width`/`this.height` (the logical size some other
   * method just set) and mutates `this.canvas`/`this.ctx` directly, the
   * same instance-state-in, canvas-out shape every private render helper
   * in this class follows.
   *
   * Called at construction (once, from the constructor) and again from
   * `resize()` whenever the caller reports a new CSS size — safe to call
   * repeatedly, since `ctx.setTransform(...)` *replaces* the context's
   * transform rather than composing with whatever was there before
   * (unlike `ctx.scale(...)`, which would compound a little more zoomed
   * in on every call this ran on the same context).
   *
   * `window.devicePixelRatio` is read defensively (`typeof window !==
   * "undefined"`) rather than assumed to exist, so this class doesn't
   * blow up if it's ever constructed somewhere `window` isn't defined
   * (e.g. a server-side render or a non-browser canvas polyfill) —
   * `Math.round` on the resulting backing-store size guards the same
   * scenario `crispRect`/`crispLine` guard elsewhere in this library: a
   * fractional device-pixel count silently reintroducing blur.
   */
  private applyPixelRatio(): void {
    const dpr = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Call when the canvas's CSS size changes (e.g. a container resize or the window moving to a different-DPR display). */
  resize(cssWidth: number, cssHeight: number): void {
    this.width = cssWidth;
    this.height = cssHeight;
    this.applyPixelRatio();
    this.render();
  }

  /**
   * Merge new values into this chart's options and re-render — the single
   * runtime-reconfiguration entry point every other "change how the chart
   * looks/behaves after construction" feature builds on: a settings
   * panel flipping colors or toggling the volume pane, live-switching
   * `priceAxisPosition`, or anything else `ChartOptions` covers. Before
   * this existed, `options` was only ever read once, in the constructor
   * (`this.opts = { ...DEFAULT_OPTIONS, ...options }`) — fine for a chart
   * whose config is fixed for its lifetime, but a settings UI needs to
   * change a *live* chart's config, which means `this.opts` has to be
   * mutable after construction too.
   *
   * Deliberately a *merge* over the current `this.opts`, mirroring the
   * constructor's own merge over `DEFAULT_OPTIONS` — a caller passes only
   * the fields it's changing (`chart.setOptions({ upColor: "#0f0" })`),
   * every other field stays exactly what it already was, rather than a
   * settings UI needing to resend the entire options object on every
   * single tweak.
   *
   * Note this only changes *options* — data (`setData`/`applyUpdate`),
   * markers/priceLines/indicators/drawing tools, and the viewport
   * (`startIndex`/`endIndex`, via `panByCandles`/`zoom`) all have their
   * own setters and are untouched here, even when an option technically
   * relates to them (e.g. `showPriceAxis` changes how much width the
   * price ruler reserves — see `render()` — but doesn't touch the
   * viewport itself, so the visible candles stay the same, they just get
   * more or less room to draw in).
   *
   * `barAreaWidthRatio` is the one exception to "options never touch the
   * viewport," and deliberately so: unlike `showPriceAxis`, it changes
   * how many candles the *same* zoomed step fits into `barAreaWidth`
   * (`defaultVisibleCount()`'s own formula, at whatever zoom is
   * currently in effect — see `visibleCountAtZoom()`), not just how much
   * drawing room they have. `drawCandles()` always draws exactly
   * `startIndex..endIndex`, laid out by index and zoomed step regardless
   * of `barAreaWidth` (see `TimeScale.indexToX()` — it never reads
   * `paneWidth`), so leaving the window untouched here would make a live
   * settings-panel edit to this one option silently do nothing until the
   * next `setData()`/`applyUpdate()` happened to recompute it — the bug
   * this branch exists to close. Reusing `recenterWindow()` (see its own
   * comment) keeps this in the window's current center and current zoom
   * level, the same as any other resize that isn't a pan.
   */
  setOptions(options: ChartOptions): void {
    const barAreaWidthRatioChanged =
      options.barAreaWidthRatio !== undefined && options.barAreaWidthRatio !== this.opts.barAreaWidthRatio;
    this.opts = { ...this.opts, ...options };
    if (barAreaWidthRatioChanged && this.candles.length > 0) {
      this.recenterWindow(this.visibleCountAtZoom());
    }
    this.render();
  }

  // ---- data API --------------------------------------------------------

  /**
   * Replace the entire candle buffer and scroll to show its most recent
   * bars. This is the "load a historical range up front" path — for
   * candle-at-a-time replay/live updates use `applyUpdate()` instead,
   * which doesn't reset the visible window on every call.
   */
  setData(candles: readonly Candle[]): void {
    this.candles = candles.slice();
    this.endIndex = this.candles.length - 1;
    this.startIndex = Math.max(0, this.endIndex - this.defaultVisibleCount());
    this.render();
  }

  /**
   * Apply one update to the bar at `update.index`. This is the
   * provider-agnostic replay/live update path (§3.4): `update.final`
   * mirrors the flag a live feed like Binance's kline stream sends — false
   * while a bar is still being built (safe to overwrite in place) and true
   * once it's settled. A ReplayController with `intrabarTicks` set
   * produces a stream of non-final updates before the final one,
   * synthesizing the same shape a live feed would produce; ChartCore
   * doesn't need to know which case it's looking at, only *where* the
   * incoming candle belongs — `update.index` says so directly, so this
   * method never has to infer position from `candle.time` equality.
   *
   * Driven entirely by `index` against the buffer's current length, this
   * one method handles three cases a caller may throw at it, in either
   * direction:
   *
   * - **`index` is the buffer's last slot** — the current bar is still
   *   forming (or just got a late correction after locking): overwrite
   *   that slot in place, nothing else changes.
   * - **`index` is past the end** — a genuinely new bar: append it.
   * - **`index` is *before* the last slot** — a step backward
   *   (`ReplayController.stepBackward()`/`seek()` moved the cursor back):
   *   every bar after `index` gets dropped, not just overwritten, so the
   *   buffer's end always matches the caller's own idea of "how far
   *   we've gotten." Without this case, stepping back would leave the
   *   bar(s) ahead of the new cursor position still sitting in the
   *   buffer — exactly the "previous bar renders in front of the current
   *   one instead of replacing it" bug this method is written to avoid.
   *   Once the caller steps forward again, the normal "past the end"
   *   case above re-adds each bar it re-emits, so nothing here is
   *   `ReplayController`-specific: any caller that re-sends a bar at an
   *   index it previously stepped past gets the same correct behavior.
   *
   * Assumes sequential access — `index` moves by exactly one step per
   * call in either direction, which is all `ReplayController` (or a real
   * live feed) ever does. A caller that jumps `index` ahead by more than
   * one in a single call (skipping bars) would still just get that one
   * bar appended at the buffer's physical end, silently misaligned with
   * its claimed `index`; nothing here validates or fixes that, since
   * neither `ReplayController` nor a typical live feed does it in
   * practice — `seek()` repositions the cursor without emitting, for
   * exactly this reason.
   */
  applyUpdate(update: CandleUpdate): void {
    const { candle, index } = update;

    if (index < this.candles.length) {
      // The slot at `index` already exists in the buffer — whether it's
      // the same bar still forming, a late correction, or (index is
      // before the current last slot) a step backward. Either way,
      // truncating to `index + 1` before writing is what makes the
      // "still forming"/"correction" case a no-op resize and the
      // "step backward" case actually drop the bars ahead of it, with
      // the same two lines of code.
      this.candles.length = index + 1;
      this.candles[index] = candle;
    } else {
      // A genuinely new bar past what's loaded so far.
      this.candles.push(candle);
    }

    // Re-derive the visible window from wherever the buffer's end landed
    // — works the same whether that end just grew (a new bar) or shrank
    // (a step backward truncated it). Two cases, distinguished by what the
    // window looked like *before* this update:
    //
    // - Still filling up: the window was already showing everything from
    //   the start (startIndex === 0) and hadn't yet reached the default
    //   visible count — nothing has scrolled or been manually zoomed yet.
    //   Recomputed exactly like setData() does, so the window keeps
    //   showing from bar 0 and simply grows by one bar at a time, until
    //   it eventually reaches the default count on its own.
    // - Already scrolled or zoomed: the window was either full (at the
    //   default count) or narrower/wider than default because of a manual
    //   zoom/pan. Either way its *width* was intentional, so that's what
    //   gets preserved — the window slides forward to keep following the
    //   buffer's end, same width as before.
    //
    // Without this distinction, a chart with only a couple of bars loaded
    // (buffer smaller than the default visible count) would start
    // scrolling bars out of view on every single new bar, instead of
    // filling up the window first like a real chart does.
    const previousVisibleCount = this.endIndex - this.startIndex + 1;
    const wasStillFilling = this.startIndex === 0 && previousVisibleCount <= this.defaultVisibleCount();

    this.endIndex = this.candles.length - 1;
    this.startIndex = wasStillFilling
      ? Math.max(0, this.endIndex - this.defaultVisibleCount())
      : Math.max(0, this.endIndex - (previousVisibleCount - 1));
    this.render();
  }

  /** Replace the set of entry/exit markers drawn on the price pane and re-render. */
  setMarkers(markers: Marker[]): void {
    this.markers = markers;
    this.render();
  }

  /** Replace the set of stop-loss/take-profit price lines drawn on the price pane and re-render. */
  setPriceLines(lines: PriceLine[]): void {
    this.priceLines = lines;
    this.render();
  }

  // ---- plugin seam -------------------------------------------------------

  /** Register an `Indicator` (e.g. `MovingAverage`) to be computed and drawn on every future render. Indicators accumulate — there's no `unregister` yet, since v1 has no UI for removing one once added. */
  registerIndicator(indicator: Indicator): void {
    this.indicators.push(indicator);
    this.render();
  }

  /**
   * Sets which drawing-tool TYPE a click over the price pane should
   * place points into - `null` (the default) restores plain
   * pan/zoom/crosshair/selection behavior, which is what a consumer's
   * "cross"/"none" tool-selector option is expected to pass.
   *
   * Unlike the old (removed) instance-based version of this method, this
   * doesn't take a `DrawingTool` instance to register - `ChartCore`
   * builds its own fresh one internally via `createDrawingTool()` every
   * time a tool is selected here, and again every time a placement
   * completes (see `pendingDrawing`'s own doc comment for why that's
   * what lets multiple lines of the same type all stay on screen
   * permanently instead of each new placement replacing the last one).
   * Also clears any current selection - switching tools is a strong
   * enough signal that the previous click-to-select target is no longer
   * what the user's attention is on.
   *
   * `handleMouseDown` checks `activeDrawingToolName` first, before its
   * usual three-region pan/zoom-drag routing: while a tool is active, a
   * click over the price pane places a point and does NOT also start a
   * pan/zoom drag. Both behaviors at once would make precise placement
   * impossible - the chart sliding out from under the pointer mid-click
   * is exactly what a drawing tool's user is trying to avoid. Select the
   * "cross" tool (pass `null` here) to get pan/zoom/drag and
   * click-to-select back.
   */
  setActiveDrawingTool(name: DrawingToolTypeName | null): void {
    this.activeDrawingToolName = name;
    this.pendingDrawing = name ? createDrawingTool(name) : null;
    this.selectedDrawingId = null;
    this.render();
  }

  /**
   * Removes whichever placed drawing is currently selected (see
   * `handleMouseDown`'s "cross"-tool click-to-select branch), if any -
   * a no-op if nothing is selected. Exposed publicly, not just wired to
   * the internal Delete/Backspace `keydown` handling (see
   * `attachInteraction()`), so a consumer can also drive deletion from
   * its own UI - a toolbar "Delete" button, say - without needing to
   * reach into `ChartCore`'s private selection state to do it.
   */
  deleteSelectedDrawing(): void {
    if (this.selectedDrawingId === null) return;
    this.drawings = this.drawings.filter((d) => d.id !== this.selectedDrawingId);
    this.selectedDrawingId = null;
    this.render();
  }

  /**
   * Registers a callback fired at the end of every `render()` call -
   * pass `null` to remove it. At most one at a time (same
   * one-consumer-so-far shape as `getGearAnchor()`, no use case yet for
   * more).
   *
   * Exists for UI a consumer overlays on top of the canvas whose
   * position depends on chart state with no single controlled trigger
   * of its own - `getSelectedDrawingDeleteAnchor()` below is the current
   * example: pan, zoom, a click that selects/deselects a drawing, a data
   * update... anything that changes what's on screen can move or clear
   * it, and `render()` already runs on every one of those paths, so
   * hooking its end is simpler and more robust than teaching each of
   * them to notify separately. (`getGearAnchor()` doesn't need this -
   * its position only ever moves when the consumer's own code calls
   * `setOptions()`, a moment it already controls and can re-read the
   * anchor from directly.)
   */
  onRender(callback: (() => void) | null): void {
    this.onRenderCallback = callback;
  }

  /**
   * Where a delete ("×") badge for the currently-selected placed drawing
   * should sit, in canvas-relative CSS pixels - `null` when nothing's
   * selected. Lets a consuming app (see simulator-app's `ChartPanel`)
   * position an HTML overlay button next to a selected drawing without
   * this library needing to draw or hit-test a delete affordance itself
   * - the existing Delete/Backspace keydown path (`handleKeyDown`) and
   * `deleteSelectedDrawing()` stay exactly as they are; this is purely
   * an additional, more discoverable way to trigger the same removal.
   *
   * Anchored to the selected drawing's *first* point (`points[0]`) for
   * every tool type alike, rather than something shape-specific like a
   * trendline's midpoint - simple, and always well-defined even for a
   * horizontal/vertical line's single point, which is what the click
   * that placed it actually anchored to begin with.
   */
  getSelectedDrawingDeleteAnchor(): { x: number; y: number } | null {
    if (this.selectedDrawingId === null) return null;
    const drawing = this.drawings.find((d) => d.id === this.selectedDrawingId);
    if (!drawing || drawing.points.length === 0) return null;
    const { timeScale, priceScale } = this.buildScales();
    const toPixel = this.toPixelFn(timeScale, priceScale);
    return toPixel(drawing.points[0].time, drawing.points[0].price);
  }

  // ---- pan / zoom ---------------------------------------------------------

  /**
   * Shift the visible window by `delta` candles (negative = pan
   * left/back in history, positive = pan right/forward), clamped to the
   * loaded data's bounds. Wired to a click-drag anywhere over the chart's
   * actual content — the price and volume panes, as opposed to the
   * price-ruler strip or the time-axis label strip, both of which zoom
   * instead (see `handleMouseDown`'s three-region routing and
   * `handleMouseMove`'s `"pan"` branch).
   */
  panByCandles(delta: number): void {
    const width = this.endIndex - this.startIndex;
    this.startIndex = clamp(this.startIndex + delta, 0, Math.max(0, this.candles.length - 1 - width));
    this.endIndex = this.startIndex + width;
    this.render();
  }

  /**
   * Shift the visible *price* range by `deltaPrice` (positive = toward
   * higher prices, negative = toward lower), with no clamping at all —
   * `panByCandles()`'s vertical counterpart, but deliberately unbounded:
   * `panByCandles()` clamps to the loaded data because an index past the
   * data doesn't mean anything, but a price above the highest candle or
   * below the lowest is still a perfectly good price, and being able to
   * drag *into* that empty space - to line up a strategy level that's
   * nowhere near current candles, say - is the entire point (see
   * `pricePanOffset`'s own doc comment). `render()`'s `PriceScale` just
   * draws whatever's asked of it, on-data or not.
   *
   * Not what `handleMouseMove`'s `"pan"` branch itself calls for its own
   * vertical shift, even though it does the equivalent thing — see that
   * branch's own comment for why it assigns `pricePanOffset` directly
   * instead of routing through here. This exists as the standalone public
   * counterpart to `panByCandles()`, for a consumer (or a test) that
   * wants to pan price the same programmatic way.
   */
  panPrice(deltaPrice: number): void {
    this.pricePanOffset += deltaPrice;
    this.render();
  }

  /**
   * Scroll straight back to the most recently loaded candle, preserving
   * the current window width (so a zoomed-in or zoomed-out view stays
   * that way) and resetting `pricePanOffset` to 0 - the on-demand
   * counterpart to what `applyUpdate()`'s "already scrolled or zoomed"
   * branch does automatically as new bars arrive, for the moment right
   * *before* that: a chart that's been dragged away from the live edge,
   * horizontally (`panByCandles()`, into history) or vertically
   * (`panPrice()`/the drag-pan's own vertical shift, off to a price range
   * with no candles in it) or both at once.
   *
   * Deliberately leaves `priceZoomFactor`/`timeZoomFactor` untouched -
   * "jump to the latest candle" means *which* candle is in view, not
   * undoing a manual zoom level someone set on purpose. Wired to a "jump
   * to latest" control a consumer places outside the canvas (there's no
   * in-chart UI for it, same as `panByCandles()`/`panPrice()` themselves)
   * - safe to call even when the chart is already at the live edge, since
   * it's just a another render of the same state in that case.
   */
  scrollToLatest(): void {
    const width = this.endIndex - this.startIndex;
    this.endIndex = this.candles.length - 1;
    this.startIndex = Math.max(0, this.endIndex - width);
    this.pricePanOffset = 0;
    this.render();
  }

  /**
   * The current visible price range: `priceRangeFor()`'s auto-fit
   * `[min, max]` for whichever candles are visible, stretched by
   * `priceZoomFactor` around its own center (see `zoomPrice()`'s doc
   * comment), then shifted by `pricePanOffset` (see its own doc comment)
   * — the one place this three-input math lives, read by both `render()`
   * (to build the frame's `PriceScale`) and `getViewport()` below (so a
   * consumer/test can observe the same range without scraping draw
   * calls). `pricePanOffset` is what finally justified extracting this
   * rather than leaving it duplicated in both places, the choice
   * `getViewport()`'s own doc comment used to defend — a third caller-
   * visible input was one too many to keep hand-copied in sync.
   */
  private priceRange(): { minPrice: number; maxPrice: number } {
    const { min, max } = priceRangeFor(this.candles, this.startIndex, this.endIndex);
    const mid = (min + max) / 2 + this.pricePanOffset;
    const halfRange = ((max - min) / 2 || 1) * this.priceZoomFactor;
    return { minPrice: mid - halfRange, maxPrice: mid + halfRange };
  }

  /**
   * Builds this frame's `TimeScale`/`PriceScale` pair from current
   * pan/zoom/data state - factored out of `render()` so `pointFromPixel()`
   * (used by `setActiveDrawingTool()`'s click handling) reads pixel
   * positions back against the *exact* same pane geometry a frame
   * actually drew, with no risk of the two ever computing it differently.
   * Calls `plotLayout()`/`priceRange()` itself rather than taking their
   * outputs as parameters - both are cheap and already re-derived on
   * every call by design (see their own doc comments), so avoiding one
   * extra internal call from `render()` isn't worth two extra parameters
   * here.
   */
  private buildScales(): { timeScale: TimeScale; priceScale: PriceScale } {
    const { plotOffsetX, barAreaWidth, priceHeight } = this.plotLayout();
    const timeScale = new TimeScale(this.startIndex, this.endIndex, barAreaWidth, this.zoomedCandleWidth(), this.zoomedCandleGap(), plotOffsetX);
    const { minPrice, maxPrice } = this.priceRange();
    const pricePad = (1 - this.opts.priceAreaHeightRatio) / 2;
    const priceScale = new PriceScale(minPrice, maxPrice, priceHeight, pricePad, pricePad);
    return { timeScale, priceScale };
  }

  /**
   * Converts a canvas-relative CSS-pixel position (e.g. a `mousedown`
   * event's coordinates, the same coordinate space `crosshairPos` lives
   * in) to a chart (time, price) point - what `setActiveDrawingTool()`'s
   * click handling feeds into `DrawingTool.addPoint()`. `time` snaps to
   * the nearest candle under `x` (the same `TimeScale.xToIndex()` lookup
   * `Crosshair`'s own OHLC readout uses) rather than reading a continuous
   * time value - a drawing tool anchors to a real candle, not to whatever
   * exact fraction of a pixel the pointer happened to land on; `price`
   * stays continuous, matching the crosshair's own price tag.
   *
   * Returns `null` when there's no candle under `x` at all (past the
   * last revealed bar, in the empty margin `barAreaWidthRatio` reserves)
   * - the same "nothing to anchor a time to" case `Crosshair`'s own OHLC
   * readout skips, and for the same reason: a point with no real candle
   * behind it has nothing stable to stay anchored to once the data set
   * underneath it changes.
   */
  private pointFromPixel(x: number, y: number): { time: number; price: number } | null {
    const { timeScale, priceScale } = this.buildScales();
    const index = timeScale.xToIndex(x);
    const candle = this.candles[index];
    const time = candle ? candle.time : this.extrapolateTime(index);
    if (time === null) return null;
    return { time, price: priceScale.yToPrice(y) };
  }

  /**
   * The (constant, across this render's candle set) time-per-candle
   * step, derived from the last two loaded candles - or `null` if there
   * aren't two to derive it from (an all-but-empty chart, in practice
   * never hit once any real session is loaded). Every candle set this
   * app ever loads (sample or real, any timeframe) is evenly spaced, so
   * any adjacent pair gives the same answer; the last two are read
   * specifically because `extrapolateTime()`'s most common caller is "a
   * few candles past the end," where they're already the nearest real
   * anchor.
   */
  private barDurationSeconds(): number | null {
    const last = this.candles.length - 1;
    if (last < 1) return null;
    return this.candles[last].time - this.candles[last - 1].time;
  }

  /**
   * A chart-time value for a candle `index` that isn't actually loaded -
   * most commonly one past `endIndex` (clicking/hovering in the empty
   * margin `barAreaWidthRatio` leaves ahead of the last revealed bar,
   * see `ChartOptions.barAreaWidthRatio`'s own doc comment), but the
   * same formula is equally valid for an index before the first loaded
   * candle. Extrapolated linearly from `candles[0]`'s own time using
   * `barDurationSeconds()`'s step, so a drawing placed here lands on the
   * exact same time a real candle eventually arriving at that index
   * would carry (see `toPixelFn()`'s own doc comment for the other half
   * of this: converting such a time back to pixels before - or after - a
   * real candle ever shows up there). `null` only when there's nothing
   * to extrapolate *from* (see `barDurationSeconds()`), i.e. no data
   * loaded at all - the one case `pointFromPixel()` still can't place a
   * point for.
   */
  private extrapolateTime(index: number): number | null {
    if (this.candles.length === 0) return null;
    const barDuration = this.barDurationSeconds();
    if (barDuration === null) return this.candles[0].time; // exactly one candle loaded - nothing to extrapolate a step from, so every index maps to it
    return this.candles[0].time + index * barDuration;
  }

  /**
   * The same (time, price) -> pixel mapping `render()` builds for every
   * placed drawing to draw itself with - looks a candle's index up by
   * its own `time` (rather than trusting a stale index a point might
   * have been placed against before a pan/zoom/data change) first, and
   * when no *currently loaded* candle carries that exact time - a point
   * placed past the last candle (or before the first), per
   * `pointFromPixel()`'s own `extrapolateTime()` - derives the
   * equivalent index the same linear way `extrapolateTime()` derived the
   * time in the first place, so the two are exact inverses of each
   * other: a point placed 6 bars past the end renders 6 bars past the
   * end, not snapped back to whatever's currently the last revealed bar
   * (the old behavior this replaced). Falls back to `endIndex` only in
   * the one case even extrapolation can't help - fewer than two candles
   * loaded (see `barDurationSeconds()`) - so a drawing never crashes a
   * render even against a near-empty chart.
   *
   * Factored out here (from `render()`'s own inline version) so
   * `hitTestDrawings()` and the hover-preview handling in
   * `handleMouseMove` convert a placed drawing's points to pixels the
   * exact same way a real render just did or will, with no risk of the
   * two ever disagreeing.
   */
  private toPixelFn(timeScale: TimeScale, priceScale: PriceScale): (time: number, price: number) => { x: number; y: number } {
    return (time: number, price: number) => {
      const index = this.candles.findIndex((c) => c.time === time);
      const resolvedIndex = index >= 0 ? index : this.extrapolateIndex(time);
      return { x: timeScale.indexToX(resolvedIndex), y: priceScale.priceToY(price) };
    };
  }

  /** Inverse of `extrapolateTime()` - see its own doc comment and `toPixelFn()`'s, which is this method's only caller. */
  private extrapolateIndex(time: number): number {
    const barDuration = this.barDurationSeconds();
    if (barDuration === null || barDuration === 0) return this.endIndex;
    return (time - this.candles[0].time) / barDuration;
  }

  /**
   * Finds whichever placed drawing (in `drawings`, most-recently-placed
   * first, so an overlapping pair resolves to whichever was drawn on
   * top) the given canvas-relative CSS-pixel position hits, per that
   * drawing's own `hitTest()` - or `undefined` if none do. Used by
   * `handleMouseDown`'s "cross"-tool click-to-select branch only, so
   * it's not worth caching against `buildScales()`'s own already-cheap
   * recomputation.
   */
  private hitTestDrawings(x: number, y: number): DrawingTool | undefined {
    const { timeScale, priceScale } = this.buildScales();
    const toPixel = this.toPixelFn(timeScale, priceScale);
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      if (this.drawings[i].hitTest(x, y, toPixel)) return this.drawings[i];
    }
    return undefined;
  }

  /**
   * Read the chart's current viewport - the visible candle range plus the
   * price range they span - without scraping draw calls. Delegates the
   * price half to `priceRange()` (see its own doc comment) rather than
   * caching a `Viewport` as instance state, so it can never drift out of
   * sync with what actually gets drawn: it's cheap to recompute and
   * there's no cache-invalidation path to get wrong. Intended for a
   * consumer (or a test) that wants to observe pan/zoom state directly
   * instead of inferring it from draw calls.
   */
  getViewport(): Viewport {
    const { minPrice, maxPrice } = this.priceRange();
    return { startIndex: this.startIndex, endIndex: this.endIndex, minPrice, maxPrice };
  }

  /**
   * `ChartOptions.candleWidth`, scaled by `timeZoomFactor` — the one
   * place every render/layout call that draws or measures a candle's
   * body reads its width from, so a manual time-zoom actually changes
   * candle geometry rather than just which indices are nominally "in
   * view" (see `zoom()`'s own doc comment for the bug this replaced).
   */
  private zoomedCandleWidth(): number {
    return this.opts.candleWidth * this.timeZoomFactor;
  }

  /** `ChartOptions.candleGap`, scaled the same way — see `zoomedCandleWidth()`. Kept as a separate method (not folded into `zoomedStep()` alone) because `TimeScale` and `Bar`/`VolumeBar` each need candle width and the width-plus-gap step independently. */
  private zoomedCandleGap(): number {
    return this.opts.candleGap * this.timeZoomFactor;
  }

  /** The current zoomed horizontal step (candle body + gap) — `zoomedCandleWidth() + zoomedCandleGap()`, the same pairing `TimeScale.step` computes internally once fed these two. */
  private zoomedStep(): number {
    return this.zoomedCandleWidth() + this.zoomedCandleGap();
  }

  /**
   * How many candles fit across the bar area *at the current zoom* —
   * `zoom()`'s own version of `defaultVisibleCount()`, using the zoomed
   * step instead of the configured one, and floored at 1 rather than 20:
   * `defaultVisibleCount()`'s floor exists to keep a *fresh, unzoomed*
   * chart from opening absurdly sparse, but reusing that same floor here
   * would silently cap how far a genuine zoom-in could ever go (the
   * whole point of zooming in is to end up looking at a handful of very
   * large candles, possibly fewer than 20 of them).
   */
  private visibleCountAtZoom(): number {
    const { barAreaWidth } = this.plotLayout();
    return Math.max(1, Math.floor(barAreaWidth / this.zoomedStep()));
  }

  /**
   * Scale candle width/gap by `factor` (>1 zooms out — each candle
   * shrinks, more fit on screen; <1 zooms in — each candle grows, fewer
   * fit), around the visible window's current center — wired to a
   * wheel/drag gesture over the chart body or time-axis strip (see
   * `handleWheel`/`handleMouseMove`); `zoomPrice()` right below is its
   * price-axis counterpart, and this is now built the same way: a
   * persistent factor (`timeZoomFactor`) gets adjusted and re-applied
   * every render, rather than this method reaching into `startIndex`/
   * `endIndex` and picking a one-off new width.
   *
   * `timeZoomFactor` is *divided* by `factor`, not multiplied — the
   * inverse of how `zoomPrice()` applies its own factor to
   * `priceZoomFactor`. That's not an inconsistency: `priceZoomFactor`
   * scales a *range* (bigger factor → wider range → same candles read as
   * visually smaller → zoomed out), while `timeZoomFactor` scales a
   * candle's own *pixel size* directly (bigger factor there would mean
   * *bigger* candles → zoomed in) — so preserving the established
   * `factor > 1` = "zoom out" convention this method's callers already
   * rely on (`handleWheel`'s scroll-down, `handleMouseMove`'s rightward
   * time-axis drag) requires shrinking `timeZoomFactor` as `factor`
   * grows, i.e. dividing rather than multiplying.
   *
   * That inversion aside, this is a deliberate replacement of this
   * method's original design, which resized the visible *index* window
   * (`endIndex - startIndex`) while every candle still drew at
   * `ChartOptions.candleWidth`/`candleGap`'s fixed pixel size — so
   * "zooming" never actually stretched anything: it only changed how
   * many indices were nominally "in view," leaving unfilled space when
   * that shrank below what the bar area could hold, or silently clipping
   * extra indices when it grew past that. Now `timeZoomFactor` scales
   * the candles' own pixel geometry (`zoomedCandleWidth()`/
   * `zoomedCandleGap()`), and the index window's width is a
   * *consequence* of that — however many candles fit at the new size
   * (`visibleCountAtZoom()`) — recentered on the window's previous
   * center the same way this method always centered a zoom, just driven
   * by candle size now instead of index count.
   */
  zoom(factor: number): void {
    this.timeZoomFactor = clamp(this.timeZoomFactor / factor, 0.1, 10);
    this.recenterWindow(this.visibleCountAtZoom());
    this.render();
  }

  /**
   * Re-centers the visible index window on its own current center at a
   * new width (`newCount`), clamped to the loaded data's bounds —
   * extracted from `zoom()`'s own body (see its doc comment: "recentered
   * on the window's previous center") once `setOptions()` needed the
   * identical math for a different trigger. Both callers share the same
   * shape of problem: the window's width needs to change for a reason
   * that has nothing to do with panning (a manual time-zoom for `zoom()`,
   * `barAreaWidthRatio` changing how many candles the *same* zoomed step
   * fits for `setOptions()` — see its own comment), so both should keep
   * the view centered where it already was rather than snapping to
   * whichever edge `Math.max(0, ...)`'s clamp happens to favor.
   */
  private recenterWindow(newCount: number): void {
    const oldCount = Math.max(1, this.endIndex - this.startIndex + 1);
    const center = this.startIndex + oldCount / 2;
    this.startIndex = clamp(Math.round(center - newCount / 2), 0, Math.max(0, this.candles.length - newCount));
    this.endIndex = Math.min(this.candles.length - 1, this.startIndex + newCount - 1);
  }

  /**
   * Scale the visible *price* range by `factor` (>1 zooms out, <1 zooms
   * in) around its own center — `zoom()`'s counterpart for the vertical
   * axis, wired to a wheel/drag gesture over the price-ruler strip
   * instead of the chart body (see `handleWheel`/`handleMouseMove`,
   * routed by `isOverPriceAxis()`).
   *
   * There's no `startIndex`/`endIndex`-shaped state to scale here, though
   * — unlike the time axis, the price range isn't independently tracked
   * state, it's recomputed fresh every render from whichever candles are
   * currently visible (`priceRangeFor()` in `render()`). So rather than
   * `zoom()`'s "shrink the window, re-derive the range," this multiplies
   * `priceZoomFactor` — the factor `render()` applies to whatever
   * auto-fit range it derives that frame — clamped to a sane band so it
   * can't collapse to a zero-height range or expand indefinitely. Auto-fit
   * keeps adjusting the range's *center* as candles come and go; this
   * only ever affects how much taller or shorter than that auto-fit the
   * candles are drawn.
   */
  zoomPrice(factor: number): void {
    this.priceZoomFactor = clamp(this.priceZoomFactor * factor, 0.1, 10);
    this.render();
  }

  /**
   * Shared layout math for one frame: where the price ruler's strip is
   * (if shown at all) and what's left over for the plot area. Both
   * `render()` and `isOverPriceAxis()` (which the wheel/drag zoom
   * handlers use to decide which axis a gesture targets) derive from this
   * exact same computation, so the boundary a gesture keys off can never
   * drift from the boundary actually drawn.
   */
  private plotLayout() {
    const opts = this.opts;
    const showAxisArea = opts.showPriceAxis || opts.showCurrentPriceLine;
    const axisWidth = showAxisArea ? opts.priceAxisWidth : 0;
    const axisOnLeft = opts.priceAxisPosition === "left";
    const plotOffsetX = axisOnLeft ? axisWidth : 0;
    const plotWidth = this.width - axisWidth;
    const axisX = axisOnLeft ? 0 : plotWidth;

    // Horizontal: candles (and the vertical time-gridlines/TimeAxis labels
    // aligned with them) only ever occupy `barAreaWidthRatio` of the plot
    // width — the rest is empty margin after the most recent bar, room to
    // see "what's ahead" instead of the chart running edge to edge. Nothing
    // else spans this narrower width: Grid's horizontal lines, PriceLines,
    // and CurrentPriceLine still use the full `plotWidth` above, since a
    // price level means the same thing whether or not a candle happens to
    // sit directly under it right now.
    const barAreaWidth = plotWidth * opts.barAreaWidthRatio;

    // Vertical bands, bottom-up: the time-axis label strip (a fixed CSS-pixel
    // height, since it holds text, not a proportional one) reserves its
    // space first; the volume pane takes a fraction of whatever's left
    // under it; the price pane gets the remainder. Whether the volume pane
    // or the time-axis strip is toggled off, this still adds up to exactly
    // `this.height` — each one just contributes 0.
    const timeAxisHeight = opts.showTimeAxis ? opts.timeAxisHeight : 0;
    const remainingHeight = this.height - timeAxisHeight;
    const volumeHeight = opts.volumePaneRatio > 0 ? remainingHeight * opts.volumePaneRatio : 0;
    const priceHeight = remainingHeight - volumeHeight;

    return { showAxisArea, axisWidth, axisOnLeft, plotOffsetX, plotWidth, axisX, barAreaWidth, timeAxisHeight, volumeHeight, priceHeight };
  }

  /**
   * True when `x` (canvas-relative CSS pixels) falls within the price
   * ruler's reserved strip — the region a wheel/drag gesture treats as
   * "the price axis" (routed to `zoomPrice()`), checked first by every
   * caller ahead of `isOverTimeAxis()` and the implicit "everything else
   * is chart content" fallback (see `handleMouseDown`). Always false when
   * no strip is reserved at all (`showPriceAxis`/`showCurrentPriceLine`
   * both off), so a gesture anywhere on the canvas then falls through to
   * `isOverTimeAxis()`/pan, same as before either of these options
   * existed.
   */
  private isOverPriceAxis(x: number): boolean {
    const { showAxisArea, axisX, axisWidth } = this.plotLayout();
    return showAxisArea && x >= axisX && x < axisX + axisWidth;
  }

  /**
   * True when `(x, y)` (canvas-relative CSS pixels) falls within the
   * time-axis label strip at the very bottom of the chart, or within
   * `TIME_AXIS_HIT_SLOP` px above it — the region a wheel/drag gesture
   * treats as "the time axis" (routed to `zoom()`, the same stretch
   * behavior the whole non-price-axis area used to have) as distinct
   * from the chart's actual content above it (the price and volume
   * panes, routed to `panByCandles()` instead — see `handleMouseDown`).
   *
   * The slop exists because `timeAxisHeight` defaults to a mere 24px —
   * a sliver next to the price-ruler strip's 64px — so a real drag
   * genuinely aimed at "the time axis" easily starts a few pixels short
   * of it, over the volume pane, and silently gets treated as a pan
   * instead: reported as "the time axis is panning the bars instead of
   * stretching them," which is exactly what a hit-test with zero
   * tolerance for a target this thin produces. Slop is added to the hit
   * *test* only, not to `timeAxisHeight`/`plotLayout()` — the visual
   * strip stays exactly as tall as it's drawn; only where a drag is
   * still willing to call that "close enough" grows.
   *
   * Self-contained rather than assuming the caller already ruled out the
   * price axis: always false over the price-ruler strip too (that corner
   * belongs to `isOverPriceAxis()`, so the two regions never overlap),
   * and always false when the strip isn't shown at all (`showTimeAxis`
   * off, so `timeAxisHeight` is 0 and the slop doesn't apply either —
   * there's no strip to be "close to").
   */
  private isOverTimeAxis(x: number, y: number): boolean {
    const { timeAxisHeight } = this.plotLayout();
    if (timeAxisHeight <= 0 || y < this.height - timeAxisHeight - TIME_AXIS_HIT_SLOP) return false;
    return !this.isOverPriceAxis(x);
  }

  /**
   * True when `(x, y)` (canvas-relative CSS pixels) falls within the main
   * price/candle pane specifically — not the price-ruler strip, not the
   * time-axis label strip, and not the volume pane between them. This is
   * *not* about which drag/wheel gesture a region routes to (that's still
   * `isOverPriceAxis()`/`isOverTimeAxis()` alone — the volume pane keeps
   * routing to `"pan"`, the same as the price pane, unaffected by this
   * method) — it's what `handleMouseMove` checks before setting
   * `crosshairPos` at all.
   *
   * The crosshair's whole point is reading a *price* off the pointer's
   * height via the ruler tag — that stops meaning anything the moment the
   * pointer leaves the price pane: over the volume pane, that same height
   * corresponds to a volume, not a price, so a price readout there would
   * just be wrong; over either axis strip, a different gesture already
   * owns the pointer (`ns-resize`/`ew-resize` zoom, or the strip's own
   * label text), and a crosshair drawn on top would be two different
   * controls fighting for the same cursor instead of one clear one. So
   * this narrows "where a crosshair even makes sense" down to the single
   * pane it's actually reading a price from — the crosshair simply
   * doesn't exist anywhere else, rather than existing but showing a
   * misleading or redundant readout.
   */
  private isOverPricePane(x: number, y: number): boolean {
    const { priceHeight } = this.plotLayout();
    return y < priceHeight && !this.isOverPriceAxis(x) && !this.isOverTimeAxis(x, y);
  }

  /**
   * Where a settings-gear button should be centered, in canvas-relative CSS
   * pixels, so a consuming app (see simulator-app's `SettingsPanel`) can
   * position an HTML overlay button without duplicating this library's own
   * layout math — and without that position ever able to drift from
   * wherever `render()` actually drew the boundaries it's meant to sit
   * inside, since both read the same `plotLayout()`.
   *
   * Centered horizontally in the price-ruler strip (the column between the
   * plot area's edge and the canvas edge, or vice versa depending on
   * `priceAxisPosition`) and vertically in the "footer" band below the
   * price pane — the volume pane plus the time-axis label strip, or
   * whichever of the two is actually showing (both, either, or neither),
   * since `plotLayout()`'s `priceHeight`/`this.height` already account for
   * that. This is the same footer band `render()` draws the volume bars
   * and time-axis labels into, so the gear always lands visually between
   * them and the price pane above, regardless of which of those two are
   * currently enabled.
   *
   * @returns `null` when there's no price-ruler strip reserved at all
   *   (`showPriceAxis`/`showCurrentPriceLine` both off) — there's no strip
   *   to center the gear within horizontally, so the caller decides what to
   *   do (e.g. keep a fixed corner position) rather than this method
   *   silently guessing a fallback x.
   */
  getGearAnchor(): { x: number; y: number } | null {
    const { showAxisArea, axisX, axisWidth, priceHeight } = this.plotLayout();
    if (!showAxisArea) return null;
    const footerHeight = this.height - priceHeight; // volumeHeight + timeAxisHeight, whichever are on
    return { x: axisX + axisWidth / 2, y: priceHeight + footerHeight / 2 };
  }

  /**
   * X positions, in CSS pixels, for the vertical time-gridlines (drawn by
   * `Grid`) and the `TimeAxis` labels below them — evenly spaced across the
   * *bar area* width (`plotLayout()`'s `barAreaWidth`), not the full plot
   * width, so these lines and labels only ever mark space a candle can
   * actually occupy. Shared by both `Grid` and `TimeAxis` (see `render()`)
   * for the same reason `plotLayout()` itself is shared: so the lines a
   * gridline draws and the labels a time-axis draws can never disagree
   * about where "this x is a tick" means.
   *
   * @param count Number of gaps between lines; there are `count + 1`
   *   positions total, including both ends of the bar area. Matches
   *   `Grid`'s own horizontal-line `lineCount` default (4, i.e. 5 lines) so
   *   the vertical and horizontal gridlines read as one consistent grid
   *   rather than two different densities.
   */
  private verticalGridXs(offsetX: number, barAreaWidth: number, count = 4): number[] {
    const xs: number[] = [];
    for (let i = 0; i <= count; i++) xs.push(offsetX + (barAreaWidth / count) * i);
    return xs;
  }

  // ---- rendering ------------------------------------------------------

  /**
   * Repaint the entire canvas from current state. Not incremental — every
   * call clears and redraws everything currently visible — which is fine
   * at the data sizes and update frequency this chart deals with (one bar
   * update at a time, not thousands of moving elements) and keeps the
   * render path simple and easy to reason about. Called automatically by
   * every method above that changes what should be on screen; there's
   * normally no need to call it directly.
   */
  render(): void {
    const { ctx, opts, width, height } = this;

    ctx.fillStyle = opts.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    if (this.candles.length === 0) return;

    // The price ruler, if shown, reserves a strip on whichever edge
    // priceAxisPosition names — everything that spans the price pane
    // horizontally below is handed plotWidth/plotOffsetX so it draws
    // within what is left over, not across the ruler (see class doc
    // comment). axisX is where the ruler itself (ticks + the
    // current-price tag) starts. barAreaWidth/timeAxisHeight/volumeHeight/
    // priceHeight are the same vertical/horizontal layout math
    // isOverPriceAxis()/defaultVisibleCount()/getGearAnchor() all read too
    // — plotLayout() is kept in one place so no boundary any of them keys
    // off can ever drift from the boundary actually drawn here.
    const { showAxisArea, axisOnLeft, plotOffsetX, plotWidth, axisX, barAreaWidth, timeAxisHeight, volumeHeight, priceHeight } =
      this.plotLayout();
    // Where the plot pane ends and the ruler strip begins - the same
    // boundary axisX/plotOffsetX already describe from each side, just
    // named for what Grid uses it for here.
    const separatorX = axisOnLeft ? plotOffsetX : axisX;

    // Candles lay out across only the bar area (barAreaWidthRatio of the
    // full plot width) — see plotLayout()'s own comment for why — while
    // everything below that isn't candles (PriceLines, CurrentPriceLine,
    // Grid's horizontal lines, the footer separator) keeps spanning the
    // full plotWidth.
    // opts.candleWidth/candleGap scaled by timeZoomFactor - see
    // zoomedCandleWidth()'s own doc comment for why every render/layout
    // call that cares about a candle's pixel geometry reads from these,
    // not the raw options, now that a manual time-zoom actually resizes
    // candles instead of just changing which indices are "in view."
    // Built by buildScales() - shared with pointFromPixel() (used by
    // setActiveDrawingTool()'s click handling) so a click is always
    // converted to (time, price) against the exact same pane geometry
    // this frame actually drew against, never a second, independently
    // computed version of it. buildScales() itself folds together
    // auto-fit, priceZoomFactor (stretches/compresses the auto-fitted
    // range around its own center - see zoomPrice()'s doc comment for
    // why scaling the *range* rather than PriceScale's own top/bottom pad
    // is what "zoom via the price axis" actually means here), and
    // pricePanOffset (shifts that range up or down bodily, including past
    // the data's own bounds - see its own doc comment) via priceRange();
    // priceAreaHeightRatio drives PriceScale's padding directly (see that
    // option's own doc comment): the visible range fills that fraction of
    // the pane, split evenly as padding above the highest price and below
    // the lowest.
    const { timeScale, priceScale } = this.buildScales();

    // Shared by Grid's vertical time-gridlines and TimeAxis's labels below
    // them, so a gridline and the label under it can never disagree about
    // where "this x is a tick" means — see verticalGridXs()'s own doc
    // comment.
    const verticalLineXs = this.verticalGridXs(plotOffsetX, barAreaWidth);

    // Everything below that plots against priceScale/timeScale - the
    // gridlines, candles, price lines, markers, indicators, and drawing
    // tools - gets clipped to exactly the price pane's own rectangle
    // before any of it draws. Without this, `pricePanOffset` (see its
    // own doc comment: deliberately unclamped, so a vertical drag can
    // push the visible range anywhere, including well past where the
    // loaded candles actually sit) had nothing stopping a candle's
    // computed y from landing below `priceHeight` and drawing straight
    // through into the volume pane, or past `plotWidth` into the price
    // ruler strip - both of those are a different pane's own space, not
    // "the chart" bleeding outside its box. Clipping means that content
    // simply stops being drawn the moment it's panned out of the price
    // pane, the same as it would if it scrolled off any other edge.
    ctx.save();
    ctx.beginPath();
    ctx.rect(plotOffsetX, 0, plotWidth, priceHeight);
    ctx.clip();

    new Grid({
      paneWidth: plotWidth,
      paneHeight: priceHeight,
      color: opts.gridColor,
      lineCount: 4,
      offsetX: plotOffsetX,
      backgroundColor: opts.gridBackgroundColor,
      verticalLineXs,
    }).draw(ctx);
    this.drawCandles(timeScale, priceScale);
    new PriceLines(this.priceLines, plotWidth, priceScale, plotOffsetX).draw(ctx);
    new Markers(this.markers, this.candles, timeScale, priceScale, this.zoomedCandleWidth()).draw(ctx);

    for (const indicator of this.indicators.filter((i) => i.pane === "main")) {
      new IndicatorLine(indicator, this.candles, this.startIndex, this.endIndex, timeScale, priceScale, this.zoomedCandleWidth()).draw(ctx);
    }

    const toPixel = this.toPixelFn(timeScale, priceScale);
    // Each drawing's own `selected` flag is set fresh here, every frame,
    // from `selectedDrawingId` - cheap to recompute and, per this file's
    // own stated philosophy elsewhere (see e.g. `getViewport()`'s doc
    // comment), leaves no separate "sync selection" step to forget or
    // get out of order with a click that changes it.
    for (const drawing of this.drawings) {
      drawing.selected = drawing.id === this.selectedDrawingId;
      drawing.draw(ctx, toPixel);
    }
    // The in-progress placement (if any) draws last, on top of every
    // already-completed drawing - its own ghost/rubber-band preview (see
    // each concrete tool's draw()) is what the user is actively looking
    // at right now.
    if (this.pendingDrawing) this.pendingDrawing.draw(ctx, toPixel);

    ctx.restore();

    // Drawn after the clipped group, not before it (a small reorder from
    // this fix - see the clip's own comment above): the volume pane is
    // its own separate vertical region entirely below `priceHeight`, so
    // it never actually overlapped price-pane content even before
    // clipping existed - this is purely about no longer needing to sit
    // *between* the candles and everything else layered on top of them.
    if (volumeHeight > 0) this.drawVolume(timeScale, priceHeight, volumeHeight);

    // The price/ruler separator no longer goes through Grid's own
    // separatorX (which drew it *inside* the clip above) - crispLine()
    // snaps it a half-pixel past the clip rectangle's own edge for crisp
    // 1px rendering (see ../utils/pixel.ts), which the clip then cut off
    // entirely, silently deleting this line the moment price-pane
    // clipping was added. It never needed clipping in the first place -
    // it marks the pane's own boundary, so drawing exactly on that
    // boundary is correct, not something to hide - the same reasoning
    // that already keeps the horizontal time-axis footer separator below
    // as its own unclipped Line rather than routed through Grid.
    if (showAxisArea) {
      const sepX = crispLine(separatorX);
      new Line(sepX, 0, sepX, priceHeight, opts.gridSeparatorColor).draw(ctx);
    }

    if (opts.showPriceAxis) {
      new PriceAxis(priceScale, priceHeight, axisX, opts.backgroundColor, opts.textColor).draw(ctx);
    }
    // The current price is the latest loaded candle's close, whether that
    // candle is still forming or has just settled — see CurrentPriceLine's
    // own doc comment for why this needs no separate live-price input.
    if (opts.showCurrentPriceLine) {
      const currentPrice = this.candles[this.candles.length - 1]?.close;
      if (currentPrice !== undefined) {
        new CurrentPriceLine(currentPrice, plotOffsetX, plotWidth, axisX, priceScale, opts.currentPriceLineColor).draw(ctx);
      }
    }

    // Where the time-axis strip begins - computed unconditionally (not
    // just inside the `showTimeAxis` block below) because Crosshair's own
    // time tag pins to this same y regardless of whether the ordinary
    // TimeAxis labels are switched on, mirroring how its price tag
    // already draws independent of `showPriceAxis` (see Crosshair's own
    // class doc comment).
    const footerSeparatorY = priceHeight + volumeHeight;

    // The footer: a horizontal separator marking where the price pane (plus
    // volume pane, if on) ends and the time-axis label strip begins, and
    // the labels themselves, positioned under the exact same x's Grid just
    // drew its vertical gridlines at (verticalLineXs) — see TimeAxis's own
    // doc comment for the label geometry, and getGearAnchor() for how a
    // settings gear is meant to sit centered in this same band.
    if (opts.showTimeAxis) {
      const sepY = crispLine(footerSeparatorY);
      new Line(plotOffsetX, sepY, plotOffsetX + plotWidth, sepY, opts.gridSeparatorColor).draw(ctx);
      new TimeAxis(this.candles, timeScale, verticalLineXs, footerSeparatorY, opts.backgroundColor, opts.textColor).draw(ctx);
    }

    if (this.crosshairPos) {
      new Crosshair(this.crosshairPos, this.candles, timeScale, priceScale, plotWidth, priceHeight, opts, plotOffsetX, axisX, footerSeparatorY).draw(ctx);
    }

    this.onRenderCallback?.();
  }

  /**
   * Builds and draws one `Bar` (candle body + wick) per candle in the
   * currently-visible index range, left to right. Called once per
   * `render()`, after `Grid` so gridlines sit behind the candles rather
   * than on top of them.
   *
   * @param timeScale Maps each candle's index to its x pixel — already
   *   built for this frame's plot width/offset by `render()`, not
   *   constructed here, so every render helper in a single frame agrees
   *   on the same coordinate mapping.
   * @param priceScale Maps each candle's OHLC prices to y pixels, likewise
   *   shared across this frame's render helpers.
   *
   * Guards `this.candles[i]` being `undefined` (`if (!c) continue`) even
   * though `i` is bounded by `this.startIndex`/`this.endIndex`, which
   * `render()` derives from `this.candles.length` — defensive rather than
   * load-bearing today, but cheap insurance against a future bug that
   * lets those two fall out of sync (e.g. a caller mutating `startIndex`/
   * `endIndex` directly instead of through `panByCandles()`/`zoom()`).
   */
  private drawCandles(timeScale: TimeScale, priceScale: PriceScale): void {
    const colors = { up: this.opts.upColor, down: this.opts.downColor };
    for (let i = this.startIndex; i <= this.endIndex; i++) {
      const c = this.candles[i];
      if (!c) continue;
      const x = timeScale.indexToX(i);
      new Bar(c, x, this.zoomedCandleWidth(), priceScale, colors).draw(this.ctx);
    }
  }

  /**
   * Draws the volume pane: one `VolumeBar` per visible candle, each
   * bar's height scaled proportionally against the single largest volume
   * in the currently-visible range. Two passes over the same index range
   * by design, not an oversight — the scale (`maxVol`) has to be known
   * *before* any bar can be drawn to it, so the first pass only measures
   * (see `VolumeBar`'s own doc comment for why it takes a pre-computed
   * `maxVolume` rather than finding it itself: a bar shouldn't need to
   * see its siblings to know how tall it is).
   *
   * @param timeScale Maps each candle's index to its x pixel — the same instance `drawCandles()` used this frame.
   * @param priceHeight Height of the price pane, in CSS pixels — where the volume pane starts (`y = 0` for a `VolumeBar` is the top of *its own* pane, not the canvas, so this is passed through only for the caller's bookkeeping, not used directly here).
   * @param volumeHeight Height reserved for the volume pane, in CSS pixels — every `VolumeBar` scales its own height against this.
   *
   * Bails out early (`if (maxVol === 0) return`) rather than drawing
   * zero-height bars when every visible candle happens to have zero
   * volume (e.g. synthetic/sample data that doesn't model it) — an empty
   * pane reads more honestly than a row of invisible bars that *look*
   * like a bug.
   */
  private drawVolume(timeScale: TimeScale, priceHeight: number, volumeHeight: number): void {
    let maxVol = 0;
    for (let i = this.startIndex; i <= this.endIndex; i++) {
      const v = this.candles[i]?.volume ?? 0;
      if (v > maxVol) maxVol = v;
    }
    if (maxVol === 0) return;

    const colors = { up: this.opts.upColor, down: this.opts.downColor };
    for (let i = this.startIndex; i <= this.endIndex; i++) {
      const c = this.candles[i];
      if (!c) continue;
      const x = timeScale.indexToX(i);
      new VolumeBar(c, x, this.zoomedCandleWidth(), priceHeight, volumeHeight, maxVol, colors).draw(this.ctx);
    }
  }

  /**
   * Computes how many candles the initial visible window in `setData()`
   * should show — the last N candles that fill the *bar area* (see
   * `plotLayout()`'s `barAreaWidth` — already narrower than the full plot
   * width by `barAreaWidthRatio`, leaving the same trailing margin a
   * freshly-loaded chart's window respects from the start) at this
   * chart's configured candle width/gap, so a freshly-loaded chart opens
   * with the bar area already full rather than showing a handful of bars
   * bunched at one edge.
   *
   * @returns The candle count, floored at 20 so a very narrow canvas
   *   (or a canvas the caller hasn't sized yet) doesn't ask for a
   *   near-empty or zero/negative-width window.
   *
   * Calls `plotLayout()` fresh rather than reading a cached value, because
   * this only runs once per `setData()` call — recomputing it here isn't
   * worth adding a field just to avoid it, and it keeps this method
   * correct even if `ChartOptions` changes between `setData()` calls.
   *
   * Deliberately reads the *configured* `candleWidth`/`candleGap`, not
   * `zoomedCandleWidth()`/`zoomedStep()` — this is "how many candles a
   * fresh, unzoomed chart should open showing," the same question
   * whether or not the user happens to have zoomed a previous session's
   * chart; `applyUpdate()`'s "steady state" branch is what actually
   * preserves an in-progress manual zoom as new bars arrive (it reuses
   * the current window's own width, not this). `zoom()` has its own
   * zoomed counterpart, `visibleCountAtZoom()`, for that.
   */
  private defaultVisibleCount(): number {
    const { barAreaWidth } = this.plotLayout();
    return Math.max(20, Math.floor(barAreaWidth / (this.opts.candleWidth + this.opts.candleGap)));
  }

  /**
   * Release event listeners. Call this on teardown (e.g. a React
   * component's useEffect cleanup) — the canvas holds no other resources,
   * but skipping this leaks a closure per listener `attachInteraction()`
   * registered, for as long as the canvas element is retained — and, for
   * the one listener on `window` rather than the canvas
   * (`handleMouseUp` — see its own doc comment for why), for as long as
   * `window` itself is, which is a much longer-lived leak than the
   * canvas-scoped ones.
   */
  destroy(): void {
    this.canvas.removeEventListener("mousemove", this.handleMouseMove);
    this.canvas.removeEventListener("mouseleave", this.handleMouseLeave);
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.canvas.removeEventListener("dblclick", this.handleDoubleClick);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    if (typeof window !== "undefined") {
      window.removeEventListener("mouseup", this.handleMouseUp);
      window.removeEventListener("keydown", this.handleKeyDown);
    }
  }

  /**
   * The CSS cursor to show for a given drag mode (or `null` when
   * hovering, not dragging) at a given pointer position — `ns-resize`
   * over the price-ruler strip, `ew-resize` over the time-axis label
   * strip, over the chart's actual content (the price and volume panes):
   * `crosshair` while just hovering (nothing locked in yet, same cursor a
   * drawing tool shows over the price pane — see `handleMouseMove`'s own
   * "while a drawing tool is active" branch above — so the pan/cross
   * region reads as "precise pointer, click to act" whether or not a
   * tool happens to be selected), `grabbing` once an actual `"pan"` drag
   * is in progress. `mode` being `null` vs already resolved is the one
   * thing this depends on for that hover-vs-dragging distinction —
   * everything else about a hovering pointer and a locked-in drag reads
   * identically, region-wise.
   *
   * Shared by `handleMouseMove` for both cases: pass `this.dragMode` for
   * the locked-in mid-drag cursor, or `null` for the hover cursor, which
   * re-derives the region from `x`/`y` the same way `handleMouseDown`
   * would if a drag started right now — so hovering always previews
   * exactly what a click-drag there would do.
   */
  private cursorFor(mode: "price" | "time" | "pan" | null, x: number, y: number): string {
    const resolved = mode ?? (this.isOverPriceAxis(x) ? "price" : this.isOverTimeAxis(x, y) ? "time" : "pan");
    if (resolved === "price") return "ns-resize";
    if (resolved === "time") return "ew-resize";
    return mode === "pan" ? "grabbing" : "crosshair";
  }

  /**
   * `mousemove` handler: converts to canvas-relative CSS pixels and, when
   * `isOverPricePane()` says the pointer is actually over the price/candle
   * pane, stores them as `crosshairPos` — so `Crosshair` (rebuilt fresh
   * inside `render()` from whatever `crosshairPos` currently holds) picks
   * up the new position; anywhere else (either axis strip, or the volume
   * pane — see `isOverPricePane()`'s own doc comment for why all three are
   * excluded) it's cleared to `null` instead, the same as `handleMouseLeave`
   * does when the pointer leaves the canvas entirely, so the crosshair
   * simply isn't drawn there rather than showing a stale or meaningless
   * readout. This is purely position-based, re-evaluated every move
   * regardless of `dragMode` — a pan drag that wanders onto the price axis
   * (see the "keeps panning" test) still keeps panning, but the crosshair
   * still disappears the moment it crosses that boundary, same as a
   * hovering (non-dragging) pointer would.
   *
   * While a drag is in progress (`dragMode` set by `handleMouseDown`),
   * this also advances whichever of the three gestures (`"price"`/`"time"`
   * zoom, or `"pan"`) the drag started as. Also keeps `canvas.style.cursor`
   * in sync via `cursorFor()`, so the cursor never suggests a gesture
   * different from what a click there would actually do — a vertical
   * double-arrow over the price ruler, a horizontal one over the
   * time-axis strip, a crosshair (turning into a grabbing hand once the
   * drag actually starts) over the chart's content.
   *
   * `"price"`/`"time"` zoom exponentially in the raw pixel delta
   * (`Math.exp(delta * DRAG_ZOOM_SENSITIVITY)`) rather than linearly, for
   * the same reason compounding *factors* rather than adding to a single
   * `zoom`/`zoomPrice` call every frame does: a factor near 1 per pixel
   * of movement, compounded over however many pixels the drag covers,
   * gives a smooth continuous feel regardless of how fast the pointer
   * moves, without the runaway growth (or collapse) a linear-in-pixels
   * factor would produce over a long drag. Sign conventions (matching
   * common charting-platform behavior): dragging *up* the price axis or
   * *right* along the time-axis strip zooms in (stretches candles taller
   * / wider); the opposite direction zooms out.
   *
   * `"pan"` moves in both directions at once, each linear and
   * anchor-based rather than incremental — see `panDragStartIndex`'s own
   * doc comment for why — converting the *total* pixel distance from
   * where the drag started into, horizontally, a candle count via the
   * same `candleWidth + candleGap` step `TimeScale` uses, then asking
   * `panByCandles()` for exactly the delta needed to reach that
   * anchor-relative target from wherever `startIndex` currently is
   * (letting it do the actual clamping, rather than duplicating that
   * logic here); and vertically, a price delta via the pane's current
   * price-per-pixel ratio, assigned straight to `pricePanOffset` (see
   * that branch's own comment for why not through `panPrice()`).
   * Dragging right — content follows the pointer, like scrolling a page
   * — reveals *earlier* history (decreases `startIndex`), the opposite
   * sign from a `"time"` zoom's `deltaX`, which stretches bars rather
   * than moving them. Dragging *down*, the same "content follows the
   * pointer" way, reveals *higher* prices (see `pricePanOffset`'s own
   * doc comment) — unlike the horizontal half, this has no data bounds
   * to clamp to, so it can pan into empty space above/below every
   * candle on purpose.
   *
   * Whichever of the three a drag is doing, it's fixed by which region
   * `handleMouseDown` saw it *start* in — never reconsidered mid-drag,
   * even if the pointer wanders into a different region, so a single
   * gesture can't accidentally switch what it's doing partway through.
   *
   * @param e The native `mousemove` event.
   *
   * `getBoundingClientRect()` is called on every move rather than cached,
   * which is the correct trade-off here even though it costs a reflow
   * query per event: caching it would go stale the moment the canvas's
   * position on the page changes (page scroll, a resize elsewhere in the
   * layout, …), silently mis-locating the crosshair until the next
   * resize. A class field arrow function (not a prototype method) so
   * `this` stays bound when passed directly to `addEventListener` —
   * see `attachInteraction()`/`destroy()`, which add/remove this exact
   * function reference.
   */
  private handleMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // While a drawing tool is active, hovering does two things instead
    // of the usual hover-cursor/drag logic below (which this returns
    // before ever reaching): shows a precise "crosshair" cursor rather
    // than whatever cursorFor()'s pan/zoom hand/resize logic would pick
    // (a trader placing a line needs to see exactly which pixel a click
    // will land on), and feeds the in-progress drawing's own
    // setPreviewPoint() so its draw() can render a live ghost/rubber-band
    // preview of where the next click would land (see
    // BaseDrawingTool.previewPoint's own doc comment). crosshairPos is
    // still kept live too, same as with no tool active, so the existing
    // OHLC/price readout keeps working alongside a drawing tool - one
    // more way to see exactly where a point will land.
    if (this.activeDrawingToolName) {
      const overPricePane = this.isOverPricePane(x, y);
      this.canvas.style.cursor = overPricePane ? "crosshair" : "default";
      this.crosshairPos = overPricePane ? { x, y } : null;
      this.pendingDrawing?.setPreviewPoint(overPricePane ? this.pointFromPixel(x, y) : null);
      this.render();
      return;
    }

    this.crosshairPos = this.isOverPricePane(x, y) ? { x, y } : null;

    // Mid-drag, the cursor reflects the mode the drag locked onto
    // (`dragMode`), not whatever the pointer happens to be over right
    // now — matching the same "locked for the gesture's duration" rule
    // zoomPrice()/zoom()/panByCandles() already follow below.
    this.canvas.style.cursor = this.cursorFor(this.dragMode, x, y);

    if (this.dragMode === "price") {
      const deltaY = y - this.lastDragCoord;
      this.lastDragCoord = y;
      this.zoomPrice(Math.exp(deltaY * DRAG_ZOOM_SENSITIVITY)); // re-renders, picking up crosshairPos too
      return;
    }
    if (this.dragMode === "time") {
      const deltaX = x - this.lastDragCoord;
      this.lastDragCoord = x;
      this.zoom(Math.exp(-deltaX * DRAG_ZOOM_SENSITIVITY)); // re-renders, picking up crosshairPos too
      return;
    }
    if (this.dragMode === "pan") {
      // Vertical: shift pricePanOffset by the "content follows the
      // pointer" model panByCandles() already uses horizontally - the
      // price that was under the pointer at mousedown stays under the
      // pointer as it moves. Dragging *down* therefore reveals *higher*
      // prices (see pricePanOffset's own doc comment): the pane's
      // current price-per-pixel ratio (from priceRange(), the same
      // range PriceScale itself was just built from) converts the total
      // vertical drag distance from mousedown into a price delta, added
      // to whatever pricePanOffset was at that anchor. Anchor-based
      // (recomputed fresh from panDragStartY/priceOffsetDragStart every
      // move, mirroring panDragStartIndex/lastDragCoord's own reasoning
      // just below) purely for symmetry with the horizontal half of
      // this same branch - there's no clamping here to protect from
      // drift the way that reasoning originally existed for.
      //
      // Assigned directly rather than via panPrice() (which re-renders
      // on its own) - panByCandles() right below performs this move's
      // one and only render, and reads pricePanOffset fresh each call,
      // so setting it first here means a single mousemove still produces
      // exactly one render, reflecting both axes' movement together.
      const { priceHeight } = this.plotLayout();
      const { minPrice, maxPrice } = this.priceRange();
      const pricePerPixel = (maxPrice - minPrice) / (priceHeight || 1);
      this.pricePanOffset = this.priceOffsetDragStart + (y - this.panDragStartY) * pricePerPixel;

      // zoomedStep(), not the raw candleWidth+candleGap - a pixel drag
      // should move the same number of candles the pointer visually
      // passed over, and how many pixels one candle occupies now depends
      // on the current time-zoom level (see zoomedCandleWidth()'s own
      // doc comment).
      const step = this.zoomedStep();
      const deltaCandles = Math.round((x - this.lastDragCoord) / step);
      this.panByCandles(this.panDragStartIndex - deltaCandles - this.startIndex); // re-renders, picking up crosshairPos + the price pan set above too
      return;
    }

    this.render();
  };

  /**
   * `mouseleave` handler: clears `crosshairPos`, resets `canvas.style.cursor`
   * back to the browser default, and re-renders, so the crosshair (guide
   * lines, ruler price tag, OHLC readout) and the zoom-region resize cursor
   * `handleMouseMove` sets both disappear the instant the pointer leaves
   * the canvas rather than freezing at their last state. Takes no event
   * parameter — nothing about *where* the pointer left matters, only that
   * it did.
   *
   * Deliberately does *not* end an in-progress drag (zoom or pan) —
   * `handleMouseUp` is registered on `window`, not the canvas (see
   * `attachInteraction()`), specifically so a drag that wanders off the
   * canvas edge and back keeps going instead of getting cut off the
   * instant the pointer crosses the boundary. The cursor still resets
   * here regardless, since CSS cursors don't follow the pointer
   * off-element the way the drag itself needs to.
   */
  private handleMouseLeave = (): void => {
    this.crosshairPos = null;
    this.pendingDrawing?.setPreviewPoint(null);
    this.canvas.style.cursor = "";
    this.render();
  };

  /**
   * `mousedown` handler: first checks whether a `DrawingTool` is active
   * (see `setActiveDrawingTool()`'s own doc comment) - if so, and the
   * click landed over the price pane, this places a point on it via
   * `pointFromPixel()` and returns immediately, WITHOUT falling through
   * to the drag-mode routing below at all. That's deliberate, not an
   * oversight: letting a click both place a point *and* start a
   * pan/zoom drag would mean every attempt to click a specific candle
   * precisely could also nudge the chart out from under the pointer -
   * exactly what a drawing tool's user needs not to happen. Select the
   * "cross" tool (`setActiveDrawingTool(null)`) to get pan/zoom dragging
   * back; a click outside the price pane while a tool is active (e.g. on
   * either axis strip) is likewise a no-op rather than falling through
   * to that axis's own zoom-drag, for the same reason.
   *
   * With no active tool, this instead records which of the three
   * gestures a drag should perform, based on which region it *started*
   * in — `isOverPriceAxis()`/`isOverTimeAxis()` decide between `"price"`
   * (the price-ruler strip), `"time"` (the time-axis label strip), and
   * `"pan"` (everywhere else, i.e. the chart's actual content: the price
   * and volume panes) — and the starting coordinate(s) `handleMouseMove`
   * reads from for the drag's first step (see `lastDragCoord`'s and
   * `panDragStartIndex`'s own doc comments for how each mode uses them
   * differently). `preventDefault()` avoids the browser's own
   * drag/text-selection affordances kicking in over the canvas
   * mid-gesture, in either case.
   *
   * @param e The native `mousedown` event.
   */
  private handleMouseDown = (e: MouseEvent): void => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.activeDrawingToolName) {
      if (this.pendingDrawing && this.isOverPricePane(x, y)) {
        const point = this.pointFromPixel(x, y);
        if (point) {
          this.pendingDrawing.addPoint(point);
          if (this.pendingDrawing.isComplete()) {
            // Placement finished: this instance joins the permanent
            // drawings list (see its own doc comment) and a brand-new
            // instance of the same tool type takes over as the pending
            // one, ready for the next placement - the reason the same
            // tool stays selected click after click and each click
            // starts an independent new line rather than editing the
            // one just finished.
            this.drawings.push(this.pendingDrawing);
            this.pendingDrawing = createDrawingTool(this.activeDrawingToolName);
          }
          this.render();
        }
      }
      return;
    }

    // "cross" tool: a click over the price pane first checks whether it
    // landed on an already-placed drawing (hitTestDrawings()) - if so,
    // select it (for Delete/Backspace or deleteSelectedDrawing(), see
    // attachInteraction()/handleKeyDown) instead of starting a pan drag,
    // so picking a specific line to delete doesn't also nudge the chart
    // out from under the click. A miss instead clears any existing
    // selection and falls through to the normal three-region drag
    // routing below, same as it always has.
    if (this.isOverPricePane(x, y)) {
      const hit = this.hitTestDrawings(x, y);
      if (hit) {
        this.selectedDrawingId = hit.id;
        this.render();
        return;
      }
      if (this.selectedDrawingId !== null) {
        this.selectedDrawingId = null;
        this.render();
      }
    }

    if (this.isOverPriceAxis(x)) {
      this.dragMode = "price";
      this.lastDragCoord = y;
    } else if (this.isOverTimeAxis(x, y)) {
      this.dragMode = "time";
      this.lastDragCoord = x;
    } else {
      this.dragMode = "pan";
      this.lastDragCoord = x;
      this.panDragStartIndex = this.startIndex;
      // Vertical anchor pair for the price pan handleMouseMove's "pan"
      // branch does alongside the horizontal one above - see
      // panDragStartY's own doc comment for why x and y need separate
      // anchors here.
      this.panDragStartY = y;
      this.priceOffsetDragStart = this.pricePanOffset;
    }
  };

  /**
   * `dblclick` handler: finishes a multi-point tool's in-progress
   * placement (currently only `TraceLine` defines `finish()` - see
   * `DrawingTool.finish`'s own doc comment) - a no-op whenever no such
   * placement is pending, so this never interferes with
   * HorizontalLine/VerticalLine/Trendline (which complete on their own
   * fixed point count) or plain "cross"-tool navigation.
   *
   * A double-click is two `mousedown`s in quick succession, and
   * `handleMouseDown` above already feeds *every* one of those into
   * `pendingDrawing.addPoint()` independently - so by the time this
   * fires, the second click's own point has already been pushed,
   * sitting right on top of (or a pixel or two from) the point the
   * first click of the pair placed. Popping it here before calling
   * `finish()` is what makes the trace end exactly where the user
   * double-clicked instead of carrying that near-duplicate point along
   * with it.
   */
  private handleDoubleClick = (e: MouseEvent): void => {
    if (!this.pendingDrawing?.finish) return;
    e.preventDefault();
    if (this.pendingDrawing.points.length > 0) this.pendingDrawing.points.pop();
    this.finishPendingDrawing();
    this.render();
  };

  /**
   * `contextmenu` handler: the right-click (or, on most trackpads, a
   * two-finger click - browsers already report that gesture as this
   * same event, so no separate touch handling is needed) counterpart to
   * `handleDoubleClick` above, finishing a multi-point tool's
   * in-progress placement. Unlike a double-click, only one `mousedown`
   * precedes a right-click, so there's no duplicate point to drop here
   * - the point that same click already placed becomes the trace's
   * final point as-is.
   *
   * `preventDefault()`s the native context menu, but only once it's
   * confirmed there's actually a finishable placement pending - a
   * right-click with no drawing tool active (or one whose tool doesn't
   * define `finish()`) still gets the browser's own context menu,
   * unchanged from before this handler existed.
   */
  private handleContextMenu = (e: MouseEvent): void => {
    if (!this.pendingDrawing?.finish) return;
    e.preventDefault();
    this.finishPendingDrawing();
    this.render();
  };

  /**
   * Shared completion step for both handlers above: calls the pending
   * drawing's `finish()` (a no-op if it doesn't define one, or if
   * `finish()` itself declines - e.g. `TraceLine` needs at least 2
   * points, see its own doc comment) and, only if that actually left it
   * `isComplete()`, commits it into `drawings` and starts a fresh
   * instance for the next placement - the same "push, then replace
   * pendingDrawing" step `handleMouseDown`'s own per-click completion
   * path does. Deliberately doesn't call `render()` itself (both callers
   * already do, once, after whatever else they changed - e.g.
   * `handleDoubleClick`'s point pop needs to be visible even on the
   * rare call where `finish()` didn't complete anything).
   */
  private finishPendingDrawing(): void {
    if (!this.activeDrawingToolName || !this.pendingDrawing?.finish) return;
    this.pendingDrawing.finish();
    if (!this.pendingDrawing.isComplete()) return;
    this.drawings.push(this.pendingDrawing);
    this.pendingDrawing = createDrawingTool(this.activeDrawingToolName);
  }

  /**
   * `mouseup` handler: ends whatever drag gesture (zoom or pan) is in
   * progress, if any. Registered on `window` rather than the canvas (see
   * `attachInteraction()`) so releasing the mouse after dragging off the
   * canvas still ends the drag — a canvas-only listener would never fire
   * in that case, leaving `dragMode` stuck set and the chart still
   * zooming/panning on every future mousemove anywhere on the canvas.
   */
  private handleMouseUp = (): void => {
    this.dragMode = null;
  };

  /**
   * `wheel` handler: routes each wheel/trackpad event to zoom or pan
   * depending on both *where* the pointer is and *what shape* the event
   * is. Over either axis strip (`isOverPriceAxis()`/`isOverTimeAxis()`)
   * this always zooms, same as before — there's no sensible "pan" for a
   * ruler strip itself. Over the chart's actual content (the price and
   * volume panes — the same region a click-drag pans, see
   * `handleMouseDown`'s three-region routing), the event's *shape*
   * decides: a real mouse wheel only ever reports `deltaY` (`deltaX` is
   * always 0), while a trackpad's two-finger swipe — the gesture a
   * trackpad user reaches for to "grab and drag the chart" — arrives as
   * `wheel` events too, not `mousedown`/`mousemove`, with `deltaX`
   * dominant for a horizontal swipe. So a horizontally-dominant event
   * here is treated as that swipe and panned (see `panByCandles()`
   * below); a vertically-dominant one is a real scroll-wheel tick and
   * zooms, exactly as before. Without this split, every trackpad swipe
   * over the chart body got forced through `zoom()` regardless of
   * direction — the cursor still correctly showed the pan/grab hint
   * (`cursorFor()` only reflects *hover* position, not how the next
   * gesture arrives), which is what made this look like "cursor says
   * drag, chart zooms anyway" rather than a scroll-direction bug.
   *
   * Panning here uses the *opposite* sign convention from
   * `handleMouseMove`'s `"pan"` branch: a click-drag is "grab the
   * content and move it with your hand" (dragging right reveals earlier
   * history — see `panByCandles()`'s own doc comment), but a scroll
   * gesture conventionally moves the *viewport* in the scrolled
   * direction instead, the same way scrolling right through any
   * horizontally-scrollable view (a spreadsheet, a timeline) advances
   * toward later content — so `deltaX > 0` here increases `startIndex`
   * directly, with no inversion.
   *
   * The zoom factor (`1.1`/`0.9`) is a fixed ~10% step per wheel tick
   * rather than scaled by `e.deltaY`'s magnitude, since that magnitude
   * varies wildly across input devices in ways that don't map cleanly to
   * "how much should this chart zoom" — the pan branch has the same
   * problem in reverse (a trackpad's per-event `deltaX` varies with
   * swipe speed), but there rounding to whole candles via `zoomedStep()`
   * naturally absorbs that the same way a click-drag's per-pixel delta
   * does.
   *
   * @param e The native `wheel` event.
   *
   * Calls `e.preventDefault()` first so the browser doesn't also scroll
   * the page underneath the chart while the pointer is over it — without
   * this, zooming/panning the chart and scrolling the page fight over
   * the same gesture. Requires this listener to be registered
   * non-passive (see `attachInteraction()`'s `{ passive: false }`): a
   * passive listener is explicitly forbidden from calling
   * `preventDefault()`, so the two only work together.
   */
  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.isOverPriceAxis(x)) {
      this.zoomPrice(e.deltaY > 0 ? 1.1 : 0.9);
      return;
    }
    if (this.isOverTimeAxis(x, y)) {
      this.zoom(e.deltaY > 0 ? 1.1 : 0.9);
      return;
    }

    // Chart body / volume pane: a horizontally-dominant event is a
    // trackpad swipe standing in for a pan-drag (see this method's own
    // doc comment for why deltaX is what distinguishes that from a
    // vertical mouse-wheel scroll here); a nonzero deltaCandles guard
    // avoids panByCandles() re-rendering on a swipe too small to move
    // even one candle.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const deltaCandles = Math.round(e.deltaX / this.zoomedStep());
      if (deltaCandles !== 0) this.panByCandles(deltaCandles);
      return;
    }

    this.zoom(e.deltaY > 0 ? 1.1 : 0.9);
  };

  /**
   * Registers the DOM listeners this class needs — `mousemove`/
   * `mouseleave` on the canvas for the crosshair and drag gestures,
   * `mousedown` on the canvas to start one (zoom or pan, per
   * `handleMouseDown`'s three-region routing), `wheel` on the canvas for
   * wheel-zoom, and `mouseup` on `window` (not the canvas — see
   * `handleMouseUp`'s own doc comment) to end a drag wherever the
   * pointer happens to be released. Called exactly once, from the
   * constructor.
   *
   * Registering `wheel` with `{ passive: false }` is what lets
   * `handleWheel()` call `e.preventDefault()` at all — browsers default
   * wheel listeners to passive (for scroll-performance reasons) unless
   * told otherwise, and a passive listener that calls `preventDefault()`
   * has that call silently ignored rather than erroring, which would be a
   * much more confusing bug to track down than this one extra option
   * here.
   *
   * `window` is guarded the same way `applyPixelRatio()` guards it — this
   * class shouldn't blow up if constructed somewhere `window` isn't
   * defined (a server-side render, or this library's own Jest test
   * environment — see `ChartCore.test.ts`'s class doc comment).
   *
   * Every listener added here is removed in `destroy()`, by reference
   * (the class-field arrow functions above, not a rebound copy) — that
   * pairing is why those handlers are field arrow functions and not
   * ordinary prototype methods: `this.handleMouseMove` has to be the
   * *same* function object on both the `addEventListener` and
   * `removeEventListener` call, or the removal silently no-ops and leaks
   * the listener.
   */
  private attachInteraction(): void {
    this.canvas.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("mouseleave", this.handleMouseLeave);
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.canvas.addEventListener("dblclick", this.handleDoubleClick);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    if (typeof window !== "undefined") {
      window.addEventListener("mouseup", this.handleMouseUp);
      window.addEventListener("keydown", this.handleKeyDown);
    }
  }

  /**
   * `keydown` handler, registered on `window` (like `handleMouseUp` -
   * see `attachInteraction()`'s own doc comment for why a canvas-only
   * listener wouldn't be enough): Delete or Backspace removes whichever
   * placed drawing is currently selected, via `deleteSelectedDrawing()`
   * (see its own doc comment) - a no-op if nothing's selected. Ignored
   * whenever the event's own target is a text-input-ish element (an
   * `<input>`, `<textarea>`, or anything `contentEditable`) so deleting
   * text in, say, a consumer's date picker doesn't also delete a
   * selected drawing on the chart behind it - a window-level listener
   * sees every keydown on the page, not just ones aimed at the canvas.
   */
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    this.deleteSelectedDrawing();
  };
}

/** Per-pixel exponent for drag-to-zoom (`ChartCore.handleMouseMove`) — chosen so one wheel tick's ~10% step (`ln(1.1) ≈ 0.0953`) corresponds to roughly 20px of drag movement, a distance that reads as a deliberate, controllable gesture rather than either a hair-trigger or a wrist workout. */
const DRAG_ZOOM_SENSITIVITY = 0.005;

/** Extra vertical hit-test tolerance (CSS px) `isOverTimeAxis()` grants above the time-axis label strip's own drawn height — see that method's own doc comment for why a thin 24px-default strip needs this to be reliably grabbable. */
const TIME_AXIS_HIT_SLOP = 10;

/** Restrict `value` to the closed range `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
