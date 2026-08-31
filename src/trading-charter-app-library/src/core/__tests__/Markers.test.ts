import { Markers } from "../Markers.js";
import { TimeScale, PriceScale } from "../Scale.js";
import type { Candle, Marker } from "../types.js";

function mockCtx() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    fill: jest.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
}

const candles: Candle[] = [
  { time: 0, open: 10, high: 10, low: 10, close: 10, volume: 0 },
  { time: 1, open: 20, high: 20, low: 20, close: 20, volume: 0 },
];

describe("Markers", () => {
  const timeScale = new TimeScale(0, 1, 100, 6, 3);
  const priceScale = new PriceScale(0, 100, 100);

  it("points down for an entry marker", () => {
    const ctx = mockCtx();
    const markers: Marker[] = [{ time: 0, price: 10, kind: "entry" }];
    new Markers(markers, candles, timeScale, priceScale, 6).draw(ctx);
    expect(ctx.fillStyle).toBe("#26a69a");
    const [, moveY] = (ctx.moveTo as jest.Mock).mock.calls[0];
    const [, lineY] = (ctx.lineTo as jest.Mock).mock.calls[0];
    expect(lineY).toBeGreaterThan(moveY); // triangle extends downward from the tip
  });

  it("points up for an exit marker", () => {
    const ctx = mockCtx();
    const markers: Marker[] = [{ time: 0, price: 10, kind: "exit" }];
    new Markers(markers, candles, timeScale, priceScale, 6).draw(ctx);
    expect(ctx.fillStyle).toBe("#ef5350");
    const [, moveY] = (ctx.moveTo as jest.Mock).mock.calls[0];
    const [, lineY] = (ctx.lineTo as jest.Mock).mock.calls[0];
    expect(lineY).toBeLessThan(moveY); // triangle extends upward from the tip
  });

  it("skips a marker whose time matches no currently-loaded candle", () => {
    const ctx = mockCtx();
    const markers: Marker[] = [{ time: 999, price: 10, kind: "entry" }];
    new Markers(markers, candles, timeScale, priceScale, 6).draw(ctx);
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it("draws one triangle per matched marker", () => {
    const ctx = mockCtx();
    const markers: Marker[] = [
      { time: 0, price: 10, kind: "entry" },
      { time: 1, price: 20, kind: "exit" },
      { time: 999, price: 30, kind: "entry" }, // no matching candle — skipped
    ];
    new Markers(markers, candles, timeScale, priceScale, 6).draw(ctx);
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });

  it("builds its triangles once in the constructor — draw() just replays them", () => {
    const markers = new Markers([{ time: 0, price: 10, kind: "entry" }], candles, timeScale, priceScale, 6);
    const ctx1 = mockCtx();
    const ctx2 = mockCtx();
    markers.draw(ctx1);
    markers.draw(ctx2);
    expect(ctx1.fill).toHaveBeenCalledTimes(1);
    expect(ctx2.fill).toHaveBeenCalledTimes(1);
  });
});
