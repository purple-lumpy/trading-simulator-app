import { Wick } from "../Wick.js";

function mockCtx() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    strokeStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe("Wick", () => {
  it("snaps its shared x to a crisp half-pixel offset", () => {
    const ctx = mockCtx();
    new Wick(103, 10, 90, "green").draw(ctx);
    // x=103 -> round(103) + 0.5 -> 103.5, used for both endpoints
    expect(ctx.moveTo).toHaveBeenCalledWith(103.5, 10);
    expect(ctx.lineTo).toHaveBeenCalledWith(103.5, 90);
  });

  it("rounds (not half-offsets) its y endpoints, independently of each other", () => {
    const ctx = mockCtx();
    new Wick(100, 10.4, 89.6, "green").draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledWith(100.5, 10);
    expect(ctx.lineTo).toHaveBeenCalledWith(100.5, 90);
  });

  it("draws in the given color", () => {
    const ctx = mockCtx();
    new Wick(100, 10, 90, "red").draw(ctx);
    expect(ctx.strokeStyle).toBe("red");
  });
});
