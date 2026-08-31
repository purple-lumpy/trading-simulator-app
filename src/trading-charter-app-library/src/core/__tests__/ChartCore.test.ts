import { ChartCore } from "../ChartCore.js";
import type { Candle } from "../types.js";
import { LONG_SPAN } from "../../plugins/drawing-tools/BaseDrawingTool.js";

/**
 * `ChartCore` draws to a real `<canvas>`, and this suite runs under Jest's
 * Node test environment (no DOM — see `jest.config.cjs`'s comment on why),
 * so both the canvas element and its 2D context are hand-stubbed rather
 * than real. `getContext`, `addEventListener`/`removeEventListener` (for
 * the constructor's `attachInteraction()`), `style`/`width`/`height` (for
 * `applyPixelRatio()`), and `getBoundingClientRect` (for the mousemove
 * handler, unused in this file but present so a future test can fire one)
 * are the minimum surface `ChartCore` actually touches — `rect`/`clip`
 * joined the list once `render()` started clipping price-pane content to
 * its own pane (see that method's own comment on why).
 */
function mockCanvas() {
  const fillRectCalls: unknown[][] = [];
  const ctx: any = {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    fill: jest.fn(),
    arc: jest.fn(),
    stroke: jest.fn(),
    setLineDash: jest.fn(),
    strokeRect: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn(() => ({ width: 10 })),
    setTransform: jest.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
  };
  ctx.fillRect = jest.fn((...args: unknown[]) => fillRectCalls.push(args));

  const canvas: any = {
    clientWidth: 500,
    clientHeight: 300,
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctx,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };

  return { canvas, ctx, fillRectCalls };
}

function makeCandle(i: number): Candle {
  return { time: i, open: i, high: i + 1, low: Math.max(0, i - 1), close: i, volume: 10 };
}

/** Find a DOM listener `attachInteraction()` registered on the mock canvas via `addEventListener`, so a test can fire it directly with a synthetic event - the same pattern the rest of this file uses to reach a private handler without a test-only accessor. */
function getListener(canvas: any, type: string): (e: any) => void {
  const call = canvas.addEventListener.mock.calls.find(([t]: [string]) => t === type);
  if (!call) throw new Error(`no "${type}" listener was registered on the mock canvas`);
  return call[1];
}

/**
 * Vertical pixel distance between a wick's two endpoints, read straight
 * out of the mock ctx's moveTo/lineTo call log by index - a stand-in for
 * "how tall is this candle drawn," since `Bar`'s body itself would always
 * measure the same 1px here (`makeCandle`'s open === close makes every
 * body a doji, clamped to a minimum height regardless of price scale -
 * see `Bar`'s own doc comment on that clamp). The wick's high/low span
 * has no such floor, so it's what actually moves when `priceZoomFactor`
 * does.
 *
 * `index` is which moveTo/lineTo call pair to read - `Grid` always draws
 * its 5 default horizontal gridlines (indices 0-4) and 5 default vertical
 * time-gridlines (indices 5-9, unconditional - see `ChartOptions.barAreaWidthRatio`)
 * before anything else, plus one more for the axis separator (index 10)
 * whenever a price-ruler strip is shown, so the *first* candle's wick
 * lands at a fixed, predictable index regardless of what (if anything)
 * draws *after* the candles - the crosshair, when a drag test's
 * mousemove has set `crosshairPos`, most notably - which is exactly why
 * this reads by index instead of "the last call."
 */
function wickSpanAt(ctx: any, index: number): number {
  const y1 = ctx.moveTo.mock.calls[index][1];
  const y2 = ctx.lineTo.mock.calls[index][1];
  return Math.abs(y2 - y1);
}

/**
 * `render()`'s very first call, every frame, is the full-canvas background
 * `fillRect` — so "1 + however many candle bodies are visible" is a clean,
 * public-API-only way to assert how many bars `ChartCore` currently has
 * loaded, without adding a test-only accessor for private state. Every
 * other option used below (`volumePaneRatio: 0`, `showPriceAxis: false`,
 * `showCurrentPriceLine: false`, `showTimeAxis: false`) exists specifically
 * to silence the other `fillRect` callers (`VolumeBar`, `PriceAxis`,
 * `CurrentPriceLine`'s tag, `TimeAxis`'s labels) that would otherwise
 * pollute this count; markers/price lines/indicators default to empty and
 * the crosshair defaults to hidden, so none of those need silencing.
 */
function newChart(canvas: unknown) {
  return new ChartCore(canvas as HTMLCanvasElement, {
    volumePaneRatio: 0,
    showPriceAxis: false,
    showCurrentPriceLine: false,
    showTimeAxis: false,
  });
}

describe("ChartCore rendering", () => {
  it("draws the grid/axis separator line only when the price axis area is shown - the boundary marking 'where prices end and the rest of the chart begins'", () => {
    const { canvas: canvasWithout, ctx: ctxWithout } = mockCanvas();
    new ChartCore(canvasWithout as HTMLCanvasElement, {
      volumePaneRatio: 0,
      showPriceAxis: false,
      showCurrentPriceLine: false,
    }).setData([makeCandle(0), makeCandle(1)]);

    const { canvas: canvasWith, ctx: ctxWith } = mockCanvas();
    new ChartCore(canvasWith as HTMLCanvasElement, {
      volumePaneRatio: 0,
      showPriceAxis: true,
      showCurrentPriceLine: false,
    }).setData([makeCandle(0), makeCandle(1)]);

    // Grid always draws the same 5 horizontal + 5 vertical gridlines
    // either way (the vertical ones are unconditional - see
    // ChartOptions.barAreaWidthRatio), and the time-axis footer separator
    // (showTimeAxis defaults true, unset by either config here) draws
    // equally on both sides too; showing the price axis adds exactly one
    // more moveTo/lineTo pair beyond all of that, for the price/axis
    // separator - PriceAxis itself draws its tick labels via
    // fillText/fillRect, not moveTo/lineTo, so this isolates the
    // separator's own contribution regardless of any of the above.
    expect(ctxWith.moveTo.mock.calls.length).toBe(ctxWithout.moveTo.mock.calls.length + 1);
    expect(ctxWith.lineTo.mock.calls.length).toBe(ctxWithout.lineTo.mock.calls.length + 1);
  });

  it("fills the grid's own background when gridBackgroundColor is set", () => {
    const { canvas, fillRectCalls } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, {
      volumePaneRatio: 0,
      showPriceAxis: false,
      showCurrentPriceLine: false,
      showTimeAxis: false, // isolate the grid background from TimeAxis's own fillRect calls
      gridBackgroundColor: "#111318",
    });

    fillRectCalls.length = 0;
    chart.setData([makeCandle(0), makeCandle(1)]);
    // canvas background + grid background + 2 candle bodies
    expect(fillRectCalls).toHaveLength(1 + 1 + 2);
  });
});

describe("ChartCore rendering — time-axis footer", () => {
  it("draws the footer separator + labels only when showTimeAxis is true", () => {
    const base = { volumePaneRatio: 0, showPriceAxis: false, showCurrentPriceLine: false } as const;
    const { canvas: canvasOff, ctx: ctxOff, fillRectCalls: fillsOff } = mockCanvas();
    new ChartCore(canvasOff as HTMLCanvasElement, { ...base, showTimeAxis: false }).setData([makeCandle(0), makeCandle(1)]);

    const { canvas: canvasOn, ctx: ctxOn, fillRectCalls: fillsOn } = mockCanvas();
    new ChartCore(canvasOn as HTMLCanvasElement, { ...base, showTimeAxis: true }).setData([makeCandle(0), makeCandle(1)]);

    // The footer separator is one more moveTo/lineTo pair, drawn after
    // Grid's own horizontal + vertical lines regardless of which of them
    // the price-ruler adds (neither config here shows one).
    expect(ctxOn.moveTo.mock.calls.length).toBe(ctxOff.moveTo.mock.calls.length + 1);
    expect(ctxOn.lineTo.mock.calls.length).toBe(ctxOff.lineTo.mock.calls.length + 1);
    // Of the 5 default vertical time-gridlines evenly spaced across this
    // setup's bar area (barAreaWidth = 500 * 0.75 = 375, step = 9), only
    // the one at x=0 lands on index 0 - a candle actually loaded in this
    // 2-candle buffer; the other four map to indices past it and are
    // skipped (see TimeAxis.test.ts's own coverage of that skip) - so
    // exactly one TimeAxis label draws.
    expect(fillsOn).toHaveLength(fillsOff.length + 1);
  });
});

