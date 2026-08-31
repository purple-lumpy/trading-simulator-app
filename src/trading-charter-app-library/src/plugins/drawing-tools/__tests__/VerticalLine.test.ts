import { VerticalLine } from "../VerticalLine.js";
import { LONG_SPAN } from "../BaseDrawingTool.js";

function mockCtx() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    setLineDash: jest.fn(),
    strokeStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe("VerticalLine", () => {
  it("draws nothing until a point is placed or previewed", () => {
    const tool = new VerticalLine();
    const ctx = mockCtx();
    tool.draw(ctx, () => ({ x: 0, y: 0 }));
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it("a second point replaces the first (maxPoints=1), rather than accumulating", () => {
    const tool = new VerticalLine();
    tool.addPoint({ time: 1, price: 100 });
    tool.addPoint({ time: 2, price: 110 });
    expect(tool.points).toEqual([{ time: 1, price: 100 }]);
  });

  it("strokes a solid line at the placed point's x, spanning LONG_SPAN either side of y=0, ignoring the point's own price", () => {
    const tool = new VerticalLine();
    const ctx = mockCtx();
    tool.addPoint({ time: 42, price: 100 });

    const toPixel = jest.fn((time: number) => ({ x: time, y: 0 }));
    tool.draw(ctx, toPixel);

    expect(toPixel).toHaveBeenCalledWith(42, 100);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
    expect(ctx.moveTo).toHaveBeenCalledWith(42, -LONG_SPAN);
    expect(ctx.lineTo).toHaveBeenCalledWith(42, LONG_SPAN);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("before any point is placed, a previewPoint draws a dashed ghost line instead", () => {
    const tool = new VerticalLine();
    const ctx = mockCtx();
    tool.setPreviewPoint({ time: 77, price: 5 });

    const toPixel = jest.fn((time: number) => ({ x: time, y: 0 }));
    tool.draw(ctx, toPixel);

    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    expect(ctx.moveTo).toHaveBeenCalledWith(77, -LONG_SPAN);
    expect(ctx.lineTo).toHaveBeenCalledWith(77, LONG_SPAN);
  });

  it("hitTest: within tolerance of the line's x counts as a hit, regardless of y", () => {
    const tool = new VerticalLine();
    tool.addPoint({ time: 42, price: 100 });
    const toPixel = () => ({ x: 300, y: 0 });
    expect(tool.hitTest(300, 9999, toPixel)).toBe(true);
    expect(tool.hitTest(304, -9999, toPixel)).toBe(true);
    expect(tool.hitTest(320, 0, toPixel)).toBe(false);
  });

  it("hitTest is false before any point is placed", () => {
    const tool = new VerticalLine();
    expect(tool.hitTest(0, 0, () => ({ x: 0, y: 0 }))).toBe(false);
  });
});
