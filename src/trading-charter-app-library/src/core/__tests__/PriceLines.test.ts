import { PriceLines } from "../PriceLines.js";
import type { PriceScale } from "../Scale.js";
import type { PriceLine } from "../types.js";

/** Tracks each fillRect call's args alongside whatever fillStyle was set at that moment, since Label sets fillStyle then calls fillRect separately (as every canvas fill does). */
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

describe("PriceLines", () => {
  it("draws a stop-loss line in red, spanning the pane width, dashed", () => {
    const ctx = mockCtx();
    const lines: PriceLine[] = [{ price: 100, kind: "stop-loss" }];
    new PriceLines(lines, 500, stubPriceScale(50)).draw(ctx);
    expect(ctx.strokeStyle).toBe("#ef5350");
    expect(ctx.setLineDash).toHaveBeenCalledWith([6, 4]);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 50.5); // crispLine(50) -> 50.5
    expect(ctx.lineTo).toHaveBeenCalledWith(500, 50.5);
  });

  it("draws a take-profit line in green", () => {
    const ctx = mockCtx();
    const lines: PriceLine[] = [{ price: 200, kind: "take-profit" }];
    new PriceLines(lines, 500, stubPriceScale(20)).draw(ctx);
    expect(ctx.strokeStyle).toBe("#26a69a");
  });

  it("draws no label badge when a line has no label", () => {
    const ctx = mockCtx();
    new PriceLines([{ price: 100, kind: "stop-loss" }], 500, stubPriceScale(50)).draw(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("draws a label badge in the line's own color when it has a label", () => {
    const ctx = mockCtx(40);
    new PriceLines([{ price: 100, kind: "stop-loss", label: "SL 100" }], 500, stubPriceScale(50)).draw(ctx);
    expect(ctx.fillRectCalls).toHaveLength(1);
    expect(ctx.fillRectCalls[0].colorAtCall).toBe("#ef5350"); // badge background matches the line's color
    expect(ctx.fillText).toHaveBeenCalledWith("SL 100", expect.any(Number), expect.any(Number));
  });

  it("positions a labeled badge near the pane's right edge, just above the line", () => {
    const ctx = mockCtx(40);
    new PriceLines([{ price: 100, kind: "take-profit", label: "TP" }], 500, stubPriceScale(50)).draw(ctx);
    // paneWidth(500) - 90 = 410; crispLine(50) - 22 = 28.5, which Rectangle.draw()
    // then crisp-rounds again (Math.round) to 29 when it fills the badge rect.
    expect(ctx.fillRectCalls[0].args[0]).toBe(410);
    expect(ctx.fillRectCalls[0].args[1]).toBe(29);
  });

  it("draws every configured line", () => {
    const ctx = mockCtx();
    const lines: PriceLine[] = [
      { price: 100, kind: "stop-loss" },
      { price: 200, kind: "take-profit" },
    ];
    new PriceLines(lines, 500, stubPriceScale(50)).draw(ctx);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  it("shifts the line and its label by offsetX, so a left-side price ruler isn't drawn over", () => {
    const ctx = mockCtx(40);
    new PriceLines([{ price: 100, kind: "take-profit", label: "TP" }], 500, stubPriceScale(50), 64).draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledWith(64, 50.5);
    expect(ctx.lineTo).toHaveBeenCalledWith(564, 50.5); // offsetX(64) + paneWidth(500)
    // offsetX(64) + paneWidth(500) - 90 = 474
    expect(ctx.fillRectCalls[0].args[0]).toBe(474);
  });
});