describe("ChartCore.getGearAnchor", () => {
  it("returns null when no price-ruler strip is reserved at all (showPriceAxis and showCurrentPriceLine both off)", () => {
    const { canvas } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, { showPriceAxis: false, showCurrentPriceLine: false });
    expect(chart.getGearAnchor()).toBeNull();
  });

  it("centers on the price-ruler strip (right edge) and the footer band (volume pane + time-axis strip)", () => {
    const { canvas } = mockCanvas(); // 500 x 300, per mockCanvas's own clientWidth/clientHeight
    const chart = new ChartCore(canvas as HTMLCanvasElement, {
      showPriceAxis: true,
      showCurrentPriceLine: false,
      priceAxisWidth: 64,
      priceAxisPosition: "right",
      volumePaneRatio: 0.2,
      showTimeAxis: true,
      timeAxisHeight: 24,
    });
    // axisX = plotWidth = 500 - 64 = 436 -> gear x = 436 + 64/2 = 468.
    // remainingHeight = 300 - 24 = 276; volumeHeight = 276 * 0.2 = 55.2;
    // priceHeight = 276 - 55.2 = 220.8; footerHeight = 300 - 220.8 = 79.2
    // -> gear y = 220.8 + 79.2/2 = 260.4.
    const anchor = chart.getGearAnchor();
    expect(anchor?.x).toBeCloseTo(468);
    expect(anchor?.y).toBeCloseTo(260.4);
  });

  it("centers on the price-ruler strip on the left edge, when priceAxisPosition is left, with an empty footer band when volume and the time-axis strip are both off", () => {
    const { canvas } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, {
      showPriceAxis: true,
      showCurrentPriceLine: false,
      priceAxisWidth: 64,
      priceAxisPosition: "left",
      volumePaneRatio: 0,
      showTimeAxis: false,
    });
    // axisX = 0 (left) -> gear x = 0 + 64/2 = 32. With both the volume
    // pane and the time-axis strip off, priceHeight fills the full 300px
    // and the footer band collapses to zero height - the gear still has a
    // well-defined position, right at that shared boundary.
    const anchor = chart.getGearAnchor();
    expect(anchor?.x).toBeCloseTo(32);
    expect(anchor?.y).toBeCloseTo(300);
  });
});

describe("ChartCore cursor feedback (crosshair/pan/zoom-region resize cursor)", () => {
  // showCurrentPriceLine reserves the same right-side price-ruler strip
  // AXIS_OPTS above documents (axisWidth 64 -> strip spans x in [436, 500),
  // chart body spans [0, 436)); showTimeAxis: false keeps this describe
  // block focused on cursor behavior alone.
  const OPTS = { volumePaneRatio: 0, showPriceAxis: false, showCurrentPriceLine: true, showTimeAxis: false } as const;

  it("sets a crosshair cursor while hovering the chart body (the pan region) - same as a drawing tool would show there", () => {
    const { canvas } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, OPTS).setData([makeCandle(0), makeCandle(1)]);
    getListener(canvas, "mousemove")({ clientX: 100, clientY: 50 });
    expect(canvas.style.cursor).toBe("crosshair");
  });

  it("sets an ns-resize cursor while hovering the price-ruler strip", () => {
    const { canvas } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, OPTS).setData([makeCandle(0), makeCandle(1)]);
    getListener(canvas, "mousemove")({ clientX: 450, clientY: 50 });
    expect(canvas.style.cursor).toBe("ns-resize");
  });

  it("resets the cursor to the browser default on mouseleave", () => {
    const { canvas } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, OPTS).setData([makeCandle(0), makeCandle(1)]);
    getListener(canvas, "mousemove")({ clientX: 450, clientY: 50 });
    expect(canvas.style.cursor).toBe("ns-resize");
    getListener(canvas, "mouseleave")(undefined);
    expect(canvas.style.cursor).toBe("");
  });

  it("switches to the grabbing hand once a pan drag actually starts, keeping it even if the pointer wanders into the price-ruler strip mid-drag", () => {
    const { canvas } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, OPTS).setData(Array.from({ length: 60 }, (_, i) => makeCandle(i)));
    // Drag starts over the chart body - a pan drag...
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    // ...then wanders onto the price-ruler strip - still a pan drag
    // (dragMode locked once, at mousedown, per handleMouseDown's own doc
    // comment), so the cursor stays grabbing rather than flipping to
    // ns-resize just because the pointer is now over the ruler.
    getListener(canvas, "mousemove")({ clientX: 450, clientY: 50 });
    expect(canvas.style.cursor).toBe("grabbing");
  });

  it("sets an ew-resize cursor while hovering the time-axis label strip", () => {
    const { canvas } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, { ...OPTS, showTimeAxis: true }).setData([makeCandle(0), makeCandle(1)]);
    // timeAxisHeight defaults to 24, canvas is 300 tall - strip spans
    // y in [276, 300); x=100 keeps this off the price-ruler strip.
    getListener(canvas, "mousemove")({ clientX: 100, clientY: 290 });
    expect(canvas.style.cursor).toBe("ew-resize");
  });

  it("still sets an ew-resize cursor a few pixels short of the time-axis strip - the hit-slop that fixes a drag started just above it from being mistaken for a pan", () => {
    const { canvas } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, { ...OPTS, showTimeAxis: true }).setData([makeCandle(0), makeCandle(1)]);
    // Strip starts at y=276 (see the test above); TIME_AXIS_HIT_SLOP is 10,
    // so y=270 is 6px short of the strip's own drawn edge but still within
    // the slop - see isOverTimeAxis()'s own doc comment for why a target
    // this thin needs the tolerance.
    getListener(canvas, "mousemove")({ clientX: 100, clientY: 270 });
    expect(canvas.style.cursor).toBe("ew-resize");
  });

  it("falls back to a crosshair cursor once the pointer is far enough above the strip to be outside the hit-slop", () => {
    const { canvas } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, { ...OPTS, showTimeAxis: true }).setData([makeCandle(0), makeCandle(1)]);
    // 16px short of the strip's edge (y=276) - past TIME_AXIS_HIT_SLOP's
    // 10px tolerance, so this is genuinely the pan region, not the axis.
    getListener(canvas, "mousemove")({ clientX: 100, clientY: 260 });
    expect(canvas.style.cursor).toBe("crosshair");
  });

  it("keeps the drag-locked time-axis cursor even if the pointer wanders into the chart body mid-drag", () => {
    const { canvas } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, { ...OPTS, showTimeAxis: true }).setData(
      Array.from({ length: 60 }, (_, i) => makeCandle(i))
    );
    // Drag starts over the time-axis strip - a time-zoom drag...
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 290, preventDefault: jest.fn() });
    // ...then wanders up into the chart body - still a time-axis drag
    // (dragMode locked once, at mousedown), so the cursor stays ew-resize
    // rather than flipping to grabbing just because the pointer is now
    // over the pan region.
    getListener(canvas, "mousemove")({ clientX: 150, clientY: 50 });
    expect(canvas.style.cursor).toBe("ew-resize");
  });
});

