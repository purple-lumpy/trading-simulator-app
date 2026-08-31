import { Rectangle } from "../Rectangle.js";

function mockCtx() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    fillRect: jest.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
}

describe("Rectangle", () => {
  it("fills a rect at its own x/y/width/height, in its own color", () => {
    const ctx = mockCtx();
    new Rectangle(10, 20, 30, 40, "blue").draw(ctx);
    expect(ctx.fillStyle).toBe("blue");
    expect(ctx.fillRect).toHaveBeenCalledWith(10, 20, 30, 40);
  });

  it("rounds fractional geometry to whole device pixels", () => {
    const ctx = mockCtx();
    new Rectangle(10.4, 20.6, 30.5, 39.5, "red").draw(ctx);
    expect(ctx.fillRect).toHaveBeenCalledWith(10, 21, 31, 40); // 39.5 rounds up (banker's-free Math.round)
  });

  it("is idempotent on already-rounded geometry (a subclass that pre-rounds isn't double-rounded)", () => {
    const ctx = mockCtx();
    new Rectangle(31, 70, 6, 39, "green").draw(ctx);
    expect(ctx.fillRect).toHaveBeenCalledWith(31, 70, 6, 39);
  });

  it("saves and restores context state around the fill", () => {
    const ctx = mockCtx();
    new Rectangle(0, 0, 1, 1, "black").draw(ctx);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
});
