# trading-charter-app-library

Custom Canvas-2D charting engine for the Market Replay Trainer. Built in-house
instead of adopting TradingView Lightweight Charts or DXcharts Lite — see
`docs/implementation-plan.md` §3.2–§3.5 in the parent project for the full
reasoning. Short version: both free libraries gate drawing tools, indicators,
and replay behind a paid tier or don't offer them at all, and that's exactly
what our own roadmap already needs to build — so there's little value in
depending on either, and DXcharts Lite's MPL-2.0 license is a real constraint
if we want this fully proprietary.

## Architecture

Two design principles run through this codebase, both aimed at the same
goal: staying comfortable to extend and easy for someone outside this repo
to pick up, since a "flight simulator for traders" is only as good as how
fast we can add the next overlay or indicator to it.

**Inheritance for shapes that share real behavior.** `src/core/shapes/`
holds a small object hierarchy: `Shape` (abstract — every drawable
primitive has a `color` and a `draw(ctx)`) → `Rectangle` and `Line` (the
two kinds of thing this chart ever fills or strokes, each handling its own
pixel-snapping) → `Bar` (extends `Rectangle` — a candle body *is* a
rectangle, plus a `Wick`) and `VolumeBar` (extends `Rectangle` — a volume
bar is a rectangle, no wick) and `Wick` (extends `Line` — always vertical,
always a hairline). Each level only adds what's actually different at that
level; nothing is subclassed just to have a hierarchy. See each file's own
doc comment for the specific reasoning.

**More shape primitives for the pieces that repeat across render objects.**
`Grid`, `PriceLines`, and `Crosshair` all turned out to be built from the same
two ingredients — a straight line and a small text badge — so
`src/core/shapes/` also holds `DashedLine` (extends `Line` — a dashed stroke
is a `Line` with `setLineDash` around it, nothing else differs) and `Label`
(extends `Rectangle` — a background rect that also draws text, sizing itself
to that text via `ctx.measureText`). The same thing happened again for
markers and the indicator line, just with a different pair of ingredients:
`Triangle` (a generic filled 3-point shape, `Shape`'s third direct
subclass alongside `Rectangle`/`Line` — for the one chart element that's
neither a box nor a straight line) and `Polyline` (`Line`'s multi-point
sibling — an open stroked path through however many points an indicator
series needs, rather than exactly two). `MarkerTriangle` (extends
`Triangle`) resolves an entry/exit marker's three points and color from
just a `kind` and a tip position, the same "subclass resolves its own
geometry, base class just draws" split `Wick`/`Bar` already use one level
up with `Line`/`Rectangle`.

**Every render object is a class, none a bare function.** `Grid`,
`PriceLines`, `PriceAxis`, `CurrentPriceLine`, `Crosshair`, `Markers`, and
`IndicatorLine` (one file each, matching name, in `src/core/`) are all
cheap value objects rebuilt fresh every `render()`/mousemove call from the
shape primitives above — geometry resolved once in the constructor,
`draw(ctx)` just replays what got built. `ChartCore.render()` calls each
one's `draw()` in sequence, which keeps that file a short, readable list of
*what* renders and in what order, while *how* each piece renders lives in
its own well-documented, independently unit-testable file (hand it a mock
`CanvasRenderingContext2D` and assert what got drawn — no real `<canvas>`
or running chart needed). Earlier versions of `Markers`/`IndicatorLine`
were plain functions on the reasoning that they had no shape-like geometry
worth reusing; introducing `Triangle`/`Polyline` removed that reasoning; a
render helper here becomes a class once — and only once — there's a real
`Shape` primitive underneath it to build from, not on principle.

**A shared base class one level up, for the two axes that turned out
identical.** `PriceAxis` and `TimeAxis` both resolve a column/row of tick
`Label`s in their own constructor (each from completely different
geometry — one from a `PriceScale`, the other from candle x's and a
`TimeScale`) and then just replay them in `draw()`. That replay step was
byte-for-byte the same in both, so `src/core/AxisLabels.ts` factors it out
into an abstract base (`protected readonly ticks: Label[]`, one `draw()`)
that both extend — the same "subclass resolves its own geometry, base
class just draws" split `Wick`/`Bar` and `MarkerTriangle`/`Triangle` use,
applied one level up from shape primitives to axis-shaped render objects.
`Grid`/`PriceLines`/`Markers` deliberately don't extend it: none of them
is a column of independently-labeled ticks, so there'd be nothing to
share.

Every exported class, method, and function in `src/` carries a doc comment
explaining what it does and, where it isn't obvious, why — the intent is
that this library could be read, extended, or open-sourced by someone who
wasn't in the room when it was built.

## Status: v1 scaffold

This is the initial scaffold for the feature set scoped in the plan's §3.4,
not a finished library. What's here and working:

