import { VolumeBar } from "../VolumeBar.js";
import type { Candle } from "../../types.js";

function mockCtx() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    fillRect: jest.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
}

const upCandle: Candle = { time: 0, open: 10, high: 20, low: 5, close: 15, volume: 100 };
const downCandle: Candle = { time: 0, open: 15, high: 20, low: 5, close: 10, volume: 100 };
const colors = { up: "green", down: "red" };

describe("VolumeBar", () => {
  it("does nothing when maxVolume is zero", () => {
    const ctx = mockCtx();
    new VolumeBar(upCandle, 100, 6, 400, 100, 0, colors).draw(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it("scales bar height proportionally to volume/maxVolume, anchored to the pane bottom", () => {
    const ctx = mockCtx();
    // volume 100 / maxVolume 200 = 0.5 ratio * paneHeight(100) * 0.9 = 45
    new VolumeBar(upCandle, 100, 6, 400, 100, 200, colors).draw(ctx);
    expect(ctx.fillStyle).toBe("green");
    expect(ctx.fillRect).toHaveBeenCalledWith(100, 455, 6, 45); // paneTop(400) + paneHeight(100) - barHeight(45)
  });

  it("uses the down color when its candle closed down", () => {
    const ctx = mockCtx();
    new VolumeBar(downCandle, 100, 6, 400, 100, 200, colors).draw(ctx);
    expect(ctx.fillStyle).toBe("red");
  });

  it("never collapses to a 0px bar for a nonzero volume, even at a tiny proportion", () => {
    const ctx = mockCtx();
    const tinyVolume: Candle = { ...upCandle, volume: 1 };
    new VolumeBar(tinyVolume, 100, 6, 400, 100, 1_000_000, colors).draw(ctx);
    const [, , , height] = (ctx.fillRect as jest.Mock).mock.calls[0];
    expect(height).toBe(1);
  });
});
