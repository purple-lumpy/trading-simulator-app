import { TraceLine } from "../TraceLine.js";
import { ANCHOR_DOT_RADIUS } from "../BaseDrawingTool.js";

function mockCtx() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    closePath: jest.fn(),
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

describe("TraceLine", () => {
  it("keeps accepting points well past two - unlike Trendline, there's no fixed count", () => {
    const tool = new TraceLine();
    tool.addPoint({ time: 1, price: 100 });
    tool.addPoint({ time: 2, price: 110 });
    tool.addPoint({ time: 3, price: 90 });
    tool.addPoint({ time: 4, price: 120 });
    expect(tool.points).toHaveLength(4);
  });

  it("is not complete no matter how many points are placed, until finish() is called", () => {
    const tool = new TraceLine();
    tool.addPoint({ time: 1, price: 100 });
    tool.addPoint({ time: 2, price: 110 });
    tool.addPoint({ time: 3, price: 90 });
    expect(tool.isComplete()).toBe(false);
  });

  it("finish() completes it once at least two points are placed", () => {
    const tool = new TraceLine();
    tool.addPoint({ time: 1, price: 100 });
    tool.addPoint({ time: 2, price: 110 });
    tool.finish();
    expect(tool.isComplete()).toBe(true);
  });

  it("finish() is a no-op (stays incomplete) with fewer than two points - a lone click has nothing to draw a line between", () => {
    const tool = new TraceLine();
    tool.finish();
    expect(tool.isComplete()).toBe(false);

    tool.addPoint({ time: 1, price: 100 });
    tool.finish();
    expect(tool.isComplete()).toBe(false);
  });

  it("draws nothing at all before any point is placed", () => {
    const tool = new TraceLine();
    const ctx = mockCtx();
    tool.draw(ctx, () => ({ x: 0, y: 0 }));
    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it("after the first click, draws a small anchor dot - same 'pointer' treatment as Trendline's first point", () => {
    const tool = new TraceLine();
    const ctx = mockCtx();
    tool.addPoint({ time: 1, price: 100 });

    const toPixel = jest.fn((time: number, price: number) => ({ x: time * 10, y: price }));
    tool.draw(ctx, toPixel);

    expect(ctx.arc).toHaveBeenCalledWith(10, 100, ANCHOR_DOT_RADIUS, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalled();
  });

  it("draws one continuous stroked path through every placed point, in order, once there are at least two", () => {
    const tool = new TraceLine();
    const ctx = mockCtx();
    tool.addPoint({ time: 0, price: 0 });
    tool.addPoint({ time: 1, price: 10 });
    tool.addPoint({ time: 2, price: -5 });

    const toPixel = jest.fn((time: number, price: number) => ({ x: time * 10, y: price }));
    tool.draw(ctx, toPixel);

    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(10, 10);
    expect(ctx.lineTo).toHaveBeenCalledWith(20, -5);
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("while still placing, a previewPoint draws a dashed rubber-band line from the LAST committed point, not the first", () => {
    const tool = new TraceLine();
    const ctx = mockCtx();
    tool.addPoint({ time: 0, price: 0 });
    tool.addPoint({ time: 1, price: 10 });
    tool.setPreviewPoint({ time: 5, price: 50 });

    const toPixel = jest.fn((time: number, price: number) => ({ x: time * 10, y: price }));
    tool.draw(ctx, toPixel);

    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
    expect(ctx.moveTo).toHaveBeenLastCalledWith(10, 10); // last committed point, not (0, 0)
    expect(ctx.lineTo).toHaveBeenLastCalledWith(50, 50);
  });

  it("stops drawing the rubber-band preview once finished, even if a previewPoint is still set", () => {
    const tool = new TraceLine();
    const ctx = mockCtx();
    tool.addPoint({ time: 0, price: 0 });
    tool.addPoint({ time: 1, price: 10 });
    tool.setPreviewPoint({ time: 5, price: 50 });
    tool.finish();

    const toPixel = jest.fn((time: number, price: number) => ({ x: time * 10, y: price }));
    tool.draw(ctx, toPixel);

    expect(ctx.setLineDash).not.toHaveBeenCalledWith([4, 4]);
  });

  it("hitTest: within tolerance of ANY one leg counts as a hit, not just the first", () => {
    const tool = new TraceLine();
    // A "W"-like zigzag: (0,0) -> (10,10) -> (20,0) -> (30,10), each leg
    // mapped to a straight horizontal segment at a distinct y by toPixel
    // below so each leg is easy to target independently.
    tool.addPoint({ time: 0, price: 0 });
    tool.addPoint({ time: 1, price: 0 });
    tool.addPoint({ time: 2, price: 0 });
    const toPixel = (time: number) => (time === 0 ? { x: 0, y: 0 } : time === 1 ? { x: 100, y: 0 } : { x: 100, y: 100 });

    expect(tool.hitTest(50, 0, toPixel)).toBe(true); // first leg (horizontal)
    expect(tool.hitTest(100, 50, toPixel)).toBe(true); // second leg (vertical)
    expect(tool.hitTest(9999, 9999, toPixel)).toBe(false); // nowhere near either leg
  });

  it("hitTest is false until at least two points are placed", () => {
    const tool = new TraceLine();
    tool.addPoint({ time: 0, price: 0 });
    expect(tool.hitTest(0, 0, () => ({ x: 0, y: 0 }))).toBe(false);
  });

  it("draws no arrowhead (closePath, the shape drawArrowhead() always ends with) with only one point placed", () => {
    const tool = new TraceLine();
    const ctx = mockCtx();
    tool.addPoint({ time: 0, price: 0 });
    tool.draw(ctx, () => ({ x: 0, y: 0 }));
    expect(ctx.closePath).not.toHaveBeenCalled();
  });

  it("draws an arrowhead (closePath) once a second point makes a real segment to point along", () => {
    const tool = new TraceLine();
    const ctx = mockCtx();
    tool.addPoint({ time: 0, price: 0 });
    tool.addPoint({ time: 1, price: 10 });
    tool.draw(ctx, (time, price) => ({ x: time * 10, y: price }));
    expect(ctx.closePath).toHaveBeenCalled();
  });

  it("the arrowhead sits at the LAST point, pointing back toward the second-to-last - not the first segment", () => {
    const tool = new TraceLine();
    const ctx = mockCtx();
    tool.addPoint({ time: 0, price: 0 });
    tool.addPoint({ time: 1, price: 10 });
    tool.addPoint({ time: 2, price: -5 });

    const toPixel = (time: number, price: number) => ({ x: time * 10, y: price });
    tool.draw(ctx, toPixel);

    // moveTo(20, -5) is the arrowhead's own tip (last point) - distinct
    // from the polyline's own moveTo(0, 0) at its start.
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0); // polyline start
    expect(ctx.moveTo).toHaveBeenCalledWith(20, -5); // arrowhead tip = last point, not the first or middle one
  });

  it("moves as more points are added - the arrowhead always tracks the current last segment", () => {
    const tool = new TraceLine();
    const toPixel = (time: number, price: number) => ({ x: time * 10, y: price });

    tool.addPoint({ time: 0, price: 0 });
    tool.addPoint({ time: 1, price: 10 });
    const ctxAfterTwo = mockCtx();
    tool.draw(ctxAfterTwo, toPixel);
    expect(ctxAfterTwo.moveTo).toHaveBeenCalledWith(10, 10); // arrowhead tip at (1, 10)

    tool.addPoint({ time: 2, price: 20 });
    const ctxAfterThree = mockCtx();
    tool.draw(ctxAfterThree, toPixel);
    expect(ctxAfterThree.moveTo).toHaveBeenCalledWith(20, 20); // now at the new last point instead
  });

  it("still draws the arrowhead on the finished, permanent trace, not just while placing", () => {
    const tool = new TraceLine();
    const ctx = mockCtx();
    tool.addPoint({ time: 0, price: 0 });
    tool.addPoint({ time: 1, price: 10 });
    tool.finish();
    expect(tool.isComplete()).toBe(true);

    const toPixel = (time: number, price: number) => ({ x: time * 10, y: price });
    tool.draw(ctx, toPixel);
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 10);
  });
});
