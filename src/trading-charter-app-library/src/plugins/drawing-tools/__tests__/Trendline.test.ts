import { Trendline } from "../Trendline.js";
import { ANCHOR_DOT_RADIUS } from "../BaseDrawingTool.js";

function mockCtx() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    setLineDash: jest.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe("Trendline", () => {
  it("collects up to two points; a third addPoint() call is a no-op (ChartCore starts a fresh instance instead in practice)", () => {
    const tool = new Trendline();
    tool.addPoint({ time: 1, price: 100 });
    tool.addPoint({ time: 2, price: 110 });
    expect(tool.points).toHaveLength(2);

    tool.addPoint({ time: 3, price: 120 });
    expect(tool.points).toEqual([
      { time: 1, price: 100 },
      { time: 2, price: 110 },
    ]);
  });

  it("draws nothing at all before any point is placed", () => {
    const tool = new Trendline();
    const ctx = mockCtx();
    tool.draw(ctx, () => ({ x: 0, y: 0 }));
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it("after the first click, draws a small anchor dot at that point - the 'pointer' the click adds to the chart", () => {
    const tool = new Trendline();
    const ctx = mockCtx();
    tool.addPoint({ time: 1, price: 100 });

    const toPixel = jest.fn((time: number, price: number) => ({ x: time * 10, y: price }));
    tool.draw(ctx, toPixel);

    expect(ctx.arc).toHaveBeenCalledWith(10, 100, ANCHOR_DOT_RADIUS, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalled();
  });

  it("while placing the second point, a previewPoint (set as the mouse moves) draws a dashed rubber-band line from the anchor", () => {
    const tool = new Trendline();
    const ctx = mockCtx();
    tool.addPoint({ time: 1, price: 100 });
    tool.setPreviewPoint({ time: 5, price: 150 });

    const toPixel = jest.fn((time: number, price: number) => ({ x: time * 10, y: price }));
    tool.draw(ctx, toPixel);

    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 100);
    expect(ctx.lineTo).toHaveBeenCalledWith(50, 150);
  });

  it("with only the anchor placed and no previewPoint yet, draws just the anchor dot and no line", () => {
    const tool = new Trendline();
    const ctx = mockCtx();
    tool.addPoint({ time: 1, price: 100 });
    tool.draw(ctx, () => ({ x: 0, y: 0 }));
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.moveTo).not.toHaveBeenCalled();
  });

  it("draws a solid line between the two placed points once complete, with no dash and no anchor dot", () => {
    const tool = new Trendline();
    const ctx = mockCtx();
    tool.addPoint({ time: 1, price: 100 });
    tool.addPoint({ time: 2, price: 110 });

    const toPixel = jest.fn((time: number) => ({ x: time * 10, y: 0 }));
    tool.draw(ctx, toPixel);

    expect(toPixel).toHaveBeenCalledWith(1, 100);
    expect(toPixel).toHaveBeenCalledWith(2, 110);
    expect(ctx.setLineDash).toHaveBeenCalledWith([]);
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(20, 0);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("hitTest: within tolerance of the segment between the two points counts as a hit", () => {
    const tool = new Trendline();
    tool.addPoint({ time: 0, price: 0 });
    tool.addPoint({ time: 10, price: 0 });
    // toPixel maps (time, price) -> (x=time*10, y=0), a horizontal segment from (0,0) to (100,0)
    const toPixel = (time: number) => ({ x: time * 10, y: 0 });

    expect(tool.hitTest(50, 0, toPixel)).toBe(true); // midpoint, exact
    expect(tool.hitTest(50, 4, toPixel)).toBe(true); // just within tolerance
    expect(tool.hitTest(50, 40, toPixel)).toBe(false); // far off the segment
    expect(tool.hitTest(-9999, 0, toPixel)).toBe(false); // off the segment's own ends, not the infinite line
  });

  it("hitTest is false until both points are placed", () => {
    const tool = new Trendline();
    tool.addPoint({ time: 0, price: 0 });
    expect(tool.hitTest(0, 0, () => ({ x: 0, y: 0 }))).toBe(false);
  });
});
