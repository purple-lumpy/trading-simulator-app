import { PriceScale, TimeScale, priceRangeFor } from "../Scale.js";
import type { Candle } from "../types.js";

function candle(i: number, low: number, high: number): Candle {
  return { time: i * 300, open: low, high, low, close: high, volume: 100 };
}

describe("TimeScale", () => {
  it("round-trips indexToX/xToIndex for the first visible index", () => {
    const scale = new TimeScale(10, 40, 900, 6, 3);
    const x = scale.indexToX(10);
    expect(scale.xToIndex(x)).toBe(10);
  });

  it("shifts x by exactly one step per index", () => {
    const scale = new TimeScale(0, 40, 900, 6, 3);
    const step = scale.step; // candleWidth + candleGap
    expect(scale.indexToX(5) - scale.indexToX(4)).toBeCloseTo(step);
  });

  it("computes a visible count that fills the pane width", () => {
    const scale = new TimeScale(0, 0, 90, 6, 3); // step = 9px
    expect(scale.visibleCount()).toBe(10);
  });

  it("shifts every x by offsetX, for a price ruler reserving space on the left", () => {
    const unshifted = new TimeScale(0, 40, 900, 6, 3);
    const shifted = new TimeScale(0, 40, 900, 6, 3, 64);
    expect(shifted.indexToX(5)).toBe(unshifted.indexToX(5) + 64);
  });

  it("round-trips indexToX/xToIndex through a nonzero offsetX", () => {
    const scale = new TimeScale(10, 40, 900, 6, 3, 64);
    const x = scale.indexToX(15);
    expect(scale.xToIndex(x)).toBe(15);
  });
});

describe("PriceScale", () => {
  it("round-trips priceToY/yToPrice", () => {
    const scale = new PriceScale(100, 200, 500);
    const y = scale.priceToY(150);
    expect(scale.yToPrice(y)).toBeCloseTo(150);
  });

  it("maps the max price above the min price on screen (smaller y)", () => {
    const scale = new PriceScale(100, 200, 500);
    expect(scale.priceToY(200)).toBeLessThan(scale.priceToY(100));
  });

  it("keeps top/bottom padding clear of the price range", () => {
    const scale = new PriceScale(100, 200, 500, 0.1, 0.1);
    expect(scale.priceToY(200)).toBeCloseTo(50); // 500 * 0.1 top pad
    expect(scale.priceToY(100)).toBeCloseTo(450); // 500 * (1 - 0.1) bottom
  });
});

describe("priceRangeFor", () => {
  it("returns the min low / max high across the visible slice only", () => {
    const candles = [candle(0, 90, 95), candle(1, 80, 200), candle(2, 85, 90), candle(3, 1, 1000)];
    // Slice excludes index 3's extreme range.
    const { min, max } = priceRangeFor(candles, 0, 2);
    expect(min).toBe(80);
    expect(max).toBe(200);
  });

  it("falls back to a default range when the slice is empty", () => {
    const { min, max } = priceRangeFor([], 0, 5);
    expect(min).toBe(0);
    expect(max).toBe(1);
  });

  it("clamps an out-of-bounds endIndex to the available candles", () => {
    const candles = [candle(0, 10, 20), candle(1, 5, 15)];
    const { min, max } = priceRangeFor(candles, 0, 99);
    expect(min).toBe(5);
    expect(max).toBe(20);
  });
});
