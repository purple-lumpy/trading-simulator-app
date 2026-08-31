import { TIMEFRAME_PRESETS, realtimeIntervalMs } from "../timeframes.js";

describe("TIMEFRAME_PRESETS", () => {
  it("is ordered from shortest to longest", () => {
    const seconds = TIMEFRAME_PRESETS.map((p) => p.seconds);
    const sorted = [...seconds].sort((a, b) => a - b);
    expect(seconds).toEqual(sorted);
  });

  it("has a unique label for every preset", () => {
    const labels = TIMEFRAME_PRESETS.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("includes the eleven presets a trader would expect, 15s through 1d", () => {
    expect(TIMEFRAME_PRESETS.map((p) => p.seconds)).toEqual([
      15, 30, 60, 300, 900, 1800, 3600, 10800, 14400, 28800, 86400,
    ]);
  });

  it("every preset from 1m through 30m is an exact multiple of 60 - what lets simulator-app's fine tier resample all of them from one 1-minute base", () => {
    const fineTier = TIMEFRAME_PRESETS.map((p) => p.seconds).filter((s) => s >= 60 && s <= 1800);
    expect(fineTier).toEqual([60, 300, 900, 1800]);
    for (const seconds of fineTier) expect(seconds % 60).toBe(0);
  });

  it("every preset from 1h up is an exact multiple of 3600 - what lets simulator-app's coarse tier resample all of them from one 1-hour base (3h/4h/8h are NOT multiples of each other, only of 3600)", () => {
    const coarseTier = TIMEFRAME_PRESETS.map((p) => p.seconds).filter((s) => s >= 3600);
    expect(coarseTier).toEqual([3600, 10800, 14400, 28800, 86400]);
    for (const seconds of coarseTier) expect(seconds % 3600).toBe(0);
  });
});

describe("realtimeIntervalMs", () => {
  it("converts seconds to milliseconds 1:1, so 1x speed is genuinely real-time", () => {
    expect(realtimeIntervalMs(15)).toBe(15_000);
    expect(realtimeIntervalMs(300)).toBe(300_000);
  });
});