- [x] Candlestick + volume rendering on Canvas 2D (`src/core/ChartCore.ts`), drawn via
      the `Bar`/`VolumeBar` shape classes (`src/core/shapes/`) so pixel-snapping and
      draw logic live in one place per shape, not repeated inline
- [x] devicePixelRatio-aware canvas sizing + pixel-snapped bar/wick/grid coordinates
      (`src/utils/pixel.ts`) — renders sharp on Retina displays and stays sharp when a
      screenshot is zoomed in, instead of the soft/blurry look a naive canvas gives you.
      Lives in `src/utils/` rather than `src/core/` since it's generic canvas-coordinate
      math with nothing chart-domain-specific about it (see Architecture above)
- [x] An object hierarchy for drawable primitives (`Shape` → `Rectangle`/`Line` →
      `Bar`/`VolumeBar`/`Wick`, see Architecture above) instead of each shape hand-rolling
      its own canvas calls
- [x] Time/price scale math and zoom on both axes, plus panning - wheel
      zooms over either axis strip (price ruler strip zooms price,
      everywhere else over an axis zooms time, decided by
      `isOverPriceAxis()`); a click-drag instead routes
      into three regions, decided once at mousedown and never reconsidered
      mid-drag even if the pointer wanders into a different region: over
      the price-ruler strip stretches the price scale
      (`ChartCore.zoomPrice()`), over the time-axis label strip stretches
      the time scale (`ChartCore.zoom()`, `isOverTimeAxis()`) - "fat or
      skinny bars," never the chart's actual content - and everywhere else
      (the price + volume panes, i.e. the chart body) pans the visible
      window instead, same width, via the previously-unwired
      `ChartCore.panByCandles()` (linear, anchor-based math rather than
      the axes' exponential zoom - see `handleMouseMove`'s own doc comment
      for why). The canvas cursor mirrors the same three-way routing
      (`ns-resize` price / `ew-resize` time / `grab`-`grabbing` pan),
      locked to whichever region a drag started in, so hovering always
      previews exactly what a click-drag there would do.
      `ChartCore.getViewport()` exposes the resulting `{startIndex,
      endIndex, minPrice, maxPrice}` read-only, for a consumer (or a test)
      that wants to observe pan/zoom state without scraping draw calls.
      `isOverTimeAxis()` also grants a few pixels of hit-slop
      (`TIME_AXIS_HIT_SLOP`) above the strip's own drawn edge, purely on
      the hit-test - the strip stays exactly as tall as it's drawn -
      since its 24px default is a sliver next to the price-ruler strip's
      64px, and a drag genuinely aimed at it easily starts a few pixels
      short and lands on "pan" instead without the tolerance.
- [x] Wheel-driven panning for trackpad swipes: `handleWheel` used to
      zoom unconditionally over the chart body (the region a click-drag
      pans - see the panning bullet above), on the reasoning that "there's
      no wheel to pan gesture." That's true for a mouse wheel (`deltaX`
      always 0), but false for a trackpad's two-finger horizontal swipe -
      the gesture users actually reach for to "grab and drag the chart" -
      which the browser also delivers as `wheel` events, with `deltaX`
      dominant. Every such swipe over the chart body was getting forced
      through `zoom()`, which looked like "the cursor shows the pan/grab
      hint, but the action is a zoom" - the hint wasn't wrong, since
      `cursorFor()` only reflects hover position; the wheel handler just
      never distinguished a scroll tick from a swipe once the pointer was
      past the axis strips. Fixed by comparing `|deltaX|` vs `|deltaY|`
      over the chart body only: a horizontally-dominant event pans
      (`panByCandles()`, same `zoomedStep()` candle-count conversion the
      pan drag uses), a vertically-dominant one still zooms exactly as
      before. Over either axis strip, wheel still always zooms - a
      ruler strip has no sensible "pan." One sign subtlety: wheel-pan
      does *not* invert the way a drag-pan does (`deltaX > 0` panning
      *forward*, not back) - a scroll gesture conventionally moves the
      viewport in the scrolled direction (scroll right → later content),
      where a drag is "grab the content and move it with your hand"
      (drag right → earlier content) - see `handleWheel`'s own doc
      comment for the full reasoning.
- [x] Crosshair confined to the price pane: the crosshair used to follow
      the pointer everywhere on the canvas, including over the volume
      pane and both axis strips - which put two competing sets of
      lines/cursors on screen at once over an axis (a crosshair line *and*
      the zoom-cursor hint from the panning bullets above) and drew a
      price-axis-scaled crosshair over the volume pane, whose y-axis is
      volume, not price - a line that looked like it meant something it
      didn't. Fixed with a new `isOverPricePane()` (position-only, reusing
      `plotLayout()`/`isOverPriceAxis()`/`isOverTimeAxis()` - no new
      layout math), and `handleMouseMove` now sets `crosshairPos` to
      `null` outside it instead of always tracking the pointer, so the
      crosshair disappears the instant the pointer crosses out of the
      price pane rather than smearing stale coordinates from whichever
      position it last saw inside it.
