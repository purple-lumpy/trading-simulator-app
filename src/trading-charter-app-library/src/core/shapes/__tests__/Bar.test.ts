import { Bar } from "../Bar.js";
import type { PriceScale } from "../../Scale.js";
import type { Candle } from "../../types.js";

function mockCtx() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fillRect: jest.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

/** A PriceScale stub that maps specific prices to specific y values, so tests assert against fixed numbers instead of re-deriving PriceScale's own formula (that formula is Scale.test.ts's job). */
function stubPriceScale(prices: Record<number, number>): PriceScale {
  return {
    priceToY: (p: number) => {
      if (!(p in prices)) throw new Error(`unexpected price ${p} in test stub`);
      return prices[p];
    },
  } as unknown as PriceScale;
}

const upCandle: Candle = { time: 0, open: 10, high: 20, low: 5, close: 15, volume: 100 };
const downCandle: Candle = { time: 0, open: 15, high: 20, low: 5, close: 10, volume: 100 };
const colors = { up: "green", down: "red" };

describe("Bar", () => {
  it("uses the up color when close >= open", () => {
    const ctx = mockCtx();
    const scale = stubPriceScale({ 20: 10, 5: 90, 10: 70, 15: 30 });
    new Bar(upCandle, 100, 6, scale, colors).draw(ctx);
    expect(ctx.fillStyle).toBe("green");
    expect(ctx.strokeStyle).toBe("green");
  });

  it("uses the down color when close < open", () => {
    const ctx = mockCtx();
    const scale = stubPriceScale({ 20: 10, 5: 90, 15: 30, 10: 70 });
    new Bar(downCandle, 100, 6, scale, colors).draw(ctx);
    expect(ctx.fillStyle).toBe("red");
  });

  it("exposes isUp for callers that need the direction without re-deriving it (e.g. VolumeBar's own color choice)", () => {
    const scale = stubPriceScale({ 20: 10, 5: 90, 10: 70, 15: 30 });
    expect(new Bar(upCandle, 100, 6, scale, colors).isUp).toBe(true);
    expect(new Bar(downCandle, 100, 6, scale, colors).isUp).toBe(false);
  });

  it("draws the wick first, then the body on top of it", () => {
    const ctx = mockCtx();
    const scale = stubPriceScale({ 20: 10, 5: 90, 10: 70, 15: 30 });
    const calls: string[] = [];
    (ctx.stroke as jest.Mock).mockImplementation(() => calls.push("stroke"));
    (ctx.fillRect as jest.Mock).mockImplementation(() => calls.push("fillRect"));
    new Bar(upCandle, 100, 6, scale, colors).draw(ctx);
    expect(calls).toEqual(["stroke", "fillRect"]);
  });

  it("draws the wick at a crisp (half-pixel) x through the candle's high/low", () => {
    const ctx = mockCtx();
    const scale = stubPriceScale({ 20: 10, 5: 90, 10: 70, 15: 30 });
    new Bar(upCandle, 100, 6, scale, colors).draw(ctx);
    // x=100, width=6 -> center 103 -> crispLine -> 103.5
    expect(ctx.moveTo).toHaveBeenCalledWith(103.5, 10); // high=20 -> y=10
    expect(ctx.lineTo).toHaveBeenCalledWith(103.5, 90); // low=5 -> y=90
  });

  it("draws the body rect spanning open/close, rounded to whole device pixels", () => {
    const ctx = mockCtx();
    // Fractional y's from price-scale math — the exact case that blurs without rounding.
    const scale = stubPriceScale({ 20: 10, 5: 90, 10: 70.4, 15: 30.6 });
    new Bar(upCandle, 100, 6, scale, colors).draw(ctx);
    // yOpen(10)=70.4, yClose(15)=30.6 -> top=round(30.6)=31, bottom=round(70.4)=70, height=39
    expect(ctx.fillRect).toHaveBeenCalledWith(100, 31, 6, 39);
  });

  it("keeps a minimum 1px body height for a doji (open == close)", () => {
    const ctx = mockCtx();
    const doji: Candle = { time: 0, open: 12, high: 20, low: 5, close: 12, volume: 10 };
    const scale = stubPriceScale({ 20: 10, 5: 90, 12: 50 });
    new Bar(doji, 100, 6, scale, colors).draw(ctx);
    expect(ctx.fillRect).toHaveBeenCalledWith(100, 50, 6, 1);
  });
});