describe("ChartCore crosshair visibility (price pane only)", () => {
  // showCurrentPriceLine reserves a price-ruler strip (axisWidth 64 ->
  // strip spans x in [436, 500)); showTimeAxis + volumePaneRatio give
  // this block all three regions isOverPricePane() has to exclude, on
  // top of the price pane itself. Vertical bands, bottom-up: timeAxisHeight
  // 24 -> remainingHeight 276; volumeHeight 276*0.2 = 55.2 -> volume pane
  // spans y in [220.8, 276); priceHeight 276 - 55.2 = 220.8 -> price pane
  // spans y in [0, 220.8).
  const OPTS = { volumePaneRatio: 0.2, showPriceAxis: false, showCurrentPriceLine: true, showTimeAxis: true } as const;
  const CANDLES = Array.from({ length: 10 }, (_, i) => makeCandle(i));

  /** moveTo call count right after setData's own initial render - the crosshair is `null` until a mousemove sets it, so this is always "chart with no crosshair," the baseline every scenario below compares against. */
  function baselineMoveToCount(): number {
    const { canvas, ctx } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, OPTS).setData(CANDLES);
    return ctx.moveTo.mock.calls.length;
  }

  it("draws the crosshair (extra moveTo calls) when the pointer is over the price pane", () => {
    const base = baselineMoveToCount();
    const { canvas, ctx } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, OPTS).setData(CANDLES);
    ctx.moveTo.mockClear(); // isolate the mousemove-triggered render from setData's own, same as the zoom tests above
    // x=100 keeps this off the price-ruler strip (x >= 436); y=100 is well
    // within the price pane's [0, 220.8) span.
    getListener(canvas, "mousemove")({ clientX: 100, clientY: 100 });
    expect(ctx.moveTo.mock.calls.length).toBeGreaterThan(base);
  });

  it("does not draw the crosshair over the volume pane - its y-axis is volume, not price, so a price readout there would be wrong", () => {
    const base = baselineMoveToCount();
    const { canvas, ctx } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, OPTS).setData(CANDLES);
    ctx.moveTo.mockClear(); // isolate the mousemove-triggered render from setData's own
    // y=240 is inside the volume pane's [220.8, 276) span, and short of
    // isOverTimeAxis()'s hit-slop (which starts at y=266), so this is
    // unambiguously "over the volume pane," not "close to the time axis."
    getListener(canvas, "mousemove")({ clientX: 100, clientY: 240 });
    expect(ctx.moveTo.mock.calls.length).toBe(base);
  });

  it("does not draw the crosshair over the price-ruler strip", () => {
    const base = baselineMoveToCount();
    const { canvas, ctx } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, OPTS).setData(CANDLES);
    ctx.moveTo.mockClear(); // isolate the mousemove-triggered render from setData's own
    // x=450 is inside the price-ruler strip [436, 500); y=100 would
    // otherwise be well within the price pane's own height.
    getListener(canvas, "mousemove")({ clientX: 450, clientY: 100 });
    expect(ctx.moveTo.mock.calls.length).toBe(base);
  });

  it("does not draw the crosshair over the time-axis label strip", () => {
    const base = baselineMoveToCount();
    const { canvas, ctx } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, OPTS).setData(CANDLES);
    ctx.moveTo.mockClear(); // isolate the mousemove-triggered render from setData's own
    // y=280 is inside the time-axis strip itself (y >= 276); x=100 keeps
    // this off the price-ruler strip.
    getListener(canvas, "mousemove")({ clientX: 100, clientY: 280 });
    expect(ctx.moveTo.mock.calls.length).toBe(base);
  });

  it("hides the crosshair the instant the pointer crosses from the price pane into the volume pane, even though a pan drag would keep going", () => {
    const { canvas, ctx } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, OPTS).setData(CANDLES);

    getListener(canvas, "mousemove")({ clientX: 100, clientY: 100 }); // price pane - crosshair on
    ctx.moveTo.mockClear(); // isolate the *next* render's own calls, same reason the zoom tests above clear before reading
    getListener(canvas, "mousemove")({ clientX: 100, clientY: 100 }); // re-fire at the same spot for an isolated "crosshair on" render
    const withCrosshair = ctx.moveTo.mock.calls.length;

    ctx.moveTo.mockClear();
    getListener(canvas, "mousemove")({ clientX: 100, clientY: 240 }); // volume pane - crosshair off
    expect(ctx.moveTo.mock.calls.length).toBeLessThan(withCrosshair);
  });
});

