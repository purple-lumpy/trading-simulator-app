import { resampleCandles } from "../resample.js";
import type { Candle } from "../../core/types.js";

/** Four 15s candles spanning one full 60s (1m) bucket [0, 60), each with distinct OHLCV so a wrong pick (e.g. last high instead of max high) shows up immediately. */
const ONE_MINUTE_OF_15S_CANDLES: Candle[] = [
  { time: 0, open: 100, high: 102, low: 99, close: 101, volume: 10 },
  { time: 15, open: 101, high: 105, low: 100, close: 103, volume: 20 },
  { time: 30, open: 103, high: 104, low: 98, close: 99, volume: 5 },
  { time: 45, open: 99, high: 101, low: 97, close: 100, volume: 7 },
];

describe("resampleCandles", () => {
  it("aggregates a full bucket: open from the first candle, close from the last, high/low from the extremes, volume summed", () => {
    const result = resampleCandles(ONE_MINUTE_OF_15S_CANDLES, 15, 60);
    expect(result).toEqual([{ time: 0, open: 100, high: 105, low: 97, close: 100, volume: 42 }]);
  });

  it("starts a new bucket once a candle's time crosses the target boundary", () => {
    const twoBuckets: Candle[] = [
      ...ONE_MINUTE_OF_15S_CANDLES,
      { time: 60, open: 100, high: 110, low: 100, close: 108, volume: 3 },
      { time: 75, open: 108, high: 109, low: 106, close: 107, volume: 4 },
    ];
    const result = resampleCandles(twoBuckets, 15, 60);
    expect(result).toEqual([
      { time: 0, open: 100, high: 105, low: 97, close: 100, volume: 42 },
      { time: 60, open: 100, high: 110, low: 100, close: 107, volume: 7 },
    ]);
  });

  it("includes a trailing partial bucket - fewer source candles than a full target period still aggregate into one bar, the 'still forming' case this function's doc comment describes", () => {
    const result = resampleCandles(ONE_MINUTE_OF_15S_CANDLES.slice(0, 2), 15, 60);
    expect(result).toEqual([{ time: 0, open: 100, high: 105, low: 99, close: 103, volume: 30 }]);
  });

  it("is a no-op reshape when targetSeconds equals sourceSeconds - every candle is its own bucket, unchanged", () => {
    const result = resampleCandles(ONE_MINUTE_OF_15S_CANDLES, 15, 15);
    expect(result).toEqual(ONE_MINUTE_OF_15S_CANDLES);
  });

  it("returns an empty array for an empty input", () => {
    expect(resampleCandles([], 15, 60)).toEqual([]);
  });

  it("rejects a target timeframe finer than the source - it aggregates, it can't invent candles", () => {
    expect(() => resampleCandles(ONE_MINUTE_OF_15S_CANDLES, 60, 15)).toThrow(/must be >= sourceSeconds/);
  });

  it("rejects a target that isn't an exact multiple of the source, to avoid silently lopsided buckets", () => {
    expect(() => resampleCandles(ONE_MINUTE_OF_15S_CANDLES, 15, 50)).toThrow(/must be an exact multiple/);
  });
});