- [x] Vertical (price-axis) panning: dragging in the chart body used to
      only read the drag's x - a vertical drag did nothing at all, so
      there was no way to scroll to a price range above/below wherever
      the visible candles happened to sit (e.g. to see a drawn line or
      order marker placed off the current auto-fit range). Added a
      `pricePanOffset` alongside the existing `priceZoomFactor`
      (deliberately unclamped, same as `panByCandles()`'s own index
      window - see that method's doc comment on why panning doesn't
      self-limit), shifting the auto-fit range's *center* rather than its
      span, so zoom and pan compose independently instead of one
      undoing the other. `render()` and `getViewport()` previously each
      recomputed `{minPrice, maxPrice}` independently (about to
      duplicate a third time for the pan math); both now share one
      `priceRange()` private helper instead. Wired to the existing "pan"
      drag mode's mousemove handler, which now updates
      `pricePanOffset` *before* calling `panByCandles()` for the
      horizontal half, so a diagonal drag still triggers exactly one
      `render()` per mousemove rather than two. The sign convention is
      the opposite of horizontal panning's "grab the content, move it
      with your hand": dragging *down* reveals *higher* prices, dragging
      *up* reveals *lower* ones - matching how every mainstream charting
      platform's vertical drag behaves, and the reverse of what "grab and
      move" would suggest, because a price *axis* pan is "scroll the
      window you're looking through," not "drag the content" - see
      `handleMouseMove`'s own doc comment for the full derivation.
- [x] Price-pane content clipped to its own pane: `pricePanOffset` above
      is deliberately unbounded, which meant a candle (or a price line, a
      marker, an indicator line - anything plotted via `priceScale`)
      panned far enough could compute a y past `priceHeight` and draw
      straight through into the volume pane below, or an x past
      `plotWidth` into the price-ruler strip - a different pane's own
      space, not "the chart" bleeding outside its box. `render()` now
      wraps that whole content group (`Grid`, candles, `PriceLines`,
      `Markers`, indicator lines, drawing tools) in a canvas clip region
      set to exactly the price pane's rectangle before any of it draws,
      so panned-out content simply stops rendering at the boundary
      instead of drawing over a neighboring pane. The volume pane draws
      after the clip is released, not inside it - it was never actually
      at risk (a separate vertical region, untouched by `pricePanOffset`),
      this is purely a reordering now that nothing needs to sit *between*
      the clipped group and it.
- [x] `ChartCore.scrollToLatest()`: a drag-pan (horizontal, vertical, or
      the vertical pan above compounds it) has no reason to auto-follow
      new bars until something scrolls it back - so a chart panned into
      history stays there even as `applyUpdate()` keeps appending bars
      off-screen. Added a small public method that jumps straight back to
      the most recently loaded candle, preserving the current window
      width/zoom (only *which* candles are in view changes, not how
      zoomed-in the view is) and resetting `pricePanOffset` to 0 - both
      axes a drag can wander off on, undone in one call. Intended for a
      "jump to latest" button a consumer wires up outside the canvas,
      same as `panByCandles()`/`panPrice()` themselves have no in-chart
      UI of their own.
- [x] Crosshair date/time tag: the ruler price tag (see `Crosshair`'s own
      class doc comment) had no horizontal-axis counterpart - hovering
      told you the price under the pointer but not, precisely, when. Added
      a second tag pinned to the time axis at the pointer's x, showing a
      full `formatDetailedTimeLabel()` "YYYY-MM-DD HH:MM:SS" (`TimeAxis`'s
      own always-on labels stay a compact "HH:MM" - this is the same
      seam's second, more detailed caller, not a replacement). Unlike the
      price tag, it needs an actual candle under the pointer's x (there's
      no continuous time scale to fall back on the way y always maps to a
      price) - skipped, same as the OHLC readout, when there isn't one.
      Its background/text are their own dedicated options
      (`crosshairTimeTagColor`/`crosshairTimeTagTextColor`), the latter a
      first for any crosshair tag in this file - `crosshairPriceTagColor`
      always inherited plain `textColor` - since a tag meant to stand out
      from the ordinary time-axis labels beneath it can't rely on a
      background color alone for contrast against every
      `textColor`/`backgroundColor` combination a settings UI might land
      on.