describe("ChartCore price/time zoom (wheel and drag)", () => {
  // Both a price ruler strip (showCurrentPriceLine, not showPriceAxis -
  // avoids PriceAxis's own tick-label fillRect calls polluting the
  // candle-count assertions below) and enough candles that the visible
  // window doesn't already cover the whole buffer - a wheel/drag zoom
  // wouldn't visibly change anything on a window that's already "show
  // everything."
  // showTimeAxis: false keeps this describe block's index/count math
  // isolated from the time-axis label strip + footer separator (a
  // separate feature under test in TimeAxis.test.ts) - the vertical
  // time-gridlines Grid draws are unconditional, though (see
  // ChartOptions.barAreaWidthRatio's own doc comment), so those still
  // count below regardless of this flag.
  const AXIS_OPTS = { volumePaneRatio: 0, showPriceAxis: false, showCurrentPriceLine: true, showTimeAxis: false } as const;
  const SIXTY_CANDLES = Array.from({ length: 60 }, (_, i) => makeCandle(i));
  // Grid's 5 horizontal gridlines (indices 0-4) + 5 vertical time-gridlines
  // (indices 5-9, unconditional) + 1 axis separator (index 10, drawn
  // whenever a price-ruler strip is shown, which AXIS_OPTS always does
  // here) puts the first visible candle's wick at index 11 - see
  // wickSpanAt's doc comment. Always read right after clearing
  // moveTo/lineTo (see the comment at each call site) so index 11 means
  // "this render," not some earlier one accumulated in the same mock.
  const FIRST_WICK_INDEX = 11;
  // Canvas is 500 wide, axisWidth defaults to 64, on the right - so the
  // price-ruler strip spans x in [436, 500) and the chart body spans
  // [0, 436).
  const PRICE_AXIS_X = 450;
  const CHART_BODY_X = 100;

  it("wheel over the price-ruler strip zooms the price scale (taller wicks) without changing which candles are visible", () => {
    const { canvas: canvasBase, ctx: ctxBase, fillRectCalls: fillsBase } = mockCanvas();
    new ChartCore(canvasBase as HTMLCanvasElement, AXIS_OPTS).setData([0, 1, 2, 3, 4].map(makeCandle));

    const { canvas: canvasZoomed, ctx: ctxZoomed, fillRectCalls: fillsZoomed } = mockCanvas();
    new ChartCore(canvasZoomed as HTMLCanvasElement, AXIS_OPTS).setData([0, 1, 2, 3, 4].map(makeCandle));
    // render() rebuilds everything from scratch every call and these mock
    // ctx/fillRectCalls accumulate across every one (see the setOptions
    // suite above) - clear here so what's read below is only the single
    // render the wheel event below triggers, not that plus setData's.
    ctxZoomed.moveTo.mockClear();
    ctxZoomed.lineTo.mockClear();
    fillsZoomed.length = 0;

    getListener(canvasZoomed, "wheel")({
      clientX: PRICE_AXIS_X,
      clientY: 150,
      deltaY: -100, // scroll up = zoom in
      preventDefault: jest.fn(),
    });

    expect(wickSpanAt(ctxZoomed, FIRST_WICK_INDEX)).toBeGreaterThan(wickSpanAt(ctxBase, FIRST_WICK_INDEX));
    // Same 5 candles visible either way - background + tag + 5 bodies.
    expect(fillsZoomed).toHaveLength(1 + 1 + 5);
  });

  it("wheel over the chart body zooms the time axis (visible candle count changes)", () => {
    const { canvas: canvasBase, fillRectCalls: fillsBase } = mockCanvas();
    new ChartCore(canvasBase as HTMLCanvasElement, AXIS_OPTS).setData(SIXTY_CANDLES);
    // defaultVisibleCount() = floor(barAreaWidth / (candleWidth + candleGap))
    // = floor(((500 - 64) * 0.75) / (6 + 3)) = floor(327 / 9) = 36, so with
    // 60 candles loaded the window opens already-scrolled: 37 candles visible.
    expect(fillsBase).toHaveLength(1 + 1 + 37);

    const { canvas: canvasZoomed, fillRectCalls: fillsZoomed } = mockCanvas();
    new ChartCore(canvasZoomed as HTMLCanvasElement, AXIS_OPTS).setData(SIXTY_CANDLES);
    fillsZoomed.length = 0; // isolate the wheel-triggered render from setData's own

    getListener(canvasZoomed, "wheel")({
      clientX: CHART_BODY_X,
      clientY: 150,
      deltaY: 100, // scroll down = zoom out
      preventDefault: jest.fn(),
    });

    // Zoom now scales candle *pixel size*, not the index window directly
    // (see zoom()'s own doc comment): oldCount 37 -> center 23 + 37/2 =
    // 41.5; timeZoomFactor 1 -> clamp(1/1.1, 0.1, 10) = 0.9090... (zoom
    // *out* shrinks timeZoomFactor - see zoom()'s own doc comment for why
    // that's the inverse of zoomPrice()'s multiply) -> zoomedStep =
    // 9*0.9090... = 8.1818... ; newCount = floor(327/8.1818...) =
    // floor(39.97) = 39 -> newStart round(41.5 - 19.5) = 22, clamped to
    // [0, 21] = 21 -> newEnd min(59, 21+39-1=59) = 59 -> 39 candles
    // visible, each drawn thinner than before (zoomedCandleWidth
    // 6*0.909=5.45, crisp-rounded to 5, vs the base 6) - "zoom out"
    // fitting more, smaller candles into the same space. Wheel never
    // touches crosshairPos, so no crosshair labels to account for here.
    expect(fillsZoomed).toHaveLength(1 + 1 + 39);
  });

  it("a horizontally-dominant wheel event over the chart body pans (same width) instead of zooming - the trackpad-swipe bug handleWheel's doc comment describes", () => {
    const { canvas } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, AXIS_OPTS);
    chart.setData(SIXTY_CANDLES);
    // Same starting viewport as the click-drag pan test above.
    expect(chart.getViewport()).toMatchObject({ startIndex: 23, endIndex: 59 });

    // deltaX dominant over deltaY (0 here, like a horizontal trackpad
    // swipe reports) is the signal this is a pan gesture, not a scroll-
    // wheel zoom tick - see handleWheel's own doc comment. deltaCandles =
    // round(-90 / zoomedStep()) = round(-90/9) = -10 -> panByCandles(-10)
    // -> startIndex clamp(23-10, 0, 23) = 13, endIndex 13+36 = 49 - same
    // 36-wide window as before, proving this panned rather than zoomed
    // (contrast the vertical-deltaY wheel test above, whose window width
    // *does* change).
    getListener(canvas, "wheel")({
      clientX: CHART_BODY_X,
      clientY: 150,
      deltaX: -90,
      deltaY: 0,
      preventDefault: jest.fn(),
    });

    expect(chart.getViewport()).toMatchObject({ startIndex: 13, endIndex: 49 });
  });

  it("a vertically-dominant wheel event over the chart body still zooms, even with a nonzero deltaX (a real mouse wheel rarely reports exactly 0)", () => {
    const { canvas } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, AXIS_OPTS);
    chart.setData(SIXTY_CANDLES);
    const before = chart.getViewport();

    getListener(canvas, "wheel")({
      clientX: CHART_BODY_X,
      clientY: 150,
      deltaX: 2, // present but small - deltaY still dominates
      deltaY: 100,
      preventDefault: jest.fn(),
    });

    const after = chart.getViewport();
    // A zoom changes the window's width; a pan (wrongly triggered here)
    // would only shift startIndex/endIndex together, leaving the width
    // unchanged - see the pan test just above for that contrast.
    expect(after.endIndex - after.startIndex).not.toBe(before.endIndex - before.startIndex);
  });

  it("drag over the price-ruler strip zooms the price scale, the same as wheel does", () => {
    const { canvas: canvasBase, ctx: ctxBase } = mockCanvas();
    new ChartCore(canvasBase as HTMLCanvasElement, AXIS_OPTS).setData([0, 1, 2, 3, 4].map(makeCandle));

    const { canvas: canvasZoomed, ctx: ctxZoomed } = mockCanvas();
    new ChartCore(canvasZoomed as HTMLCanvasElement, AXIS_OPTS).setData([0, 1, 2, 3, 4].map(makeCandle));
    ctxZoomed.moveTo.mockClear(); // isolate the drag's own render, same reason as the wheel test above
    ctxZoomed.lineTo.mockClear();

    getListener(canvasZoomed, "mousedown")({ clientX: PRICE_AXIS_X, clientY: 200, preventDefault: jest.fn() });
    // Dragged up 50px - per handleMouseMove's doc comment, up zooms in.
    getListener(canvasZoomed, "mousemove")({ clientX: PRICE_AXIS_X, clientY: 150 });

    expect(wickSpanAt(ctxZoomed, FIRST_WICK_INDEX)).toBeGreaterThan(wickSpanAt(ctxBase, FIRST_WICK_INDEX));
  });

  it("drag over the chart body pans the visible window (same width) instead of zooming it", () => {
    const { canvas } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, AXIS_OPTS);
    chart.setData(SIXTY_CANDLES);
    // defaultVisibleCount() = 36 (see the wheel test above), so the window
    // opens already-scrolled: startIndex max(0, 59-36) = 23, endIndex 59.
    expect(chart.getViewport()).toMatchObject({ startIndex: 23, endIndex: 59 });

    getListener(canvas, "mousedown")({ clientX: CHART_BODY_X, clientY: 50, preventDefault: jest.fn() });
    // Dragged right 50px. Unlike the exponential price/time-axis zoom
    // drags above, a pan drag is linear and anchor-based (see
    // handleMouseMove's own doc comment on why): deltaCandles =
    // round(50 / (candleWidth + candleGap)) = round(50/9) = 6, so
    // panByCandles(startIndex-at-mousedown - 6 - current startIndex) =
    // panByCandles(23 - 6 - 23) = panByCandles(-6) -> startIndex
    // clamp(23-6, 0, 23) = 17, endIndex 53 - same width (36) as before,
    // proving this panned rather than zoomed.
    getListener(canvas, "mousemove")({ clientX: CHART_BODY_X + 50, clientY: 50 });

    expect(chart.getViewport()).toMatchObject({ startIndex: 17, endIndex: 53 });
  });

  it("drag straight down over the chart body pans the price range toward higher prices - even past every visible candle's own high", () => {
    const { canvas } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, AXIS_OPTS);
    chart.setData(SIXTY_CANDLES);
    // Auto-fit over the initial window (startIndex 23, endIndex 59): low
    // bottoms out at candle 23's low (23-1=22), high tops out at candle
    // 59's high (59+1=60) - see makeCandle(). mid (22+60)/2=41, halfRange
    // (60-22)/2=19 -> [22, 60], matching the "wheel over the price-ruler
    // strip" test's own read of this same auto-fit shape.
    expect(chart.getViewport()).toMatchObject({ minPrice: 22, maxPrice: 60 });

    getListener(canvas, "mousedown")({ clientX: CHART_BODY_X, clientY: 50, preventDefault: jest.fn() });
    // x unchanged (100 both times) - purely vertical, so this drag's
    // horizontal half is inert (deltaCandles 0) and only pricePanOffset
    // moves. priceHeight is the full canvas height here (300 - no time
    // axis, no volume pane in AXIS_OPTS), so pricePerPixel = (60-22)/300
    // = 38/300. Dragged down 150px: pricePanOffset = 0 + 150*(38/300) =
    // 19 exactly - see handleMouseMove's "pan" branch doc comment for
    // why *down* means *higher* prices (content follows the pointer,
    // same convention the horizontal pan already uses). New mid
    // 41+19=60, same halfRange 19 -> [41, 79] - a 79 high is above every
    // real candle's own high (60, at candle 59) - genuinely empty space
    // above the data, exactly what this drag exists to reach.
    getListener(canvas, "mousemove")({ clientX: CHART_BODY_X, clientY: 200 });

    const after = chart.getViewport();
    expect(after).toMatchObject({ startIndex: 23, endIndex: 59, minPrice: 41, maxPrice: 79 });
    // Same 38-wide range as before the drag - a pan, not a zoom.
    expect(after.maxPrice - after.minPrice).toBe(38);
  });

  it("drag straight up over the chart body pans the price range toward lower prices, unbounded by the data (unlike the horizontal pan)", () => {
    const { canvas } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, AXIS_OPTS);
    chart.setData(SIXTY_CANDLES);

    getListener(canvas, "mousedown")({ clientX: CHART_BODY_X, clientY: 200, preventDefault: jest.fn() });
    // Dragged up 150px (200 -> 50): pricePanOffset = 0 + (-150)*(38/300)
    // = -19. New mid 41-19=22, same halfRange 19 -> [3, 41] - unlike
    // panByCandles()'s index clamp (which stops at startIndex 0), there's
    // no floor here at all; a price of 3 is well below candle 23's own
    // low (22), the same "empty space" this pan is meant to reach, just
    // in the other direction.
    getListener(canvas, "mousemove")({ clientX: CHART_BODY_X, clientY: 50 });

    expect(chart.getViewport()).toMatchObject({ startIndex: 23, endIndex: 59, minPrice: 3, maxPrice: 41 });
  });

  it("scrollToLatest() returns to the most recent candles and resets any vertical pan, preserving window width and zoom level", () => {
    const { canvas } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, AXIS_OPTS);
    chart.setData(SIXTY_CANDLES);
    expect(chart.getViewport()).toMatchObject({ startIndex: 23, endIndex: 59, minPrice: 22, maxPrice: 60 });

    // One drag, panned both ways at once: horizontally 6 candles back
    // (same x delta as the "click-drag over the chart body pans" test
    // above) and vertically to pricePanOffset 19 (same y delta as "drag
    // straight down" above) - scrollToLatest() below needs to undo both.
    getListener(canvas, "mousedown")({ clientX: CHART_BODY_X, clientY: 50, preventDefault: jest.fn() });
    getListener(canvas, "mousemove")({ clientX: CHART_BODY_X + 50, clientY: 200 });
    const dragged = chart.getViewport();
    expect(dragged.endIndex).not.toBe(59); // panned into history
    expect(dragged.minPrice).not.toBe(22); // and panned vertically too

    chart.scrollToLatest();

    // Back to exactly the same window setData() itself produced: same
    // 36-wide index range ending at the buffer's own last candle, and the
    // same auto-fit price range that window has with pricePanOffset back
    // at 0 - proving both the horizontal and vertical pan were undone,
    // not just one of them.
    expect(chart.getViewport()).toMatchObject({ startIndex: 23, endIndex: 59, minPrice: 22, maxPrice: 60 });
  });

  it("keeps panning even if the pointer wanders into the price-ruler strip mid-drag - the gesture is decided once, at mousedown", () => {
    const { canvas } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, AXIS_OPTS);
    chart.setData(SIXTY_CANDLES);

    // Drag starts over the chart body, close to the axis boundary (x=436)...
    getListener(canvas, "mousedown")({ clientX: 400, clientY: 50, preventDefault: jest.fn() });
    // ...then wanders onto the price-ruler strip, the same 50px move the
    // dedicated pan-drag test above uses. Still a pan drag, since that was
    // decided by where the drag *started* (`dragMode` is set once, in
    // `handleMouseDown`, and never reconsidered mid-drag) - same
    // deltaCandles = round(50/9) = 6, same resulting viewport as the
    // dedicated pan-drag test above.
    getListener(canvas, "mousemove")({ clientX: 450, clientY: 50 });

    expect(chart.getViewport()).toMatchObject({ startIndex: 17, endIndex: 53 });
  });

  it("drag over the time-axis label strip zooms the time axis - the gesture that used to live on the chart body, now relocated there", () => {
    const { canvas } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, { ...AXIS_OPTS, showTimeAxis: true });
    chart.setData(SIXTY_CANDLES);
    const before = chart.getViewport();

    // timeAxisHeight defaults to 24, canvas is 300 tall - strip spans y
    // in [276, 300); x=100 keeps this off the price-ruler strip.
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 290, preventDefault: jest.fn() });
    getListener(canvas, "mousemove")({ clientX: 150, clientY: 290 });

    const after = chart.getViewport();
    // A time-zoom drag narrows/widens the window (see zoom()'s own doc
    // comment); a pan drag would only shift startIndex/endIndex together,
    // leaving the width unchanged (see the pan tests above) - so a
    // changed width is what distinguishes "this zoomed" from "this panned".
    expect(after.endIndex - after.startIndex).not.toBe(before.endIndex - before.startIndex);
  });

  it("zoom() actually grows/shrinks each candle's own drawn width, not just how many indices are nominally visible - the bug this method's whole design was rewritten to fix", () => {
    const { canvas: canvasBase, fillRectCalls: fillsBase } = mockCanvas();
    new ChartCore(canvasBase as HTMLCanvasElement, AXIS_OPTS).setData(SIXTY_CANDLES);
    // index 0 is the full-canvas background fillRect; index 1 is the
    // first visible candle body's own fillRect (`[x, y, width, height]`)
    // - drawCandles() runs before CurrentPriceLine's tag in render(), so
    // the tag (if any) lands after every body, not before.
    const baseWidth = fillsBase[1][2] as number;

    const { canvas: canvasZoomedIn, fillRectCalls: fillsZoomedIn } = mockCanvas();
    const chartZoomedIn = new ChartCore(canvasZoomedIn as HTMLCanvasElement, AXIS_OPTS);
    chartZoomedIn.setData(SIXTY_CANDLES);
    chartZoomedIn.zoom(0.5); // <1 zooms in - each candle should grow
    fillsZoomedIn.length = 0;
    chartZoomedIn.render();
    const zoomedInWidth = fillsZoomedIn[1][2] as number;

    const { canvas: canvasZoomedOut, fillRectCalls: fillsZoomedOut } = mockCanvas();
    const chartZoomedOut = new ChartCore(canvasZoomedOut as HTMLCanvasElement, AXIS_OPTS);
    chartZoomedOut.setData(SIXTY_CANDLES);
    chartZoomedOut.zoom(2); // >1 zooms out - each candle should shrink
    fillsZoomedOut.length = 0;
    chartZoomedOut.render();
    const zoomedOutWidth = fillsZoomedOut[1][2] as number;

    expect(zoomedInWidth).toBeGreaterThan(baseWidth);
    expect(zoomedOutWidth).toBeLessThan(baseWidth);
  });
});

