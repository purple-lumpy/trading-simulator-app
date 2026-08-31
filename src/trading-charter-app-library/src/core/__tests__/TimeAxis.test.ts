import { TimeAxis } from "../TimeAxis.js";
import type { TimeScale } from "../Scale.js";
import type { Candle } from "../types.js";

/** Same pattern as PriceAxis.test.ts — tracks each fillRect call's args alongside whatever fillStyle was set at that moment, since Label sets fillStyle then calls fillRect separately. */
function mockCtx(textWidth = 40) {
  const fillRectCalls: Array<{ args: unknown[]; colorAtCall: string }> = [];
  const ctx: any = {
    save: jest.fn(),
    restore: jest.fn(),
    strokeRect: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn(() => ({ width: textWidth })),
    fillStyle: "",
    font: "",
  };
  ctx.fillRect = jest.fn((...args: unknown[]) => fillRectCalls.push({ args, colorAtCall: ctx.fillStyle }));
  ctx.fillRectCalls = fillRectCalls;
  return ctx as CanvasRenderingContext2D & { fillRectCalls: typeof fillRectCalls };
}

function makeCandle(index: number, unixSeconds: number): Candle {
  return { time: unixSeconds, open: index, high: index + 1, low: index, close: index, volume: 0 };
}

/** A TimeScale stub with a trivial, easy-to-check xToIndex — TimeAxis only ever calls that direction. Maps x straight to a candle index via the supplied function. */
function stubTimeScale(xToIndex: (x: number) => number): TimeScale {
  return { xToIndex } as unknown as TimeScale;
}

describe("TimeAxis", () => {
  it("draws one label per x, when every x maps to a loaded candle", () => {
    const candles = [makeCandle(0, 0), makeCandle(1, 300), makeCandle(2, 600)];
    const ctx = mockCtx();
    new TimeAxis(candles, stubTimeScale((x) => x / 100), [0, 100, 200], 280, "#0e0f12", "#9aa0a6").draw(ctx);
    expect(ctx.fillRectCalls).toHaveLength(3);
  });

  it("skips an x whose candle index falls outside the loaded buffer, rather than drawing a blank label", () => {
    const candles = [makeCandle(0, 0), makeCandle(1, 300)];
    const ctx = mockCtx();
    // x=0 -> index 0 (valid), x=500 -> index 5 (past the 2 loaded candles)
    new TimeAxis(candles, stubTimeScale((x) => x / 100), [0, 500], 280, "#0e0f12", "#9aa0a6").draw(ctx);
    expect(ctx.fillRectCalls).toHaveLength(1);
  });

  it("formats each label as UTC HH:MM, not a locale/timezone-dependent string", () => {
    // 1970-01-01T13:07:00Z = 13*3600 + 7*60 = 47220 unix seconds
    const candles = [makeCandle(0, 47220)];
    const ctx = mockCtx();
    new TimeAxis(candles, stubTimeScale(() => 0), [10], 280, "#0e0f12", "#9aa0a6").draw(ctx);
    expect(ctx.fillText).toHaveBeenCalledWith("13:07", expect.any(Number), expect.any(Number));
  });

  it("zero-pads single-digit hours and minutes", () => {
    // 1970-01-01T04:05:00Z = 4*3600 + 5*60 = 14700 unix seconds
    const candles = [makeCandle(0, 14700)];
    const ctx = mockCtx();
    new TimeAxis(candles, stubTimeScale(() => 0), [10], 280, "#0e0f12", "#9aa0a6").draw(ctx);
    expect(ctx.fillText).toHaveBeenCalledWith("04:05", expect.any(Number), expect.any(Number));
  });

  it("centers each label horizontally on its x, using an estimated (not measured) text width", () => {
    const candles = [makeCandle(0, 0)];
    const ctx = mockCtx();
    new TimeAxis(candles, stubTimeScale(() => 0), [100], 280, "#0e0f12", "#9aa0a6").draw(ctx);
    // "00:00" is 5 chars -> estimatedWidth = 5*7+12 = 47 -> x = 100 - 47/2 =
    // 76.5, crisp-rect-rounded by Rectangle.draw() (Label extends
    // Rectangle) to 77.
    expect(ctx.fillRectCalls[0].args[0]).toBe(77);
  });

  it("positions each label's top a fixed 4px below the given y (the footer separator's own y)", () => {
    const candles = [makeCandle(0, 0)];
    const ctx = mockCtx();
    new TimeAxis(candles, stubTimeScale(() => 0), [10], 280, "#0e0f12", "#9aa0a6").draw(ctx);
    expect(ctx.fillRectCalls[0].args[1]).toBe(284);
  });

  it("uses the given background color for every label", () => {
    const candles = [makeCandle(0, 0), makeCandle(1, 300)];
    const ctx = mockCtx();
    new TimeAxis(candles, stubTimeScale((x) => x / 100), [0, 100], 280, "#123456", "#9aa0a6").draw(ctx);
    expect(ctx.fillRectCalls[0].colorAtCall).toBe("#123456");
  });

  it("builds its ticks once in the constructor — draw() just replays them", () => {
    const candles = [makeCandle(0, 0), makeCandle(1, 300)];
    const axis = new TimeAxis(candles, stubTimeScale((x) => x / 100), [0, 100], 280, "#0e0f12", "#9aa0a6");
    const ctx1 = mockCtx();
    const ctx2 = mockCtx();
    axis.draw(ctx1);
    axis.draw(ctx2);
    expect(ctx1.fillRectCalls).toHaveLength(2);
    expect(ctx2.fillRectCalls).toHaveLength(2);
  });
});
