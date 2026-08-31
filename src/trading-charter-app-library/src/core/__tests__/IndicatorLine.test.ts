import { IndicatorLine } from "../IndicatorLine.js";
import { TimeScale, PriceScale } from "../Scale.js";
import type { Candle, Indicator } from "../types.js";

function mockCtx() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    strokeStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

const candles: Candle[] = Array.from({ length: 5 }, (_, i) => ({
  time: i,
  open: i,
  high: i,
  low: i,
  close: i,
  volume: 0,
}));

function stubIndicator(values: number[], color?: string): Indicator {
  return { name: "stub", pane: "main", color, compute: () => values };
}

describe("IndicatorLine", () => {
  const timeScale = new TimeScale(0, 4, 100, 6, 3);
  const priceScale = new PriceScale(0, 10, 100);

  it("skips NaN/undefined values (the warm-up period) instead of drawing through them", () => {
    const ctx = mockCtx();
    const indicator = stubIndicator([NaN, NaN, 3, 4, 5]);
    new IndicatorLine(indicator, candles, 0, 4, timeScale, priceScale, 6).draw(ctx);
    // First real value (index 2) starts the path with moveTo; the rest are lineTo.
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledTimes(2);
  });

  it("uses the indicator's own color when set, falling back to the default blue", () => {
    const ctx = mockCtx();
    new IndicatorLine(stubIndicator([1, 2, 3, 4, 5], "#ff00ff"), candles, 0, 4, timeScale, priceScale, 6).draw(ctx);
    expect(ctx.strokeStyle).toBe("#ff00ff");

    new IndicatorLine(stubIndicator([1, 2, 3, 4, 5]), candles, 0, 4, timeScale, priceScale, 6).draw(ctx);
    expect(ctx.strokeStyle).toBe("#42a5f5");
  });

  it("draws nothing when every value in range is undefined", () => {
    const ctx = mockCtx();
    new IndicatorLine(stubIndicator([]), candles, 0, 4, timeScale, priceScale, 6).draw(ctx);
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledTimes(1); // still strokes an empty path — harmless no-op on a real canvas
  });

  it("calls indicator.compute() exactly once in the constructor, not again on every draw()", () => {
    const compute = jest.fn(() => [1, 2, 3, 4, 5]);
    const indicator: Indicator = { name: "stub", pane: "main", compute };
    const line = new IndicatorLine(indicator, candles, 0, 4, timeScale, priceScale, 6);
    line.draw(mockCtx());
    line.draw(mockCtx());
    expect(compute).toHaveBeenCalledTimes(1);
  });
});