describe("ChartCore.setOptions", () => {
  it("re-renders immediately with the newly merged options - e.g. turning the grid/axis separator on after construction", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, {
      volumePaneRatio: 0,
      showPriceAxis: false,
      showCurrentPriceLine: false,
      showTimeAxis: false, // isolate this test from the footer separator's own moveTo/lineTo pair
    });
    chart.setData([makeCandle(0), makeCandle(1)]);
    // render() rebuilds everything from scratch every call (see its own
    // doc comment), so moveTo/lineTo call counts accumulate across every
    // render rather than reflecting only the latest one - clear here so
    // what's asserted below is exactly what setOptions's own render adds.
    ctx.moveTo.mockClear();
    ctx.lineTo.mockClear();

    chart.setOptions({ showPriceAxis: true });

    // One render's worth of moveTo/lineTo calls with the axis on: 5
    // horizontal gridlines + 5 vertical time-gridlines (unconditional) + 2
    // candle wicks + 1 grid/axis separator = 13 of each - confirms
    // setOptions both re-renders and actually applied the change.
    expect(ctx.moveTo.mock.calls.length).toBe(13);
    expect(ctx.lineTo.mock.calls.length).toBe(13);
  });

  it("merges partial options, leaving every option not mentioned unchanged", () => {
    const { canvas, fillRectCalls } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, {
      volumePaneRatio: 0,
      showPriceAxis: false,
      showCurrentPriceLine: false,
      showTimeAxis: false, // isolate this test from TimeAxis's own fillRect calls
      gridBackgroundColor: "#111318",
    });
    chart.setData([makeCandle(0), makeCandle(1)]);

    fillRectCalls.length = 0;
    chart.setOptions({ upColor: "#0f0" }); // an unrelated option
    // gridBackgroundColor set at construction is still in effect -
    // canvas background + grid background + 2 candle bodies, same as before.
    expect(fillRectCalls).toHaveLength(1 + 1 + 2);
  });

  it("re-fits the visible window when barAreaWidthRatio changes, unlike every other option (see this method's own doc comment)", () => {
    const { canvas } = mockCanvas();
    // volumePaneRatio 0/showTimeAxis false -> priceHeight/plotWidth math
    // stays simple; showPriceAxis true just to have a real axisWidth (64)
    // reserved, same 500x300 canvas every other test in this file uses.
    const chart = new ChartCore(canvas as HTMLCanvasElement, {
      volumePaneRatio: 0,
      showPriceAxis: true,
      showCurrentPriceLine: false,
      showTimeAxis: false,
    });
    chart.setData(Array.from({ length: 60 }, (_, i) => makeCandle(i)));
    const before = chart.getViewport();
    // plotWidth 436, barAreaWidth 436*0.75=327, default candleWidth(6)+
    // candleGap(3)=9 step -> defaultVisibleCount() floor(327/9)=36 ->
    // setData()'s own startIndex = endIndex(59) - 36 = 23, a 37-candle
    // window (23..59 inclusive) - confirms setData() itself used the
    // *default* 75% before this test changes it.
    expect(before).toMatchObject({ startIndex: 23, endIndex: 59 });

    chart.setOptions({ barAreaWidthRatio: 0.5 });

    // barAreaWidth now 436*0.5=218 -> visibleCountAtZoom() floor(218/9)=24
    // candles fit - a narrower window than before, applied *immediately*
    // (no setData()/applyUpdate() call in between) - the bug this test
    // guards against: TimeScale.indexToX() never reads barAreaWidth at
    // all (only defaultVisibleCount()/visibleCountAtZoom() do), so
    // leaving the window untouched here would make this setting silently
    // do nothing to an already-loaded chart. recenterWindow(24) keeps the
    // window centered where it already was (center 23+37/2=41.5) rather
    // than anchoring to either edge: startIndex round(41.5-12)=30,
    // clamped to [0, 60-24=36] -> 30; endIndex min(59, 30+24-1)=53.
    expect(chart.getViewport()).toMatchObject({ startIndex: 30, endIndex: 53 });
  });

  it("does nothing extra when barAreaWidthRatio is set to the value it already was", () => {
    const { canvas } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, { volumePaneRatio: 0, showTimeAxis: false });
    chart.setData(Array.from({ length: 60 }, (_, i) => makeCandle(i)));
    const before = chart.getViewport();

    chart.setOptions({ barAreaWidthRatio: 0.75 }); // DEFAULT_OPTIONS' own value - a no-op change

    expect(chart.getViewport()).toEqual(before);
  });
});

