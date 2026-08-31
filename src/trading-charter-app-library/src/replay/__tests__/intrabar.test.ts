import { synthesizeIntrabarPath, samplePath } from "../intrabar.js";
import type { Candle } from "../../core/types.js";

function candle(overrides: Partial<Candle> = {}): Candle {
  return { time: 1000, open: 100, high: 110, low: 95, close: 105, volume: 1000, ...overrides };
}

describe("synthesizeIntrabarPath", () => {
  it("returns steps - 1 snapshots", () => {
    expect(synthesizeIntrabarPath(candle(), 8)).toHaveLength(7);
    expect(synthesizeIntrabarPath(candle(), 1)).toHaveLength(0);
    expect(synthesizeIntrabarPath(candle(), 0)).toHaveLength(0);
  });

  it("keeps every snapshot's time and open equal to the settled candle's own", () => {
    for (const snap of synthesizeIntrabarPath(candle(), 5)) {
      expect(snap.time).toBe(1000);
      expect(snap.open).toBe(100);
    }
  });

  it("never lets a snapshot's high/low range escape the settled candle's own range", () => {
    const c = candle({ open: 100, high: 110, low: 95, close: 105 });
    for (const snap of synthesizeIntrabarPath(c, 6)) {
      expect(snap.high).toBeLessThanOrEqual(c.high);
      expect(snap.high).toBeGreaterThanOrEqual(c.open);
      expect(snap.low).toBeGreaterThanOrEqual(c.low);
      expect(snap.low).toBeLessThanOrEqual(c.open);
    }
  });

  it("grows high monotonically and shrinks low monotonically across snapshots", () => {
    const snaps = synthesizeIntrabarPath(candle({ open: 100, high: 130, low: 70, close: 90 }), 8);
    for (let i = 1; i < snaps.length; i++) {
      expect(snaps[i].high).toBeGreaterThanOrEqual(snaps[i - 1].high);
      expect(snaps[i].low).toBeLessThanOrEqual(snaps[i - 1].low);
    }
  });

  it("interpolates volume proportionally, never reaching the full settled amount", () => {
    const snaps = synthesizeIntrabarPath(candle({ volume: 800 }), 4);
    expect(snaps[0].volume).toBeCloseTo(200);
    expect(snaps[1].volume).toBeCloseTo(400);
    expect(snaps[2].volume).toBeCloseTo(600);
    expect(snaps.every((s) => s.volume < 800)).toBe(true);
  });

  it("routes a down candle up toward its high before an up candle would, and vice versa", () => {
    const down = candle({ open: 100, high: 108, low: 90, close: 92 });
    const up = candle({ open: 100, high: 108, low: 90, close: 106 });

    const [firstDown] = synthesizeIntrabarPath(down, 3);
    const [firstUp] = synthesizeIntrabarPath(up, 3);

    // Down candles are modeled as spiking toward the high before dropping;
    // up candles dip toward the low before rallying.
    expect(firstDown.close).toBeGreaterThan(down.open);
    expect(firstUp.close).toBeLessThan(up.open);
  });
});

describe("samplePath", () => {
  it("returns an empty array for zero or negative count", () => {
    expect(samplePath([0, 10], 0)).toEqual([]);
    expect(samplePath([0, 10], -3)).toEqual([]);
  });

  it("samples strictly between the endpoints, evenly spaced", () => {
    const samples = samplePath([0, 100], 3);
    expect(samples).toHaveLength(3);
    expect(samples[0]).toBeCloseTo(25);
    expect(samples[1]).toBeCloseTo(50);
    expect(samples[2]).toBeCloseTo(75);
  });

  it("spreads samples proportionally across a multi-segment path", () => {
    const samples = samplePath([0, 10, 20, 30], 3);
    expect(samples).toHaveLength(3);
    expect(samples[0]).toBeCloseTo(7.5);
    expect(samples[1]).toBeCloseTo(15);
    expect(samples[2]).toBeCloseTo(22.5);
    // Strictly increasing, matching the strictly increasing waypoints.
    expect(samples[1]).toBeGreaterThan(samples[0]);
    expect(samples[2]).toBeGreaterThan(samples[1]);
  });
});