- [x] Time zoom that actually resizes candles: `ChartCore.zoom()` was
      rewritten to scale a persistent `timeZoomFactor` (mirroring
      `priceZoomFactor`'s own design exactly) that multiplies
      `ChartOptions.candleWidth`/`candleGap` every render
      (`zoomedCandleWidth()`/`zoomedCandleGap()`, fed into `TimeScale`,
      `Bar`, `VolumeBar`, `Markers`, `IndicatorLine` - every draw/layout
      call that cares how wide a candle slot is). Replaces an earlier
      version that resized the visible *index* window
      (`endIndex - startIndex`) while every candle still drew at a fixed
      pixel size from `ChartOptions` - so "zooming" never actually
      stretched anything on screen, just changed how many indices were
      nominally "in view," which either left unfilled space (window
      narrower than the bar area could hold) or silently clipped extra
      candles (window wider than it). The index window's width is now a
      *consequence* of the zoomed candle size - however many fit
      (`visibleCountAtZoom()`) - not something `zoom()` picks directly.
      One subtlety worth flagging for anyone extending this:
      `timeZoomFactor` is *divided* by `zoom()`'s factor, the inverse of
      how `zoomPrice()` applies its own factor to `priceZoomFactor` - see
      `zoom()`'s own doc comment for why that inversion is required to
      keep `factor > 1` meaning "zoom out" (smaller candles, more of
      them) for both axes, even though one factor scales a range and the
      other scales a pixel size directly.
- [x] Crosshair with an OHLC + price readout, plus a price tag pinned to the ruler at the pointer's y (see the price-ruler bullet below)
- [x] Trading overlays: entry/exit markers, stop-loss/take-profit price lines
- [x] Replay-aware update API (`ChartCore.applyUpdate`) driven by a
      provider-agnostic `CandleUpdate { candle, index, final }` event — the
      same shape a live feed's "isFinal" flag would produce — and a
      cursor-driven `ReplayController` (play/pause/step/seek/speed), not
      wall-clock driven
- [x] `intrabarTicks` on `ReplayController`: synthesizes a plausible
      in-progress path through each bar (`src/replay/intrabar.ts`) so
      historical replay shows the current bar going up and down before it
      locks, instead of popping in fully formed — and gives the library a
      ready seam for a real live data source later, since ChartCore only
      ever sees the same `CandleUpdate` shape either way
- [x] Real-time-accurate pacing: `TIMEFRAME_PRESETS`/`realtimeIntervalMs`
      (`src/replay/timeframes.ts`) make 1x speed genuinely mean "this bar
      takes its own real duration to form" — a 5m candle takes 5 real
      minutes, a 15s candle takes 15 real seconds — instead of an arbitrary
      constant. Shorter presets (15s/30s/1m) exist so testing doesn't
      require sitting through real 5-minute bars; `setSpeed()` still
      fast-forwards on top of whichever one is picked.
- [x] Plugin seam (`Indicator`, `DrawingTool` interfaces) with one example
      of each: `MovingAverage` (SMA/EMA) and `Trendline`

- [x] Render objects for gridlines, price lines, markers, the indicator
      line, and the crosshair (`src/core/Grid.ts`, `PriceLines.ts`,
      `Markers.ts`, `IndicatorLine.ts`, `Crosshair.ts`), pulled out of
      `ChartCore` so each is independently documented and testable — every
      one a class composed from shape primitives (`Line`/`DashedLine`/
      `Rectangle`/`Label` for the first and last three, `Triangle`/
      `Polyline` for `Markers`/`IndicatorLine`; see Architecture above)
- [x] Price ruler + current-price line (`src/core/PriceAxis.ts`,
      `CurrentPriceLine.ts`): a column of tick labels down one edge of the price
      pane, plus a dashed line and ruler tag at the latest candle's close — the
      one price a trader shouldn't have to hunt for on a busy chart. `Crosshair`
      pins a third tag to the same ruler, at the pointer's own y, so hovering
      up and down the pane reads off a price the way most charting platforms
      show it — distinguished from the current-price tag by its own
      `crosshairPriceTagColor`, and drawn whenever the crosshair is (even with
      no candle under the pointer's x, unlike the OHLC readout, since it's pure
      y-axis math). None of this is hardcoded: `priceAxisPosition`
      (`"left" | "right"`), `priceAxisWidth`, `showPriceAxis`,
      `showCurrentPriceLine`, `currentPriceLineColor`, and
      `crosshairPriceTagColor` are all plain `ChartOptions` — the two colors
      are deliberately separate options (not reused from each other or from
      `upColor`/`downColor`/`textColor`) specifically so a future settings UI
      can expose each independently and a trader can tell "current price" from
      "price under my cursor" at a glance. `Grid`/`PriceLines`/`Crosshair`/
      `TimeScale` all learned an `offsetX`/plot-width so everything that spans
      the price pane horizontally already excludes whichever edge the ruler
      reserves, rather than the ruler being layered on top and risking overlap.

- [x] Runtime reconfiguration: `ChartCore.setOptions()` merges a partial
      `ChartOptions` patch into the live instance and re-renders - the one
      entry point every "change the chart after construction" feature
      builds on (color pickers, axis-side toggle, showing/hiding volume)
- [x] Grid/price-axis boundary: `Grid` can draw its own pane background
      (`gridBackgroundColor`) and a vertical separator line where the plot
      area ends and the price ruler begins (`gridSeparatorColor`), both
      plain `ChartOptions` like everything else in this list
- [x] Bar-area margin + price-scale padding: candles (and the vertical
      time-gridlines aligned with them) only ever lay out across
      `barAreaWidthRatio` of the plot width (default 0.75), leaving empty
      room after the most recent bar rather than running the chart edge to
      edge; `priceAreaHeightRatio` (default 0.75) does the equivalent for
      the vertical axis, driving `PriceScale`'s own top/bottom padding
      instead of its bare 8%/8% default. Both are computed once in
      `ChartCore.plotLayout()` - the same shared layout method
      `isOverPriceAxis()`, `defaultVisibleCount()`, and `getGearAnchor()`
      all read from, so a boundary any of them keys off can never drift
      from the boundary `render()` actually draws.
- [x] Time axis: a horizontal strip of `HH:MM` (UTC, deterministic - not
      locale/timezone-dependent) date/time labels at the bottom of the
      chart (`TimeAxis`, extends `AxisLabels` - see Architecture above),
      lined up under vertical time-gridlines `Grid` now also draws
      (`Grid`'s `verticalLineXs` option), with a horizontal separator line
      marking where the price pane (plus the volume pane, if shown) ends
      and the strip begins. The volume pane renders directly above this
      strip rather than flush against the canvas's own bottom edge.
      `showTimeAxis`/`timeAxisHeight` are plain `ChartOptions`; the
      vertical gridlines themselves are unconditional (not gated by
      `showTimeAxis`), since they're a `Grid` feature a chart might want
      even with the label strip off.
- [x] `ChartCore.getGearAnchor()`: a public layout helper returning where a
      settings-gear button should be centered, in canvas-relative CSS
      pixels - horizontally centered in the price-ruler strip, vertically
      centered in the "footer" band below the price pane (the volume pane
      plus the time-axis strip, whichever of the two are actually on).
      Lets a consuming app position an HTML overlay button without
      duplicating this library's own layout math, and without that
      position able to drift from wherever `render()` actually drew the
      boundaries it sits inside - both read the same `plotLayout()`.
      Returns `null` when no price-ruler strip is reserved at all.
- [x] A settings UI in the demo app (`simulator-app/src/settings/`): a gear
      button - positioned via `ChartCore.getGearAnchor()`, re-read after
      every settings change so it stays glued to the chart's own layout
      rather than a fixed corner - opens a panel with a `react-colorful`
      picker per configurable color, a price-axis-side select, and a
      show/hide-volume toggle, all backed by a Zustand `ChartSettingsConfig`
      store (typed as `Required<ChartOptions>` directly, rather than a
      parallel shape).
- [x] Apply/Cancel on the settings panel: every edit (a color, the toggle,
      Reset) mutates the store's live-preview `draft` immediately - pushed
      straight to the chart via `ChartCore.setOptions()`, so it previews on
      the real chart before you ever commit to it - while a separate
      `committed` baseline only `apply()`/`cancel()` ever touch. **Apply**
      freezes the draft into `committed`; **Cancel** reverts the draft back
      to it (which the same `setOptions()` push then un-previews on the
      chart); closing the panel any other way - an outside click, or
      toggling the gear closed without hitting either button - cancels too,
      so nothing sticks except through an explicit Apply.
- [x] A dedicated `ChartNavBar` (`simulator-app/src/ChartNavBar.tsx`)
      rendered above the chart, housing the timeframe selector pulled out
      of `App`'s header - purely presentational (props in, callback out,
      `App` still owns the actual timeframe state), with room for further
      settings controls alongside the picker as the plan calls for more.
      No visible "Timeframe" caption next to the `<select>` - a trader
      reads "5m"/"1h" straight off the option it's set to - just an
      `aria-label` for screen readers.
- [x] `resampleCandles(candles, sourceSeconds, targetSeconds)`
      (`src/replay/resample.ts`): aggregates a fine-grained candle series
      into a coarser timeframe by bucketing (open=first/high=max/low=min/
      close=last/volume=sum). Exists so a consumer generates *one* base
      series at the finest timeframe it cares about and derives every
      coarser one a user might pick from that same series on demand,
      instead of generating independent data per timeframe - which is what
      produced inconsistent prices across a timeframe switch before this
      existed. The demo app (`simulator-app/src/App.tsx`) generates one
      15s base series once and resamples it on every timeframe change;
      `ChartPanel` no longer gets remounted (`key={timeframeSeconds}` is
      gone) when that happens - it reacts in place, working out how much
      of the new candle set is already "revealed" from the world-clock
      moment the replay had reached (not a candle index, which means
      something different at every timeframe) and picking the replay back
      up exactly there, carrying over play/pause state and speed, instead
      of resetting the session.

Not yet built (tracked against the v1 list in the plan):
- [ ] RSI, MACD, Bollinger Bands
- [ ] Horizontal ray, rectangle, Fibonacci retracement, freehand annotation
- [ ] Multi-pane layout (needed once RSI/MACD render below the price pane)
- [x] Unit tests for the scale math, shape classes, render helpers, indicator
      calculations, and the replay controller

## Testing

Jest (via `ts-jest`) covers the pure logic — everything that doesn't need a
real `<canvas>`, which in practice is nearly everything, since every shape
and render helper takes a `CanvasRenderingContext2D` as a plain parameter
and a mock object satisfies that just fine:

- `src/core/__tests__/Scale.test.ts` — time/price pixel-mapping round-trips,
  padding, the visible-range calculation, and `TimeScale`'s `offsetX` (every
  x it produces shifts by it; `indexToX`/`xToIndex` still round-trip through it)