describe("ChartCore price-pane clipping", () => {
  it("clips price-pane content to exactly the price pane's own rectangle - plotOffsetX/0/plotWidth/priceHeight", () => {
    const { canvas, ctx } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, {
      volumePaneRatio: 0,
      showPriceAxis: true,
      showCurrentPriceLine: false,
      showTimeAxis: false,
    }).setData([makeCandle(0), makeCandle(1)]);

    // mockCanvas() is 500x300 (see its own comment). Price axis on the
    // right (the default) at its default 64px width -> plotOffsetX 0,
    // plotWidth 500-64=436; no volume pane and no time-axis strip
    // reserved here -> priceHeight the full 300 (see plotLayout()'s own
    // comment for this bottom-up math) - the exact rectangle render()
    // clips price-pane content to, so a candle/gridline/price-line panned
    // (see pricePanOffset's own doc comment) out of it stops drawing
    // instead of bleeding into the volume pane or the price-ruler strip.
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 436, 300);
    expect(ctx.clip).toHaveBeenCalled();
  });

  it("still draws the volume pane, unclipped, even though it sits entirely below the price pane's own clip rectangle", () => {
    const { canvas, fillRectCalls } = mockCanvas();
    new ChartCore(canvas as HTMLCanvasElement, {
      volumePaneRatio: 0.2,
      showPriceAxis: false,
      showCurrentPriceLine: false,
      showTimeAxis: false,
    }).setData([makeCandle(0), makeCandle(1)]);

    // canvas background + 2 candle bodies + 2 volume bars - the volume
    // bars are what prove the price-pane clip (scoped to y < priceHeight,
    // well above where the volume pane starts) never reaches them, the
    // same way the earlier "draws the footer separator" test counts
    // fillRect calls to isolate one piece of render() from the rest.
    expect(fillRectCalls).toHaveLength(1 + 2 + 2);
  });

  it("draws the price/ruler separator with the price-pane clip released - the regression this fix closes", () => {
    // A clip-aware mock, local to this one test: the shared mockCanvas()
    // helper's ctx.clip()/save()/restore() are plain jest.fn() no-ops
    // (correct for every other test here, which only cares *what* got
    // asked for, not whether a real canvas would actually have clipped
    // it) - this test is different, because the bug it guards against
    // (the separator drawn *inside* Grid's own separatorX, before this
    // fix moved it out - see render()'s own comment) only breaks
    // rendering visually, in a way a plain moveTo/lineTo-args assertion
    // can't tell apart from the fixed version: both draw the exact same
    // (436.5, 0)-(436.5, 300) line either way. Tracking a real clip stack
    // is the only way to actually distinguish "drawn while clipped" from
    // "drawn after the clip released."
    const clipStack: boolean[] = [false];
    let separatorWasClipped: boolean | undefined;
    const ctx: any = {
      save: jest.fn(() => clipStack.push(clipStack[clipStack.length - 1])),
      restore: jest.fn(() => {
        if (clipStack.length > 1) clipStack.pop();
      }),
      beginPath: jest.fn(),
      rect: jest.fn(),
      clip: jest.fn(() => {
        clipStack[clipStack.length - 1] = true;
      }),
      moveTo: jest.fn((x: number, y: number) => {
        // (436.5, 0) is the separator's own crispLine(axisX) position
        // for this test's 500x300/64px-axis setup (see the clip-geometry
        // test above) - distinct from every gridline/wick/candle moveTo,
        // none of which land exactly there (see this test's own inline
        // reasoning below for why that's safe to rely on).
        if (x === 436.5 && y === 0) separatorWasClipped = clipStack[clipStack.length - 1];
      }),
      lineTo: jest.fn(),
      closePath: jest.fn(),
      fill: jest.fn(),
      stroke: jest.fn(),
      setLineDash: jest.fn(),
      strokeRect: jest.fn(),
      fillRect: jest.fn(),
      fillText: jest.fn(),
      measureText: jest.fn(() => ({ width: 10 })),
      setTransform: jest.fn(),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
    };
    const canvas: any = {
      clientWidth: 500,
      clientHeight: 300,
      width: 0,
      height: 0,
      style: {},
      getContext: () => ctx,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    };

    new ChartCore(canvas, {
      volumePaneRatio: 0,
      showPriceAxis: true,
      showCurrentPriceLine: false,
      showTimeAxis: false,
    }).setData([makeCandle(0), makeCandle(1)]);

    // toBe(false), not toBeFalsy() - `undefined` (the separator's moveTo
    // never firing at all, e.g. a coordinate regression) must fail this
    // test just as loudly as `true` (drawn while still clipped) would.
    expect(separatorWasClipped).toBe(false);
  });
});

describe("ChartCore.applyUpdate", () => {
  it("appends a genuinely new bar past the end of the buffer", () => {
    const { canvas, fillRectCalls } = mockCanvas();
    const chart = newChart(canvas);
    chart.setData([makeCandle(0), makeCandle(1)]);

    fillRectCalls.length = 0;
    chart.applyUpdate({ candle: makeCandle(2), index: 2, final: true });
    expect(fillRectCalls).toHaveLength(1 + 3); // background + 3 candle bodies
  });

  it("overwrites the bar at the buffer's last index in place while it's still forming", () => {
    const { canvas, fillRectCalls } = mockCanvas();
    const chart = newChart(canvas);
    chart.setData([makeCandle(0), makeCandle(1)]);
    chart.applyUpdate({ candle: makeCandle(2), index: 2, final: false }); // buffer now [0, 1, 2]

    fillRectCalls.length = 0;
    chart.applyUpdate({ candle: makeCandle(2), index: 2, final: true }); // same index — locks in place
    expect(fillRectCalls).toHaveLength(1 + 3); // still 3 bars, not 4
  });

  it("drops every bar ahead of index when the caller steps backward — the fix for the 'prev renders the previous bar in front of the current one' bug", () => {
    const { canvas, fillRectCalls } = mockCanvas();
    const chart = newChart(canvas);
    chart.setData([0, 1, 2, 3].map(makeCandle)); // buffer [0, 1, 2, 3]

    fillRectCalls.length = 0;
    chart.applyUpdate({ candle: makeCandle(2), index: 2, final: true }); // step back once: drop bar 3
    expect(fillRectCalls).toHaveLength(1 + 3); // [0, 1, 2]

    fillRectCalls.length = 0;
    chart.applyUpdate({ candle: makeCandle(1), index: 1, final: true }); // step back again: drop bar 2
    expect(fillRectCalls).toHaveLength(1 + 2); // [0, 1]
  });

  it("re-appends bars correctly after a step backward, once the caller steps forward again", () => {
    const { canvas, fillRectCalls } = mockCanvas();
    const chart = newChart(canvas);
    chart.setData([0, 1, 2, 3].map(makeCandle));
    chart.applyUpdate({ candle: makeCandle(2), index: 2, final: true }); // step back: buffer [0, 1, 2]
    chart.applyUpdate({ candle: makeCandle(1), index: 1, final: true }); // step back: buffer [0, 1]

    fillRectCalls.length = 0;
    chart.applyUpdate({ candle: makeCandle(2), index: 2, final: true }); // step forward: re-add bar 2
    expect(fillRectCalls).toHaveLength(1 + 3); // [0, 1, 2]

    fillRectCalls.length = 0;
    chart.applyUpdate({ candle: makeCandle(3), index: 3, final: true }); // step forward: re-add bar 3
    expect(fillRectCalls).toHaveLength(1 + 4); // [0, 1, 2, 3]
  });
});

