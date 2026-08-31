import { Crosshair } from "../Crosshair.js";
import { TimeScale, PriceScale } from "../Scale.js";
import type { Candle, ChartOptions } from "../types.js";
import { DEFAULT_OPTIONS } from "../types.js";

/** Tracks each fillRect call's args alongside whatever fillStyle was set at that moment — Label sets fillStyle then calls fillRect separately, and the price tag/OHLC readout/current-price tag now all coexist, so tests need to tell their fillRect calls apart by color. */
function mockCtx() {
  const fillRectCalls: Array<{ args: unknown[]; colorAtCall: string }> = [];
  const ctx: any = {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    setLineDash: jest.fn(),
    strokeRect: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn(() => ({ width: 100 })),
    strokeStyle: "",
    fillStyle: "",
    font: "",
  };
  ctx.fillRect = jest.fn((...args: unknown[]) => fillRectCalls.push({ args, colorAtCall: ctx.fillStyle }));
  ctx.fillRectCalls = fillRectCalls;
  return ctx as CanvasRenderingContext2D & { fillRectCalls: typeof fillRectCalls };
}

const candles: Candle[] = Array.from({ length: 5 }, (_, i) => ({
  time: i,
  open: i,
  high: i,
  low: i,
  close: i,
  volume: 0,
}));

const opts: Required<ChartOptions> = DEFAULT_OPTIONS;
const timeScale = new TimeScale(0, 4, 100, 6, 3);
const priceScale = new PriceScale(0, 10, 100);

describe("Crosshair", () => {
  it("draws a dashed vertical line through the pointer's x, spanning the pane height", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 0, y: 50 }, candles, timeScale, priceScale, 100, 100, opts).draw(ctx);
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(0, 100);
  });

  it("draws a dashed horizontal line through the pointer's y, spanning the pane width", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 0, y: 50 }, candles, timeScale, priceScale, 100, 100, opts).draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 50);
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 50);
  });

  it("shows an OHLC + price readout for the candle under the pointer", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 0, y: 50 }, candles, timeScale, priceScale, 100, 100, opts).draw(ctx);
    // candle at index 0 (all fields 0); yToPrice(50) with a 0-10 range and 8% padding -> 5.00
    expect(ctx.fillText).toHaveBeenCalledWith("O 0.00  H 0.00  L 0.00  C 0.00   5.00", expect.any(Number), expect.any(Number));
  });

  it("pins the readout label to the pane's top-left corner", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 0, y: 50 }, candles, timeScale, priceScale, 100, 100, opts).draw(ctx);
    expect(ctx.fillRect).toHaveBeenCalledWith(8, 8, expect.any(Number), 20);
  });

  it("still draws both guide lines and the ruler price tag, but no OHLC readout, when the pointer is over no loaded candle", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 10_000, y: 50 }, candles, timeScale, priceScale, 100, 100, opts).draw(ctx);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    // The ruler price tag is pure y-axis math — it doesn't need a candle
    // under the pointer's x — so it still draws (one fillRect, one
    // fillText for its price string) even though there's nothing to read
    // an OHLC readout off of.
    expect(ctx.fillRectCalls).toHaveLength(1);
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledWith("5.00", expect.any(Number), expect.any(Number));
  });

  it("starts the horizontal guide line at offsetX instead of the canvas edge, for a left-side price ruler", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 70, y: 50 }, candles, timeScale, priceScale, 100, 100, opts, 64).draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledWith(64, 50);
    expect(ctx.lineTo).toHaveBeenCalledWith(164, 50); // offsetX(64) + paneWidth(100)
  });

  it("leaves the vertical guide line at the pointer's own (already-absolute) x regardless of offsetX", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 70, y: 50 }, candles, timeScale, priceScale, 100, 100, opts, 64).draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledWith(70, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(70, 100);
  });

  it("pins a ruler price tag to the pointer's y, in crosshairPriceTagColor", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 0, y: 50 }, candles, timeScale, priceScale, 100, 100, opts).draw(ctx);
    // yToPrice(50) with a 0-10 range and 8% padding -> 5.00; default axisX = offsetX(0) + paneWidth(100) = 100
    expect(ctx.fillRectCalls[0].colorAtCall).toBe(opts.crosshairPriceTagColor);
    expect(ctx.fillRectCalls[0].args[0]).toBe(102); // axisX(100) + 2
    expect(ctx.fillText).toHaveBeenCalledWith("5.00", expect.any(Number), expect.any(Number));
  });

  it("distinguishes the ruler price tag from the OHLC readout by color, even though both can be on screen at once", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 0, y: 50 }, candles, timeScale, priceScale, 100, 100, opts).draw(ctx);
    const colors = ctx.fillRectCalls.map((c) => c.colorAtCall);
    expect(colors).toContain(opts.crosshairPriceTagColor);
    expect(colors).toContain(opts.backgroundColor); // the OHLC readout's background
    expect(opts.crosshairPriceTagColor).not.toBe(opts.backgroundColor);
  });

  it("positions the ruler price tag at a caller-supplied axisX, for a left-side price ruler", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 70, y: 50 }, candles, timeScale, priceScale, 100, 100, opts, 64, 0).draw(ctx);
    expect(ctx.fillRectCalls[0].args[0]).toBe(2); // axisX(0) + 2
  });

  // candle at index 0 has time: 0 (see `candles` above) — Unix epoch,
  // 1970-01-01 00:00:00 UTC, which is what formatDetailedTimeLabel(0)
  // must produce. draw() always builds shapes in the same order
  // (verticalLine, horizontalLine, priceTag, label, timeTag — see the
  // class's own draw()), so with a real candle under the pointer the
  // *third* fillRect is always the time tag's, the same way
  // fillRectCalls[0] is always established above to be the price tag's.
  it("pins a detailed date/time tag to the time axis at the pointer's x, in crosshairTimeTagColor/crosshairTimeTagTextColor", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 0, y: 50 }, candles, timeScale, priceScale, 100, 100, opts).draw(ctx);
    expect(ctx.fillText).toHaveBeenCalledWith("1970-01-01 00:00:00", expect.any(Number), expect.any(Number));
    expect(ctx.fillRectCalls).toHaveLength(3); // price tag, OHLC readout, time tag
    expect(ctx.fillRectCalls[2].colorAtCall).toBe(opts.crosshairTimeTagColor);
  });

  it("pins the time tag at the caller-supplied timeAxisY, not the price pane's own paneHeight", () => {
    const ctx = mockCtx();
    // paneHeight(100) is the default timeAxisY - passing 130 (as ChartCore.render()
    // does via footerSeparatorY, once a volume pane reserves its own height
    // below the price pane) should move the tag, not the price pane height.
    new Crosshair({ x: 0, y: 50 }, candles, timeScale, priceScale, 100, 100, opts, 0, 100, 130).draw(ctx);
    expect(ctx.fillRectCalls[2].args[1]).toBe(134); // timeAxisY(130) + 4
  });

  it("skips the time tag, same as the OHLC readout, when the pointer is over no loaded candle", () => {
    const ctx = mockCtx();
    new Crosshair({ x: 10_000, y: 50 }, candles, timeScale, priceScale, 100, 100, opts).draw(ctx);
    // Same assertion the existing "still draws both guide lines..." test
    // above already makes for the OHLC readout - repeated here for the
    // time tag specifically, since both are skipped by the same `if
    // (candle)` guard (see the class's own constructor).
    expect(ctx.fillRectCalls).toHaveLength(1); // ruler price tag only
  });
});
