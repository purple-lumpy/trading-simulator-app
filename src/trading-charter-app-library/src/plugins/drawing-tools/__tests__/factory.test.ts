import { createDrawingTool } from "../factory.js";
import { HorizontalLine } from "../HorizontalLine.js";
import { VerticalLine } from "../VerticalLine.js";
import { Trendline } from "../Trendline.js";
import { TraceLine } from "../TraceLine.js";

describe("createDrawingTool", () => {
  it("builds a HorizontalLine for 'horizontal-line'", () => {
    expect(createDrawingTool("horizontal-line")).toBeInstanceOf(HorizontalLine);
  });

  it("builds a VerticalLine for 'vertical-line'", () => {
    expect(createDrawingTool("vertical-line")).toBeInstanceOf(VerticalLine);
  });

  it("builds a Trendline for 'trendline'", () => {
    expect(createDrawingTool("trendline")).toBeInstanceOf(Trendline);
  });

  it("builds a TraceLine for 'trace'", () => {
    expect(createDrawingTool("trace")).toBeInstanceOf(TraceLine);
  });

  it("returns a brand-new instance on every call, never a shared singleton", () => {
    const a = createDrawingTool("horizontal-line");
    const b = createDrawingTool("horizontal-line");
    expect(a).not.toBe(b);
    expect(a.id).not.toEqual(b.id);
  });
});
