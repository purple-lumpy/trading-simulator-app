import { DashedLine } from "../DashedLine.js";

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

describe("DashedLine", () => {
  it("sets the dash pattern before stroking, defaulting to [6, 4]", () => {
    const ctx = mockCtx();
    new DashedLine(0, 0, 10, 10, "blue").draw(ctx);
    expect(ctx.setLineDash).toHaveBeenCalledWith([6, 4]);
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(10, 10);
  });

  it("accepts a custom dash pattern", () => {
    const ctx = mockCtx();
    new DashedLine(0, 0, 10, 10, "blue", [4, 4]).draw(ctx);
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 4]);
  });

  it("nests its own save/restore inside Line's, so nothing leaks to the next draw", () => {
    const ctx = mockCtx();
    new DashedLine(0, 0, 10, 10, "blue").draw(ctx);
    expect(ctx.save).toHaveBeenCalledTimes(2); // DashedLine's own + inherited Line's
    expect(ctx.restore).toHaveBeenCalledTimes(2);
  });
});
