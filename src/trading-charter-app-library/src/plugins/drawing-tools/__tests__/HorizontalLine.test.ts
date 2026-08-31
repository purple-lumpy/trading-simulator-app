import { HorizontalLine } from "../HorizontalLine.js";
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

describe("HorizontalLine", () => {
  it("draws nothing until a point is placed or previewed", () => {
    const tool = new HorizontalLine();
    const ctx = mockCtx();
    tool.draw(ctx, () => ({ x: 0, y: 0 }));
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it("a second point replaces the first (maxPoints=1), rather than accumulating", () => {
    const tool = new HorizontalLine();
    tool.addPoint({ time: 1, price: 100 });
    tool.addPoint({ time: 2, price: 110 });
    // addPoint() past maxPoints is a no-op (see BaseDrawingTool) - in
    // practice ChartCore never calls it again once isComplete() is true,
    // it starts a fresh instance instead - so the first point stands.
    expect(tool.points).toEqual([{ time: 1, price: 100 }]);
  });

  it("strokes a solid line at the placed point's y, spanning LONG_SPAN either side of x=0, ignoring the point's own time", () => {
    const tool = new HorizontalLine();
    const ctx = mockCtx();
    tool.addPoint({ time: 42, price: 100 });

    const toPixel = jest.fn((_time: number, price: number) => ({ x: 0, y: price }));
    tool.draw(ctx, toPixel);

    expect(toPixel).toHaveBeenCalledWith(42, 100);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
    expect(ctx.moveTo).toHaveBeenCalledWith(-LONG_SPAN, 100);
    expect(ctx.lineTo).toHaveBeenCalledWith(LONG_SPAN, 100);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("before any point is placed, a previewPoint draws a dashed ghost line instead", () => {
    const tool = new HorizontalLine();
    const ctx = mockCtx();
    tool.setPreviewPoint({ time: 7, price: 250 });

    const toPixel = jest.fn((_time: number, price: number) => ({ x: 0, y: price }));
    tool.draw(ctx, toPixel);

    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    expect(ctx.moveTo).toHaveBeenCalledWith(-LONG_SPAN, 250);
    expect(ctx.lineTo).toHaveBeenCalledWith(LONG_SPAN, 250);
  });

  it("once a real point is placed, the ghost preview no longer applies even if previewPoint is somehow still set", () => {
    const tool = new HorizontalLine();
    tool.addPoint({ time: 42, price: 100 });
    const ctx = mockCtx();
    tool.draw(ctx, () => ({ x: 0, y: 100 }));
    expect(ctx.setLineDash).toHaveBeenCalledWith([]); // solid, not dashed
  });

  it("hitTest: within tolerance of the line's y counts as a hit, regardless of x", () => {
    const tool = new HorizontalLine();
    tool.addPoint({ time: 42, price: 100 });
    const toPixel = () => ({ x: 0, y: 200 });
    expect(tool.hitTest(9999, 200, toPixel)).toBe(true);
    expect(tool.hitTest(-9999, 204, toPixel)).toBe(true);
    expect(tool.hitTest(0, 220, toPixel)).toBe(false);
  });

  it("hitTest is false before any point is placed", () => {
    const tool = new HorizontalLine();
    expect(tool.hitTest(0, 0, () => ({ x: 0, y: 0 }))).toBe(false);
  });
});
