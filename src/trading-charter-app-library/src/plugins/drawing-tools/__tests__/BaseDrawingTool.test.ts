import { BaseDrawingTool } from "../BaseDrawingTool.js";

/** Minimal concrete subclass - just enough to exercise the shared bookkeeping without any of a real tool's own draw()/hitTest() logic getting in the way. */
class StubTool extends BaseDrawingTool {
  readonly name = "stub";
  readonly maxPoints = 2;
  drawCallCount = 0;

  draw(): void {
    this.drawCallCount++;
  }

  hitTest(): boolean {
    return false;
  }
}

describe("BaseDrawingTool", () => {
  it("starts with an empty points buffer", () => {
    const tool = new StubTool();
    expect(tool.points).toEqual([]);
  });

  it("accumulates points up to maxPoints", () => {
    const tool = new StubTool();
    tool.addPoint({ time: 1, price: 100 });
    expect(tool.points).toHaveLength(1);
    tool.addPoint({ time: 2, price: 110 });
    expect(tool.points).toHaveLength(2);
  });

  it("ignores an extra addPoint() call once maxPoints is already reached, rather than accumulating a third or replacing an earlier one", () => {
    // ChartCore never actually calls addPoint() again once isComplete()
    // is true (it pushes this instance to its own drawings list and
    // starts a fresh one instead - see DrawingTool's own doc comment),
    // but a direct caller (or a bug) doing so anyway should be a safe
    // no-op, not silent data corruption.
    const tool = new StubTool();
    tool.addPoint({ time: 1, price: 100 });
    tool.addPoint({ time: 2, price: 110 });
    tool.addPoint({ time: 3, price: 120 });
    expect(tool.points).toEqual([
      { time: 1, price: 100 },
      { time: 2, price: 110 },
    ]);
  });

  it("isComplete() is false until maxPoints have been placed, true once they have", () => {
    const tool = new StubTool();
    expect(tool.isComplete()).toBe(false);
    tool.addPoint({ time: 1, price: 100 });
    expect(tool.isComplete()).toBe(false);
    tool.addPoint({ time: 2, price: 110 });
    expect(tool.isComplete()).toBe(true);
  });

  it("addPoint() clears any pending previewPoint - a committed point replaces the ghost it was showing", () => {
    const tool = new StubTool();
    tool.setPreviewPoint({ time: 5, price: 50 });
    expect(tool.previewPoint).toEqual({ time: 5, price: 50 });
    tool.addPoint({ time: 1, price: 100 });
    expect(tool.previewPoint).toBeNull();
  });

  it("setPreviewPoint(null) clears a previously-set preview", () => {
    const tool = new StubTool();
    tool.setPreviewPoint({ time: 5, price: 50 });
    tool.setPreviewPoint(null);
    expect(tool.previewPoint).toBeNull();
  });

  it("assigns each instance its own unique id", () => {
    const a = new StubTool();
    const b = new StubTool();
    expect(a.id).toEqual(expect.any(String));
    expect(a.id).not.toEqual(b.id);
  });

  it("defaults selected to false, settable directly", () => {
    const tool = new StubTool();
    expect(tool.selected).toBe(false);
    tool.selected = true;
    expect(tool.selected).toBe(true);
  });

  it("a maxPoints=1 subclass completes on the very first point", () => {
    class SinglePointTool extends BaseDrawingTool {
      readonly name = "single";
      readonly maxPoints = 1;
      draw(): void {}
      hitTest(): boolean {
        return false;
      }
    }
    const tool = new SinglePointTool();
    tool.addPoint({ time: 1, price: 100 });
    expect(tool.points).toEqual([{ time: 1, price: 100 }]);
    expect(tool.isComplete()).toBe(true);
  });

  it("defaults color to a defined value a subclass can override", () => {
    const tool = new StubTool();
    expect(typeof tool.color).toBe("string");
    tool.color = "#ff0000";
    expect(tool.color).toBe("#ff0000");
  });
});
