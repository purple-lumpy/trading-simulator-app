import { Triangle } from "../Triangle.js";

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

describe("Triangle", () => {
  it("traces a path through its three vertices and fills it", () => {
    const ctx = mockCtx();
    new Triangle({ x: 10, y: 0 }, { x: 5, y: 8 }, { x: 15, y: 8 }, "#26a69a").draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 0);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 5, 8);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 15, 8);
    expect(ctx.closePath).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  it("fills in the given color", () => {
    const ctx = mockCtx();
    new Triangle({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, "#ff00ff").draw(ctx);
    expect(ctx.fillStyle).toBe("#ff00ff");
  });

  it("saves and restores context state around the fill", () => {
    const ctx = mockCtx();
    new Triangle({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, "#000").draw(ctx);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
});