- `src/core/shapes/__tests__/` — one file per shape class:
  `Rectangle.test.ts` and `Line.test.ts` (the base primitives: fill/stroke
  calls, pixel-snapping, idempotence on already-rounded input), `Wick.test.ts`
  (the half-pixel x offset vs. plain-rounded y endpoints), `Bar.test.ts`
  (color selection, wick-then-body draw order, body rounding, the doji
  minimum-height case), `VolumeBar.test.ts` (proportional height, the
  zero-maxVolume no-op, the minimum 1px height for a nonzero volume),
  `DashedLine.test.ts` (default vs. custom dash pattern, the nested
  save/restore around `setLineDash`), `Label.test.ts` (background sizing
  from `measureText`, the optional border, text inset from the padding,
  custom padding/height), `Triangle.test.ts` (traces its three vertices in
  order and fills), `MarkerTriangle.test.ts` (points down/up from the tip
  for entry/exit, entry/exit fill colors, the `isEntry` field), and
  `Polyline.test.ts` (moveTo the first point/lineTo the rest, default vs.
  custom line width, the harmless empty-path stroke for zero/one point)
- `src/core/__tests__/Grid.test.ts` and `PriceLines.test.ts` — the lines/labels
  each class builds once in its constructor and replays on `draw()`: grid line
  spacing and color, price-line dash color by kind (stop-loss vs. take-profit),
  the labeled-badge sizing/position built from `Label`, and (both files) that
  an `offsetX` shifts every line/label so a left-side price ruler isn't drawn
  over. `Grid.test.ts` also covers its options-object constructor directly
  (one test per option, matching `Grid`'s own JSDoc) and the `verticalLineXs`
  feature: one line per x, spanning the full pane height, drawn after the
  horizontal lines and before the ruler separator, in the same color as the
  horizontal lines (not the separator's own).
- `src/core/__tests__/PriceAxis.test.ts` and `TimeAxis.test.ts` — both extend
  `AxisLabels` (see Architecture above) and are tested the same way: tick
  count/spacing, each tick's label text, background color, and that ticks
  are built once in the constructor and replayed on `draw()`. `TimeAxis.test.ts`
  additionally covers skipping an x whose mapped candle index falls outside
  the loaded buffer, the deterministic UTC `HH:MM` formatting (including
  zero-padding), and the estimated (not measured) text-width centering.
- `src/core/__tests__/Crosshair.test.ts` — vertical/horizontal dashed line
  geometry, the OHLC + last-price readout text for the candle under the
  pointer, the ruler price tag's position/color and that it still draws (with
  no OHLC readout) when there's no candle under the pointer, that the tag's
  color is distinct from the OHLC readout's background, that `axisX` repositions
  the tag for a left-side ruler, and that `offsetX` shifts the horizontal guide
  line while leaving the vertical one at the pointer's own (already-absolute) x
- `src/core/__tests__/PriceAxis.test.ts` — tick count/spacing matching `Grid`'s,
  each tick's price label (via a stubbed `yToPrice`), background color, and
  x position (`axisX + 4`, whichever edge the ruler is on)
- `src/core/__tests__/CurrentPriceLine.test.ts` — the dashed line's geometry
  (including its own tighter `[3, 3]` dash, distinct from `PriceLines`' `[6, 4]`),
  the `offsetX`-shifted plot span, and the ruler tag's position/color at `axisX`
- `src/core/__tests__/Markers.test.ts` — marker direction (entry points down,
  exit points up) via the fill color and `MarkerTriangle` geometry it builds,
  the skip-if-not-loaded case, drawing one triangle per matched marker, and
  that triangles are built once in the constructor and replayed on `draw()`
- `src/core/__tests__/IndicatorLine.test.ts` — NaN/undefined-skipping for an
  indicator's warm-up period, color fallback, the empty-series no-op, and
  that `indicator.compute()` is called once in the constructor, not again on
  every `draw()`
- `src/plugins/indicators/__tests__/MovingAverage.test.ts` — SMA/EMA values
  against hand-computed expectations
- `src/replay/__tests__/ReplayController.test.ts` — step/seek bounds,
  play/pause/speed timing via Jest's fake timers, and `intrabarTicks`
  behavior (non-final updates before the final one, manual stepping
  bypassing the animation). Includes a regression test for a real bug
  caught while writing these: `seek(index)` originally set the cursor *to*
  `index`, which silently skipped emitting that bar on the next
  `stepForward()` — fixed so the sought bar is what gets revealed next.
- `src/replay/__tests__/intrabar.test.ts` — the intrabar path synthesis:
  snapshot count, high/low never escaping the settled candle's own range,
  monotonic high/low growth, and proportional volume interpolation.
- `src/replay/__tests__/timeframes.test.ts` — the preset list shape and the
  seconds-to-ms conversion `realtimeIntervalMs` does.
- `src/plugins/drawing-tools/__tests__/Trendline.test.ts` — point buffering
  (resets after two points) and draw calls against a mocked canvas context
- `src/utils/__tests__/pixel.test.ts` — the pixel-snapping math `crispLine`/`crispRect`
  do, which every shape above builds on

`ChartCore.ts` itself now has direct tests too
(`src/core/__tests__/ChartCore.test.ts`), against a hand-stubbed
`<canvas>`/2D context (Jest's `testEnvironment: "node"` has no real DOM —
see that file's own class doc comment for exactly what's stubbed and why):
`applyUpdate`'s index-driven append/overwrite/truncate logic (including the
step-backward regression this fix exists for and re-appending correctly
once the caller steps forward again), the grid/axis separator only
appearing when a price-ruler strip is reserved, `gridBackgroundColor`
actually filling, `setOptions()` re-rendering with a merged patch, and
wheel/drag correctly routing into the three regions - price-ruler strip
and time-axis strip each zoom their own axis, everywhere else (the chart
body) pans - based on where the drag *started*, even if the pointer
wanders into a different region mid-drag (asserted via `getViewport()`
rather than hand-counted `fillRect` calls, for the pan cases - a cleaner
read on "did this pan or zoom" than scraping draw calls) — every
zoom/count assertion that does still count draw calls was recomputed by
hand against `barAreaWidthRatio`'s narrower bar area once that option
landed, rather than loosened to "close enough." Also covered: the
time-axis footer separator + labels drawing only when `showTimeAxis` is
on, `getGearAnchor()`'s position (both axis sides, with/without the volume
pane and time-axis strip) and its `null` case, and the `ns-resize`/
`ew-resize`/`grab`/`grabbing` cursor across all three regions - including
staying locked to whichever region a drag started in, same as the
pan/zoom routing it mirrors. `zoom()` also gets a dedicated test reading
a candle body's own `fillRect` width straight out of the mock, at the
base zoom level and after zooming both directions - the regression test
for the bug its rewrite fixes (an earlier version changed which indices
were "in view" without ever changing a candle's drawn size, so wheel/drag
time-zoom visibly did nothing to the bars themselves). Two more cover the
wheel-pan fix: a horizontally-dominant wheel event over the chart body
pans (`getViewport()` shows the same window width, just shifted - the
trackpad-swipe case `handleWheel`'s own doc comment describes), while a
vertically-dominant one with a small but nonzero `deltaX` still zooms
(width changes) - guarding against a fix that's too eager and starts
treating an ordinary mouse wheel as a swipe.

A dedicated "crosshair visibility (price pane only)" block covers
`isOverPricePane()`'s new gating: the crosshair draws over the price
pane, doesn't over the volume pane, doesn't over either axis strip, and
disappears on the very next mousemove that crosses from the price pane
into the volume pane - each isolated with `ctx.moveTo.mockClear()`
around the render under test, since `setData()`'s own initial render
would otherwise double-count draw calls against a single mousemove's.
Two more tests hand-derive the vertical price-pan's exact numbers from
`priceHeight`, the auto-fit range, and `pricePerPixel`: a 150px downward
drag pans `{minPrice, maxPrice}` toward higher prices by precisely that
much, and a 150px upward drag does the same toward lower prices,
unbounded below the lowest real candle - both confirming the "drag down
→ higher prices" sign convention the feature-list entry above explains.
A "price-pane clipping" block covers the fix that made those two tests'
own out-of-range numbers safe to draw at all: `ctx.rect` is called with
exactly the price pane's own `{plotOffsetX, 0, plotWidth, priceHeight}`
rectangle before `ctx.clip()`, and the volume pane still draws (its
`fillRect` calls present and counted) even though it sits entirely
outside that rectangle - proving the clip is scoped to the price pane
alone, not the whole canvas. A `scrollToLatest()` test drags both axes
at once (6 candles back, `pricePanOffset` to 19 - the same numbers the
horizontal- and vertical-pan tests above derive individually) and
confirms one call restores the exact `{startIndex, endIndex, minPrice,
maxPrice}` `setData()` itself produced, proving it undoes both kinds of
pan together, not just whichever one a simpler test might have covered.

`Crosshair.test.ts` covers the date/time tag the same way it already
covered the ruler price tag: pinned to the time axis at the pointer's x
in `crosshairTimeTagColor`, reading a full `formatDetailedTimeLabel()`
string off the candle under the pointer (`1970-01-01 00:00:00` for the
epoch-time fixture candle already used elsewhere in this file); a
caller-supplied `timeAxisY` (`ChartCore.render()`'s own
`footerSeparatorY`, once a volume pane reserves height below the price
pane) moves it, not the price pane's own `paneHeight`; and, mirroring the
existing "no candle under the pointer" test for the OHLC readout, it's
skipped under the same condition, leaving only the ruler price tag's
`fillRect` behind.

`src/replay/__tests__/resample.test.ts` covers `resampleCandles()`: full
and partial (trailing) buckets, OHLCV aggregation correctness against
hand-computed expectations, the `targetSeconds === sourceSeconds` identity
case, an empty input, and both rejected-input cases (finer target,
non-multiple target).

Run tests with:

```
npm install
npm test
```

Note: `tsconfig.jest.json` compiles tests to CommonJS (unlike the ESM build
in `tsconfig.json`) so `ts-jest` doesn't have to fight the source's ESM
`.js`-suffixed relative imports; `jest.config.cjs` maps those suffixes back
to the `.ts` sources via `moduleNameMapper`.

## Layout

```
src/
  core/
    shapes/          # Shape -> Rectangle/Line -> Bar/VolumeBar/Wick/DashedLine/Label
                     #       -> Triangle -> MarkerTriangle, Polyline
                     # (see Architecture)
    ChartCore.ts     # orchestration: instance state + render() call order
    Grid.ts, PriceLines.ts, PriceAxis.ts, CurrentPriceLine.ts, Crosshair.ts,
    Markers.ts, IndicatorLine.ts
                     # render objects, each a class composed from the shapes above
    Scale.ts         # TimeScale/PriceScale coordinate mapping
    types.ts         # Candle, CandleUpdate, ChartOptions, plugin interfaces, …
  utils/
    pixel.ts         # crispLine/crispRect pixel-snapping — generic, not chart-specific
  replay/            # cursor-driven replay controller, intrabar synthesis, timeframes
  plugins/
    indicators/      # Indicator implementations (MovingAverage is the first)
    drawing-tools/    # DrawingTool implementations (Trendline is the first)
  index.ts       # public exports (grouped and documented at the top of the file)
examples/
  basic-demo.html    # opens ChartCore against generated sample candles
```

## Usage

```ts
import { ChartCore, ReplayController, realtimeIntervalMs } from "trading-charter-app-library";

const canvas = document.querySelector("canvas")!;
const chart = new ChartCore(canvas, {
  volumePaneRatio: 0.18,
  priceAxisPosition: "right", // or "left" — the default, shown for clarity
  currentPriceLineColor: "#9aa0a6", // the live-price tag; a future settings UI would set this
  crosshairPriceTagColor: "#37474f", // the hover tag — a different color so it reads as distinct from the one above
});
chart.setData(historicalCandles); // or start empty and feed via replay

const TIMEFRAME_SECONDS = 300; // these are 5-minute candles

const replay = new ReplayController(
  {
    length: () => historicalCandles.length,
    at: (i) => historicalCandles[i],
  },
  {
    baseIntervalMs: realtimeIntervalMs(TIMEFRAME_SECONDS), // 1x = genuinely 5 real minutes per bar
    intrabarTicks: 8, // omit (or 0) to reveal each bar fully formed instead
  }
);
replay.onUpdate((update) => chart.applyUpdate(update));
replay.play();
// replay.setSpeed(20) fast-forwards on top of the real-time pace above —
// pick a shorter TIMEFRAME_SECONDS (see TIMEFRAME_PRESETS) instead if what
// you actually want is faster/shorter bars, not just faster playback.
```

## Build

```
npm install
npm run build   # emits dist/ via tsc
```

## Try it

Open `examples/basic-demo.html` through a local static server (ES modules
need http:// not file://) after running `npm run build`, e.g.:

```
npx serve .
```
