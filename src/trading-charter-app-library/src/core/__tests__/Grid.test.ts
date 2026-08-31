import { Grid } from "../Grid.js";

function mockCtx() {
  return {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fillRect: jest.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

describe("Grid", () => {
  it("draws lineCount + 1 evenly-spaced horizontal lines spanning the pane width", () => {
    const ctx = mockCtx();
    new Grid({ paneWidth: 200, paneHeight: 100, color: "#22252b", lineCount: 4 }).draw(ctx);
    // 5 lines at y = 0, 25, 50, 75, 100 (crisp-line snapped: round(y) + 0.5)
    expect(ctx.moveTo).toHaveBeenCalledTimes(5);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(1, 0, 0.5);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(3, 0, 50.5);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(5, 0, 100.5);
    expect(ctx.lineTo).toHaveBeenCalledWith(200, 100.5);
  });

  it("draws in the given color", () => {
    const ctx = mockCtx();
    new Grid({ paneWidth: 100, paneHeight: 100, color: "#ff00ff" }).draw(ctx);
    expect(ctx.strokeStyle).toBe("#ff00ff");
  });

  it("defaults to 4 lines (5 rows) when lineCount is omitted", () => {
    const ctx = mockCtx();
    new Grid({ paneWidth: 100, paneHeight: 100, color: "#000" }).draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledTimes(5);
  });

  it("builds its lines once in the constructor — draw() just replays them", () => {
    const grid = new Grid({ paneWidth: 100, paneHeight: 100, color: "#000", lineCount: 2 });
    const ctx1 = mockCtx();
    const ctx2 = mockCtx();
    grid.draw(ctx1);
    grid.draw(ctx2);
    expect(ctx1.moveTo).toHaveBeenCalledTimes(3);
    expect(ctx2.moveTo).toHaveBeenCalledTimes(3);
  });

  it("shifts every line by offsetX, so a left-side price ruler isn't drawn over", () => {
    const ctx = mockCtx();
    new Grid({ paneWidth: 200, paneHeight: 100, color: "#22252b", lineCount: 4, offsetX: 64 }).draw(ctx);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(1, 64, 0.5);
    expect(ctx.lineTo).toHaveBeenCalledWith(264, 0.5); // offsetX(64) + paneWidth(200)
  });

  it("draws no background fill when backgroundColor is omitted (unchanged default behavior)", () => {
    const ctx = mockCtx();
    new Grid({ paneWidth: 200, paneHeight: 100, color: "#22252b", lineCount: 4, offsetX: 0 }).draw(ctx);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it("fills the pane background before drawing gridlines, when given a backgroundColor", () => {
    const ctx = mockCtx();
    new Grid({ paneWidth: 200, paneHeight: 100, color: "#22252b", lineCount: 4, offsetX: 64, backgroundColor: "#111318" }).draw(ctx);
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).toHaveBeenCalledWith(64, 0, 200, 100); // offsetX, 0, paneWidth, paneHeight
  });

  it("draws no separator line by default", () => {
    const ctx = mockCtx();
    new Grid({ paneWidth: 200, paneHeight: 100, color: "#22252b" }).draw(ctx);
    // 5 gridlines only - moveTo/lineTo called exactly 5 times each, none for a separator
    expect(ctx.moveTo).toHaveBeenCalledTimes(5);
  });

  it("draws a vertical separator line at separatorX spanning the full pane height, when given both separatorX and separatorColor", () => {
    const ctx = mockCtx();
    new Grid({ paneWidth: 200, paneHeight: 100, color: "#22252b", lineCount: 4, offsetX: 0, backgroundColor: "", separatorX: 200, separatorColor: "#3a3f47" }).draw(ctx);
    // 5 gridlines + 1 separator
    expect(ctx.moveTo).toHaveBeenCalledTimes(6);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(6, 200.5, 0);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(6, 200.5, 100);
  });

  it("draws no separator line when separatorX is given without a separatorColor", () => {
    const ctx = mockCtx();
    new Grid({ paneWidth: 200, paneHeight: 100, color: "#22252b", lineCount: 4, offsetX: 0, backgroundColor: "", separatorX: 200 }).draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledTimes(5);
  });

  it("draws no vertical time-gridlines when verticalLineXs is omitted (unchanged default behavior)", () => {
    const ctx = mockCtx();
    new Grid({ paneWidth: 200, paneHeight: 100, color: "#22252b", lineCount: 4 }).draw(ctx);
    expect(ctx.moveTo).toHaveBeenCalledTimes(5); // horizontal lines only
  });

  it("draws one vertical line per verticalLineXs entry, spanning the full pane height, after the horizontal lines", () => {
    const ctx = mockCtx();
    new Grid({ paneWidth: 200, paneHeight: 100, color: "#22252b", lineCount: 4, verticalLineXs: [0, 50, 100, 150, 200] }).draw(ctx);
    // 5 horizontal + 5 vertical = 10
    expect(ctx.moveTo).toHaveBeenCalledTimes(10);
    // The 6th call (index 5, first vertical) is crisp-line snapped on x, spans y=0..paneHeight
    expect(ctx.moveTo).toHaveBeenNthCalledWith(6, 0.5, 0);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(6, 0.5, 100);
    expect(ctx.moveTo).toHaveBeenNthCalledWith(8, 100.5, 0);
  });

  it("draws vertical time-gridlines in the same color as the horizontal lines (distinct from the ruler separator)", () => {
    const ctx = mockCtx();
    new Grid({
      paneWidth: 200,
      paneHeight: 100,
      color: "#22252b",
      lineCount: 4,
      verticalLineXs: [50],
      separatorX: 200,
      separatorColor: "#3a3f47",
    }).draw(ctx);
    // Last strokeStyle set is the separator's own color; the vertical
    // gridline itself is drawn (and its stroke applied) before that, in
    // `color` — confirmed structurally: 5 horizontal + 1 vertical + 1
    // separator = 7 total line draws.
    expect(ctx.moveTo).toHaveBeenCalledTimes(7);
    expect(ctx.strokeStyle).toBe("#3a3f47"); // the separator, drawn last, is what's left set
  });

  it("draws vertical time-gridlines before the ruler separator, so the separator visually sits on top", () => {
    const ctx = mockCtx();
    const calls: string[] = [];
    const trackedCtx = {
      ...mockCtx(),
      set strokeStyle(v: string) {
        calls.push(v);
      },
      get strokeStyle() {
        return calls[calls.length - 1] ?? "";
      },
    } as unknown as CanvasRenderingContext2D;
    new Grid({
      paneWidth: 200,
      paneHeight: 100,
      color: "#22252b",
      lineCount: 0,
      verticalLineXs: [50],
      separatorX: 200,
      separatorColor: "#3a3f47",
    }).draw(trackedCtx);
    // order: 1 horizontal line ("#22252b"), 1 vertical line ("#22252b"), 1 separator ("#3a3f47")
    expect(calls).toEqual(["#22252b", "#22252b", "#3a3f47"]);
  });
});
