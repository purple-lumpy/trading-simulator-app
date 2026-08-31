import { PriceAxis } from "../PriceAxis.js";
import type { PriceScale } from "../Scale.js";

/** Tracks each fillRect call's args alongside whatever fillStyle was set at that moment — same pattern as PriceLines.test.ts, since Label sets fillStyle then calls fillRect separately. */
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

/** A PriceScale stub with a trivial, easy-to-check yToPrice — PriceAxis only ever calls that direction, never priceToY. */
function stubPriceScale(): PriceScale {
  return { yToPrice: (y: number) => 200 - y } as unknown as PriceScale;
}

describe("PriceAxis", () => {
  it("draws lineCount + 1 ticks, evenly spaced like Grid", () => {
    const ctx = mockCtx();
    new PriceAxis(stubPriceScale(), 100, 0, "#0e0f12", "#9aa0a6", 4).draw(ctx);
    expect(ctx.fillRectCalls).toHaveLength(5);
  });

  it("labels each tick with the price at that tick's height", () => {
    const ctx = mockCtx();
    new PriceAxis(stubPriceScale(), 100, 0, "#0e0f12", "#9aa0a6", 4).draw(ctx);
    // heights 0, 25, 50, 75, 100 -> yToPrice -> 200, 175, 150, 125, 100
    expect(ctx.fillText).toHaveBeenNthCalledWith(1, "200.00", expect.any(Number), expect.any(Number));
    expect(ctx.fillText).toHaveBeenNthCalledWith(3, "150.00", expect.any(Number), expect.any(Number));
    expect(ctx.fillText).toHaveBeenNthCalledWith(5, "100.00", expect.any(Number), expect.any(Number));
  });

  it("uses the given background color for every tick", () => {
    const ctx = mockCtx();
    new PriceAxis(stubPriceScale(), 100, 0, "#123456", "#9aa0a6").draw(ctx);
    expect(ctx.fillRectCalls[0].colorAtCall).toBe("#123456");
  });

  it("positions every tick at axisX + 4, regardless of which edge the ruler is on", () => {
    const ctx = mockCtx();
    new PriceAxis(stubPriceScale(), 100, 200, "#0e0f12", "#9aa0a6").draw(ctx);
    expect(ctx.fillRectCalls[0].args[0]).toBe(204);
  });

  it("defaults to 4 lineCount (5 ticks) when omitted", () => {
    const ctx = mockCtx();
    new PriceAxis(stubPriceScale(), 100, 0, "#0e0f12", "#9aa0a6").draw(ctx);
    expect(ctx.fillRectCalls).toHaveLength(5);
  });

  it("builds its ticks once in the constructor — draw() just replays them", () => {
    const axis = new PriceAxis(stubPriceScale(), 100, 0, "#0e0f12", "#9aa0a6", 2);
    const ctx1 = mockCtx();
    const ctx2 = mockCtx();
    axis.draw(ctx1);
    axis.draw(ctx2);
    expect(ctx1.fillRectCalls).toHaveLength(3);
    expect(ctx2.fillRectCalls).toHaveLength(3);
  });
});
