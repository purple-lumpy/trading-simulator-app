import { MarkerTriangle } from "../MarkerTriangle.js";

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

describe("MarkerTriangle", () => {
  it("points down (extends to larger y) for an entry, tip at (x, y)", () => {
    const ctx = mockCtx();
    new MarkerTriangle(50, 100, "entry").draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledWith(50, 100);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 45, 108);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 55, 108);
  });

  it("points up (extends to smaller y) for an exit, tip at (x, y)", () => {
    const ctx = mockCtx();
    new MarkerTriangle(50, 100, "exit").draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledWith(50, 100);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 45, 92);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 55, 92);
  });

  it("fills entries green and exits red", () => {
    const entry = mockCtx();
    new MarkerTriangle(0, 0, "entry").draw(entry);
    expect(entry.fillStyle).toBe("#26a69a");

    const exit = mockCtx();
    new MarkerTriangle(0, 0, "exit").draw(exit);
    expect(exit.fillStyle).toBe("#ef5350");
  });

  it("exposes isEntry for a caller that wants it without re-deriving from color", () => {
    expect(new MarkerTriangle(0, 0, "entry").isEntry).toBe(true);
    expect(new MarkerTriangle(0, 0, "exit").isEntry).toBe(false);
  });
});
