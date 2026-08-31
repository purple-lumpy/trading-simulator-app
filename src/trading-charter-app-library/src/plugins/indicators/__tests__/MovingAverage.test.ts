import { MovingAverage } from "../MovingAverage.js";
import type { Candle } from "../../../core/types.js";

function candles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({ time: i, open: c, high: c, low: c, close: c, volume: 1 }));
}

describe("MovingAverage (SMA)", () => {
  it("is NaN before the warm-up period completes", () => {
    const ma = new MovingAverage(3, "sma");
    const values = ma.compute(candles([1, 2]));
    expect(values.every((v) => Number.isNaN(v))).toBe(true);
  });

  it("computes the simple average once the period is filled", () => {
    const ma = new MovingAverage(3, "sma");
    const values = ma.compute(candles([1, 2, 3, 4, 5]));
    expect(values[2]).toBeCloseTo((1 + 2 + 3) / 3);
    expect(values[3]).toBeCloseTo((2 + 3 + 4) / 3);
    expect(values[4]).toBeCloseTo((3 + 4 + 5) / 3);
  });

  it("names itself after its type and period", () => {
    expect(new MovingAverage(20, "sma").name).toBe("SMA(20)");
    expect(new MovingAverage(12, "ema").name).toBe("EMA(12)");
  });
});

describe("MovingAverage (EMA)", () => {
  it("seeds from the SMA at the warm-up index, then applies the EMA recursion", () => {
    const period = 3;
    const closes = [1, 2, 3, 4, 5];
    const ma = new MovingAverage(period, "ema");
    const values = ma.compute(candles(closes));

    const k = 2 / (period + 1);
    const seed = (1 + 2 + 3) / 3;
    expect(values[2]).toBeCloseTo(seed);
    expect(values[3]).toBeCloseTo(closes[3] * k + seed * (1 - k));
    expect(values[4]).toBeCloseTo(closes[4] * k + values[3] * (1 - k));
  });
});
