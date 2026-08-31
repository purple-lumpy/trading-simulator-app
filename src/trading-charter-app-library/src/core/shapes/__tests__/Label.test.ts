import { Label } from "../Label.js";

function mockCtx(textWidth = 40) {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn(() => ({ width: textWidth })),
    fillStyle: "",
    strokeStyle: "",
    font: "",
  } as unknown as CanvasRenderingContext2D;
}

describe("Label", () => {
  it("sizes its background to the measured text width plus padding on both sides", () => {
    const ctx = mockCtx(40);
    new Label(10, 20, "hello", { textColor: "#fff", backgroundColor: "#000" }).draw(ctx);
    // default padding 6, default height 20 -> width = 40 + 12 = 52
    expect(ctx.fillRect).toHaveBeenCalledWith(10, 20, 52, 20);
  });

  it("draws no border when borderColor is omitted", () => {
    const ctx = mockCtx();
    new Label(0, 0, "x", { textColor: "#fff", backgroundColor: "#000" }).draw(ctx);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });

  it("draws a border at the same box geometry when borderColor is set", () => {
    const ctx = mockCtx(40);
    new Label(10, 20, "hello", { textColor: "#fff", backgroundColor: "#000", borderColor: "#888" }).draw(ctx);
    expect(ctx.strokeStyle).toBe("#888");
    expect(ctx.strokeRect).toHaveBeenCalledWith(10, 20, 52, 20);
  });

  it("draws the text inset by padding from the left and bottom of the box", () => {
    const ctx = mockCtx(40);
    new Label(10, 20, "hello", { textColor: "#fff", backgroundColor: "#000", padding: 6, height: 20 }).draw(ctx);
    expect(ctx.fillText).toHaveBeenCalledWith("hello", 16, 34); // x + padding, y + height - padding
  });

  it("respects a custom padding and height", () => {
    const ctx = mockCtx(40);
    new Label(0, 0, "hello", { textColor: "#fff", backgroundColor: "#000", padding: 10, height: 30 }).draw(ctx);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 60, 30); // 40 + 10*2
    expect(ctx.fillText).toHaveBeenCalledWith("hello", 10, 20);
  });
});
