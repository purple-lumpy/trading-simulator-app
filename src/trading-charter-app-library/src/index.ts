/**
 * Public API surface of trading-charter-app-library, grouped by what each
 * export is for:
 *
 * - Core data shapes (`Candle`, `CandleUpdate`, `Marker`, `PriceLine`, …)
 *   and `ChartCore` itself — the orchestrator most consumers only need.
 * - `./core/shapes/` — the object-oriented drawing primitives everything
 *   else builds on: `Shape` → `Rectangle`/`Line` → `Bar`/`VolumeBar`/`Wick`
 *   (candles), `Line` → `DashedLine`, `Rectangle` → `Label` (guide lines
 *   and readouts), and `Shape` → `Triangle`/`Polyline` (the one filled
 *   and one open-path primitive that aren't a box or a straight line) →
 *   `MarkerTriangle` (entry/exit markers). Exported so a consumer
 *   building a custom overlay can reuse the same pixel-snapped building
 *   blocks instead of reimplementing them.
 * - Render objects (`Grid`, `PriceLines`, `PriceAxis`, `TimeAxis`,
 *   `CurrentPriceLine`, `Crosshair`, `Markers`, `IndicatorLine` — every
 *   one a class composed from the shapes above) — what `ChartCore.render()`
 *   is built from internally, exported for the same reuse reason.
 *   `PriceAxis`/`TimeAxis` both extend `AxisLabels`, the shared "resolve
 *   your own tick geometry in the constructor, replay it in draw()" base
 *   class the two of them factor out — also exported, for a consumer
 *   building its own axis-shaped label strip.
 * - Scale math (`TimeScale`, `PriceScale`, `priceRangeFor`) and pixel
 *   snapping (`crispLine`, `crispRect`, in `./utils/`) — the
 *   coordinate-mapping and sharpness utilities everything above is built
 *   on.
 * - Replay (`ReplayController`, `synthesizeIntrabarPath`,
 *   `TIMEFRAME_PRESETS`, `realtimeIntervalMs`, `resampleCandles`) —
 *   cursor-driven playback, independent of ChartCore; a consumer could
 *   drive their own renderer with this instead. `resampleCandles`
 *   aggregates one base candle series into any coarser timeframe, so a
 *   consumer can derive every timeframe a user might pick from one
 *   consistent series instead of generating/fetching each independently.
 * - Plugins (`MovingAverage`, `Trendline`, `HorizontalLine`,
 *   `VerticalLine`) — implementations of the `Indicator`/`DrawingTool`
 *   extension seams. `BaseDrawingTool` is the shared abstract base every
 *   `DrawingTool` plugin extends (see its own doc comment) — exported
 *   for a consumer building a custom drawing tool of its own.
 */

export * from "./core/types.js";
export { ChartCore } from "./core/ChartCore.js";
export { TimeScale, PriceScale, priceRangeFor } from "./core/Scale.js";
export { crispLine, crispRect } from "./utils/pixel.js";

// ---- drawing primitives (./core/shapes/) --------------------------------
export { Shape } from "./core/shapes/Shape.js";
export { Rectangle } from "./core/shapes/Rectangle.js";
export { Line } from "./core/shapes/Line.js";
export { DashedLine } from "./core/shapes/DashedLine.js";
export { Wick } from "./core/shapes/Wick.js";
export { Bar } from "./core/shapes/Bar.js";
export type { BarColors } from "./core/shapes/Bar.js";
export { VolumeBar } from "./core/shapes/VolumeBar.js";
export { Label } from "./core/shapes/Label.js";
export type { LabelStyle } from "./core/shapes/Label.js";
export { Triangle } from "./core/shapes/Triangle.js";
export { MarkerTriangle } from "./core/shapes/MarkerTriangle.js";
export { Polyline } from "./core/shapes/Polyline.js";
export type { Point } from "./core/shapes/Shape.js";

// ---- render objects and helpers -------------------------------------------
export { Grid } from "./core/Grid.js";
export type { GridOptions } from "./core/Grid.js";
export { AxisLabels } from "./core/AxisLabels.js";
export { PriceLines } from "./core/PriceLines.js";
export { PriceAxis } from "./core/PriceAxis.js";
export { TimeAxis } from "./core/TimeAxis.js";
export { CurrentPriceLine } from "./core/CurrentPriceLine.js";
export { Crosshair } from "./core/Crosshair.js";
export type { CrosshairPosition } from "./core/Crosshair.js";
export { Markers } from "./core/Markers.js";
export { IndicatorLine } from "./core/IndicatorLine.js";

// ---- replay ---------------------------------------------------------------
export { ReplayController } from "./replay/ReplayController.js";
export type { ReplayDataSource, ReplaySpeed, ReplayOptions } from "./replay/ReplayController.js";
export { synthesizeIntrabarPath, samplePath } from "./replay/intrabar.js";
export { TIMEFRAME_PRESETS, realtimeIntervalMs } from "./replay/timeframes.js";
export type { TimeframePreset } from "./replay/timeframes.js";
export { resampleCandles } from "./replay/resample.js";

// ---- plugins ---------------------------------------------------------------
export { MovingAverage } from "./plugins/indicators/MovingAverage.js";
export { BaseDrawingTool, LONG_SPAN, HIT_TEST_TOLERANCE_PX, SELECTED_STROKE_COLOR } from "./plugins/drawing-tools/BaseDrawingTool.js";
export { Trendline } from "./plugins/drawing-tools/Trendline.js";
export { HorizontalLine } from "./plugins/drawing-tools/HorizontalLine.js";
export { VerticalLine } from "./plugins/drawing-tools/VerticalLine.js";
export { TraceLine } from "./plugins/drawing-tools/TraceLine.js";
export type { DrawingToolTypeName } from "./plugins/drawing-tools/factory.js";
