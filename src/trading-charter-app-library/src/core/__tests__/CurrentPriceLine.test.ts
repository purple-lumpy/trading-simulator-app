import { CurrentPriceLine } from "../CurrentPriceLine.js";
import type { PriceScale } from "../Scale.js";

/** Same fillRect-tracking pattern as PriceLines.test.ts/PriceAxis.test.ts. */
function mockCtx(textWidth = 40) {
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
    measureText: jest.fn(() => ({ width: textWidth })),
    strokeStyle: "",
    fillStyle: "",
    font: "",
  };
  ctx.fillRect = jest.fn((...args: unknown[]) => fillRectCalls.push({ args, colorAtCall: ctx.fillStyle }));
  ctx.fillRectCalls = fillRectCalls;
  return ctx as CanvasRenderingContext2D & { fillRectCalls: typeof fillRectCalls };
}

function stubPriceScale(y: number): PriceScale {
  return { priceToY: () => y } as unknown as PriceScale;
}

describe("CurrentPriceLine", () => {
  it("draws a dashed line across the plot area at the current price's y", () => {
    const ctx = mockCtx();
    new CurrentPriceLine(100, 0, 500, 500, stubPriceScale(50), "#9aa0a6").draw(ctx);
    expect(ctx.setLineDash).toHaveBeenCalledWith([3, 3]); // tighter than PriceLines' [6, 4] default dash
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 50.5); // crispLine(50)
    expect(ctx.lineTo).toHaveBeenCalledWith(500, 50.5);
  });

  it("shifts the line by plotOffsetX, for a left-side price ruler", () => {
    const ctx = mockCtx();
    new CurrentPriceLine(100, 64, 500, 0, stubPriceScale(50), "#9aa0a6").draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledWith(64, 50.5);
    expect(ctx.lineTo).toHaveBeenCalledWith(564, 50.5); // offsetX(64) + plotWidth(500)
  });

  it("draws the price tag at axisX, in the given color", () => {
    const ctx = mockCtx(40);
    new CurrentPriceLine(101.5, 0, 500, 500, stubPriceScale(50), "#9aa0a6").draw(ctx);
    expect(ctx.fillRectCalls).toHaveLength(1);
    expect(ctx.fillRectCalls[0].colorAtCall).toBe("#9aa0a6");
    expect(ctx.fillRectCalls[0].args[0]).toBe(502); // axisX(500) + 2
    expect(ctx.fillText).toHaveBeenCalledWith("101.50", expect.any(Number), expect.any(Number));
  });

  it("uses a custom color for both the line and the tag", () => {
    const ctx = mockCtx();
    new CurrentPriceLine(100, 0, 500, 500, stubPriceScale(50), "#ffcc00").draw(ctx);
    expect(ctx.strokeStyle).toBe("#ffcc00");
    expect(ctx.fillRectCalls[0].colorAtCall).toBe("#ffcc00");
  });
});
