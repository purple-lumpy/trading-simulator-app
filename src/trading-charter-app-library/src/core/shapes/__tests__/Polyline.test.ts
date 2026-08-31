import { Polyline } from "../Polyline.js";

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

describe("Polyline", () => {
  it("starts the path at the first point and lines to every point after it", () => {
    const ctx = mockCtx();
    new Polyline([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 2 }], "#42a5f5").draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 10, 5);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 20, 2);
  });

  it("strokes in the given color", () => {
    const ctx = mockCtx();
    new Polyline([{ x: 0, y: 0 }, { x: 1, y: 1 }], "#ff00ff").draw(ctx);
    expect(ctx.strokeStyle).toBe("#ff00ff");
  });

  it("defaults to a 1.5px line width but accepts a custom one", () => {
    const ctx = mockCtx();
    new Polyline([{ x: 0, y: 0 }, { x: 1, y: 1 }], "#000").draw(ctx);
    expect(ctx.lineWidth).toBe(1.5);

    const ctx2 = mockCtx();
    new Polyline([{ x: 0, y: 0 }, { x: 1, y: 1 }], "#000", 3).draw(ctx2);
    expect(ctx2.lineWidth).toBe(3);
  });

  it("draws a harmless empty stroke for zero or one point", () => {
    const ctx = mockCtx();
    new Polyline([], "#000").draw(ctx);
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledTimes(1);

    const ctx2 = mockCtx();
    new Polyline([{ x: 5, y: 5 }], "#000").draw(ctx2);
    expect(ctx2.moveTo).toHaveBeenCalledWith(5, 5);
    expect(ctx2.lineTo).not.toHaveBeenCalled();
  });

  it("saves and restores context state around the stroke", () => {
    const ctx = mockCtx();
    new Polyline([{ x: 0, y: 0 }, { x: 1, y: 1 }], "#000").draw(ctx);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
});
