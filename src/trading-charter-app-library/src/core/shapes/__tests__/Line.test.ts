import { Line } from "../Line.js";

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

describe("Line", () => {
  it("strokes from (x1, y1) to (x2, y2) in its own color, with no snapping applied", () => {
    const ctx = mockCtx();
    new Line(1.2, 3.4, 5.6, 7.8, "purple").draw(ctx);
    expect(ctx.strokeStyle).toBe("purple");
    expect(ctx.moveTo).toHaveBeenCalledWith(1.2, 3.4);
    expect(ctx.lineTo).toHaveBeenCalledWith(5.6, 7.8);
  });

  it("defaults to a 1px hairline but accepts a custom width", () => {
    const ctx = mockCtx();
    new Line(0, 0, 10, 10, "black").draw(ctx);
    expect(ctx.lineWidth).toBe(1);

    new Line(0, 0, 10, 10, "black", 2.5).draw(ctx);
    expect(ctx.lineWidth).toBe(2.5);
  });

  it("saves and restores context state around the stroke", () => {
    const ctx = mockCtx();
    new Line(0, 0, 1, 1, "black").draw(ctx);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
});