describe("ChartCore drawing tools (click-to-place-point, multi-instance, selection/delete)", () => {
  it("a click over the price pane with no active tool does not place any drawing (existing pan/zoom/crosshair behavior only)", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    chart.setData([0, 1, 2].map(makeCandle));

    getListener(canvas, "mousedown")({ clientX: 50, clientY: 50, preventDefault: jest.fn() });

    const placedLine = ctx.moveTo.mock.calls.some(([x]: [number]) => x === -LONG_SPAN);
    expect(placedLine).toBe(false);
  });

  it("a click over the price pane WITH an active 1-point tool completes it immediately, rendering it at the clicked spot", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    // 60 candles (not 3) so a plausible click x - CHART_BODY_X's own
    // 100, same "safely inside the visible range" x the pan-drag tests
    // above use - actually lands on a loaded candle. With only a
    // handful of candles loaded, most x positions resolve past the
    // buffer's own end (xToIndex()'s nearest-candle math has nothing to
    // clamp to), which is exactly the "no candle under the pointer"
    // case pointFromPixel() is documented to return null for - correct
    // behavior, just not what this test means to exercise.
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("horizontal-line");

    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });

    const placedLine = ctx.moveTo.mock.calls.some(
      ([x, y]: [number, number]) => x === -LONG_SPAN && ctx.lineTo.mock.calls.some(([lx, ly]: [number, number]) => lx === LONG_SPAN && ly === y)
    );
    expect(placedLine).toBe(true);
  });

  it("two separate placements of the same tool type both persist - the second does not replace the first", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("horizontal-line");

    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    ctx.moveTo.mockClear();
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 120, preventDefault: jest.fn() });

    // The render triggered by the second click draws every completed
    // drawing, including the first one placed before the mock was
    // cleared - two distinct horizontal-line y positions means both are
    // still on screen, not just the newest one.
    const horizontalLineYs = new Set(
      ctx.moveTo.mock.calls.filter(([x]: [number]) => x === -LONG_SPAN).map(([, y]: [number, number]) => y)
    );
    expect(horizontalLineYs.size).toBe(2);
  });

  it("stays on the same tool after a placement completes - a second click keeps placing, it doesn't need the tool reselected", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("vertical-line");

    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    ctx.moveTo.mockClear();
    getListener(canvas, "mousedown")({ clientX: 150, clientY: 50, preventDefault: jest.fn() });

    const placedSecondLine = ctx.moveTo.mock.calls.some(([, y]: [number, number]) => y === -LONG_SPAN);
    expect(placedSecondLine).toBe(true);
  });

  it("Trendline: the first click places an anchor dot with no segment yet; the second completes the line", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("trendline");

    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    expect(ctx.arc).toHaveBeenCalled(); // the anchor "pointer" the first click adds

    ctx.arc.mockClear();
    getListener(canvas, "mousedown")({ clientX: 150, clientY: 100, preventDefault: jest.fn() });
    // Once complete, the segment is drawn as a plain solid stroke - no
    // anchor dot for a finished line (see Trendline's own doc comment).
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("Trendline: hovering after the first click sets a dashed rubber-band preview toward the pointer", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("trendline");

    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    ctx.setLineDash.mockClear();
    getListener(canvas, "mousemove")({ clientX: 150, clientY: 100 });

    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
  });

  it("hovering with a 1-point tool active draws a dashed ghost preview at the hovered position before any click", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("horizontal-line");

    getListener(canvas, "mousemove")({ clientX: 100, clientY: 60 });

    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    const ghostDrawn = ctx.moveTo.mock.calls.some(([x]: [number]) => x === -LONG_SPAN);
    expect(ghostDrawn).toBe(true);
  });

  it("shows a 'crosshair' cursor over the price pane both while a tool is active and once deactivated (plain pan/cross mode uses the same hover cursor)", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("horizontal-line");

    getListener(canvas, "mousemove")({ clientX: 100, clientY: 60 });
    expect(canvas.style.cursor).toBe("crosshair");

    chart.setActiveDrawingTool(null);
    getListener(canvas, "mousemove")({ clientX: 100, clientY: 60 });
    expect(canvas.style.cursor).toBe("crosshair");
  });

  it("does NOT start a pan drag while a tool is active - the viewport is unchanged by a mousedown+mousemove that would otherwise pan", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    const before = chart.getViewport();

    chart.setActiveDrawingTool("horizontal-line");
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    // Same drag a real pan-drag test elsewhere in this file (100 -> 150)
    // confirms moves the window when no tool is active.
    getListener(canvas, "mousemove")({ clientX: 150, clientY: 50 });

    expect(chart.getViewport()).toMatchObject({ startIndex: before.startIndex, endIndex: before.endIndex });
  });

  it("setActiveDrawingTool(null) (the 'cross' tool) restores plain pan-drag behavior and stops placing points", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    const before = chart.getViewport();

    chart.setActiveDrawingTool("vertical-line");
    chart.setActiveDrawingTool(null); // back to "cross" - normal pan/zoom/crosshair

    ctx.moveTo.mockClear();
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    getListener(canvas, "mousemove")({ clientX: 150, clientY: 50 });

    const placedLine = ctx.moveTo.mock.calls.some(([, y]: [number, number]) => y === -LONG_SPAN);
    expect(placedLine).toBe(false); // never placed a point
    expect(chart.getViewport()).not.toMatchObject({ startIndex: before.startIndex, endIndex: before.endIndex }); // did pan
  });

  it("a click outside the price pane (over the price-ruler strip) while a tool is active places no point", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = new ChartCore(canvas as HTMLCanvasElement, {
      volumePaneRatio: 0,
      showPriceAxis: true,
      showCurrentPriceLine: false,
      showTimeAxis: false,
    });
    chart.setData([0, 1, 2].map(makeCandle));
    chart.setActiveDrawingTool("horizontal-line");
    ctx.moveTo.mockClear();

    // Far right edge of a 500-wide canvas - inside the price-ruler strip
    // priceAxisPosition defaults to reserving there, well past the plot
    // area's own width.
    getListener(canvas, "mousedown")({ clientX: 495, clientY: 50, preventDefault: jest.fn() });

    const placedLine = ctx.moveTo.mock.calls.some(([x]: [number]) => x === -LONG_SPAN);
    expect(placedLine).toBe(false);
  });

  it("with the 'cross' tool active, clicking an already-placed drawing selects it instead of starting a pan drag", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);

    chart.setActiveDrawingTool("horizontal-line");
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 80, preventDefault: jest.fn() });
    chart.setActiveDrawingTool(null);

    const before = chart.getViewport();
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 80, preventDefault: jest.fn() }); // same spot as the placed line
    getListener(canvas, "mousemove")({ clientX: 250, clientY: 80 }); // would pan if the click had started one

    expect(chart.getViewport()).toMatchObject({ startIndex: before.startIndex, endIndex: before.endIndex });
  });

  it("a click away from any placed drawing with the 'cross' tool active clears selection and pans normally", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);

    chart.setActiveDrawingTool("horizontal-line");
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 80, preventDefault: jest.fn() });
    chart.setActiveDrawingTool(null);

    const before = chart.getViewport();
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 250, preventDefault: jest.fn() }); // far from the line's own y (80)
    getListener(canvas, "mousemove")({ clientX: 150, clientY: 250 });

    expect(chart.getViewport()).not.toMatchObject({ startIndex: before.startIndex, endIndex: before.endIndex });
  });

  it("deleteSelectedDrawing() removes exactly the selected drawing and no others", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);

    // Place two horizontal lines at different prices (y=80 and y=200).
    chart.setActiveDrawingTool("horizontal-line");
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 80, preventDefault: jest.fn() });
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 200, preventDefault: jest.fn() });
    chart.setActiveDrawingTool(null);

    // Select the one at y=80.
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 80, preventDefault: jest.fn() });

    ctx.moveTo.mockClear();
    chart.deleteSelectedDrawing();

    const remainingYs: number[] = ctx.moveTo.mock.calls.filter(([x]: [number]) => x === -LONG_SPAN).map(([, y]: [number, number]) => y);
    expect(remainingYs.some((y) => Math.abs(y - 80) < 1e-6)).toBe(false);
    expect(remainingYs.some((y) => Math.abs(y - 200) < 1e-6)).toBe(true);
  });

  it("deleteSelectedDrawing() is a harmless no-op when nothing is selected", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    chart.setData([0, 1, 2].map(makeCandle));
    expect(() => chart.deleteSelectedDrawing()).not.toThrow();
  });

  it("places a point in the empty margin PAST the last loaded candle - the whole price pane is drawable, not just where a candle exists", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    // Few enough candles, with the default barAreaWidthRatio, that a good
    // chunk of the pane's right side is genuinely empty margin rather
    // than candle body - x=450 (near the canvas's own right edge, well
    // inside the price pane bounds a 500-wide canvas with the default
    // right-side price-ruler strip leaves) lands there.
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("vertical-line");

    getListener(canvas, "mousedown")({ clientX: 450, clientY: 50, preventDefault: jest.fn() });

    const placedLine = ctx.moveTo.mock.calls.some(([, y]: [number, number]) => y === -LONG_SPAN);
    expect(placedLine).toBe(true);
  });

  it("a vertical line placed past the last candle renders at a consistently further-right x than one placed on the last candle - it doesn't get snapped back to the chart's current edge", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("vertical-line");

    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() }); // on a real candle
    ctx.moveTo.mockClear();
    getListener(canvas, "mousedown")({ clientX: 450, clientY: 50, preventDefault: jest.fn() }); // well past the last one

    const xsAtVerticalSpan = ctx.moveTo.mock.calls.filter(([, y]: [number, number]) => y === -LONG_SPAN).map(([x]: [number]) => x);
    // Both lines render on this frame (see the multi-instance tests
    // above) - the one just placed at x=450 must land further right than
    // the earlier one at x=100, not collapse onto the same x the way the
    // old endIndex-fallback behavior would have.
    expect(Math.max(...xsAtVerticalSpan)).toBeGreaterThan(Math.min(...xsAtVerticalSpan) + 50);
  });

  it("hovering past the last candle with a tool active still shows the ghost preview (and places a point there)", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("horizontal-line");

    getListener(canvas, "mousemove")({ clientX: 450, clientY: 60 });

    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    const ghostDrawn = ctx.moveTo.mock.calls.some(([x]: [number]) => x === -LONG_SPAN);
    expect(ghostDrawn).toBe(true);
  });

  it("trace tool: each click adds another connected point instead of completing - three clicks still leave it pending, drawn as an anchor/segments but not yet in the permanent drawings list", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("trace");

    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    getListener(canvas, "mousedown")({ clientX: 150, clientY: 100, preventDefault: jest.fn() });
    getListener(canvas, "mousedown")({ clientX: 200, clientY: 50, preventDefault: jest.fn() });

    // Still mid-placement (no finish() call yet) - a fourth click keeps
    // extending the same in-progress trace rather than starting a new one.
    ctx.stroke.mockClear();
    getListener(canvas, "mousedown")({ clientX: 250, clientY: 100, preventDefault: jest.fn() });
    expect(ctx.stroke).toHaveBeenCalled(); // the growing polyline is still being drawn as pendingDrawing
  });

  it("trace tool: double-click finishes placement, dropping the second click's own duplicate point at that same spot", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("trace");

    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    getListener(canvas, "mousedown")({ clientX: 150, clientY: 100, preventDefault: jest.fn() });
    // The double-click itself: two rapid mousedowns at ~the same spot,
    // each independently feeding addPoint() via the existing mousedown
    // path, then the browser's own dblclick event.
    getListener(canvas, "mousedown")({ clientX: 200, clientY: 50, preventDefault: jest.fn() });
    getListener(canvas, "mousedown")({ clientX: 200, clientY: 50, preventDefault: jest.fn() });
    getListener(canvas, "dblclick")({ clientX: 200, clientY: 50, preventDefault: jest.fn() });

    // Now placed and selectable via the cross tool, at exactly the
    // double-clicked spot - not one extra, near-duplicate point behind it.
    chart.setActiveDrawingTool(null);
    const before = chart.getViewport();
    getListener(canvas, "mousedown")({ clientX: 200, clientY: 50, preventDefault: jest.fn() });
    getListener(canvas, "mousemove")({ clientX: 300, clientY: 50 }); // would pan if selection had missed
    expect(chart.getViewport()).toMatchObject({ startIndex: before.startIndex, endIndex: before.endIndex });
  });

  it("trace tool: right-click (contextmenu) finishes placement at wherever the preceding click landed, with no duplicate to drop", () => {
    const { canvas, ctx } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("trace");

    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    getListener(canvas, "mousedown")({ clientX: 150, clientY: 100, preventDefault: jest.fn() });
    const preventDefault = jest.fn();
    getListener(canvas, "contextmenu")({ clientX: 150, clientY: 100, preventDefault });

    expect(preventDefault).toHaveBeenCalled(); // the native context menu is suppressed

    // Selectable now (finished and committed to the permanent list).
    chart.setActiveDrawingTool(null);
    const before = chart.getViewport();
    getListener(canvas, "mousedown")({ clientX: 125, clientY: 75, preventDefault: jest.fn() }); // midpoint of the one segment
    getListener(canvas, "mousemove")({ clientX: 300, clientY: 75 });
    expect(chart.getViewport()).toMatchObject({ startIndex: before.startIndex, endIndex: before.endIndex });
  });

  it("double-click/right-click do nothing for a fixed-point tool (e.g. trendline) - only trace defines finish()", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("trendline");

    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    const preventDefault = jest.fn();
    expect(() => getListener(canvas, "dblclick")({ clientX: 100, clientY: 50, preventDefault })).not.toThrow();
    expect(() => getListener(canvas, "contextmenu")({ clientX: 100, clientY: 50, preventDefault })).not.toThrow();
    expect(preventDefault).not.toHaveBeenCalled(); // neither gesture is trace-specific, so neither is swallowed here
  });

  it("trace tool: finishing with fewer than two points (e.g. right-clicking right after the first) is a harmless no-op - the drawing stays pending, not committed", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);
    chart.setActiveDrawingTool("trace");

    getListener(canvas, "mousedown")({ clientX: 100, clientY: 50, preventDefault: jest.fn() });
    expect(() => getListener(canvas, "contextmenu")({ clientX: 100, clientY: 50, preventDefault: jest.fn() })).not.toThrow();

    // Still able to keep placing normally afterward - not stuck or reset.
    getListener(canvas, "mousedown")({ clientX: 150, clientY: 100, preventDefault: jest.fn() });
    getListener(canvas, "contextmenu")({ clientX: 150, clientY: 100, preventDefault: jest.fn() });

    chart.setActiveDrawingTool(null);
    const before = chart.getViewport();
    getListener(canvas, "mousedown")({ clientX: 125, clientY: 75, preventDefault: jest.fn() });
    getListener(canvas, "mousemove")({ clientX: 300, clientY: 75 });
    expect(chart.getViewport()).toMatchObject({ startIndex: before.startIndex, endIndex: before.endIndex });
  });
});

describe("ChartCore.getSelectedDrawingDeleteAnchor", () => {
  it("returns null when nothing is selected", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    chart.setData([0, 1, 2].map(makeCandle));
    expect(chart.getSelectedDrawingDeleteAnchor()).toBeNull();
  });

  it("returns the pixel position of the selected drawing's first point once selected", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);

    chart.setActiveDrawingTool("horizontal-line");
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 80, preventDefault: jest.fn() });
    chart.setActiveDrawingTool(null);
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 80, preventDefault: jest.fn() }); // select it

    const anchor = chart.getSelectedDrawingDeleteAnchor();
    expect(anchor).not.toBeNull();
    expect(anchor!.y).toBeCloseTo(80);
  });

  it("goes back to null once the selection is cleared", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    const sixty = Array.from({ length: 60 }, (_, i) => makeCandle(i));
    chart.setData(sixty);

    chart.setActiveDrawingTool("horizontal-line");
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 80, preventDefault: jest.fn() });
    chart.setActiveDrawingTool(null);
    getListener(canvas, "mousedown")({ clientX: 100, clientY: 80, preventDefault: jest.fn() }); // select
    expect(chart.getSelectedDrawingDeleteAnchor()).not.toBeNull();

    chart.deleteSelectedDrawing();
    expect(chart.getSelectedDrawingDeleteAnchor()).toBeNull();
  });
});

describe("ChartCore.onRender", () => {
  it("fires the registered callback at the end of every render() call", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    const callback = jest.fn();
    chart.onRender(callback);

    chart.setData([0, 1, 2].map(makeCandle));
    expect(callback).toHaveBeenCalledTimes(1);

    getListener(canvas, "mousemove")({ clientX: 100, clientY: 50 });
    expect(callback.mock.calls.length).toBeGreaterThan(1);
  });

  it("passing null removes a previously-registered callback", () => {
    const { canvas } = mockCanvas();
    const chart = newChart(canvas);
    const callback = jest.fn();
    chart.onRender(callback);
    chart.onRender(null);

    chart.setData([0, 1, 2].map(makeCandle));
    expect(callback).not.toHaveBeenCalled();
  });
});
