import type { DrawingTool } from "../../core/types.js";
import { HorizontalLine } from "./HorizontalLine.js";
import { VerticalLine } from "./VerticalLine.js";
import { Trendline } from "./Trendline.js";
import { TraceLine } from "./TraceLine.js";

/**
 * The set of concrete `DrawingTool` types `ChartCore` knows how to
 * build by name - a union of plain string literals (not the classes
 * themselves) so a consumer (e.g. simulator-app's `DrawingToolName`,
 * which adds its own `"none"` for the "cross"/no-tool state on top of
 * this) can select a tool the same serializable way a `<button>` or a
 * URL/query param would, without importing any tool class directly.
 */
export type DrawingToolTypeName = "horizontal-line" | "vertical-line" | "trendline" | "trace";

/**
 * Builds a brand-new instance of the named tool type - never a shared
 * singleton. `ChartCore.setActiveDrawingTool()` calls this once when a
 * tool type is first selected (to start an in-progress placement) and
 * again every time a placement completes, so the *next* click starts
 * placing an independent new instance rather than continuing to edit
 * the one that was just finished - see `DrawingTool`'s own doc comment
 * for why that's what lets any number of lines of the same type coexist
 * on screen permanently instead of each new one replacing the last.
 */
export function createDrawingTool(name: DrawingToolTypeName): DrawingTool {
  switch (name) {
    case "horizontal-line":
      return new HorizontalLine();
    case "vertical-line":
      return new VerticalLine();
    case "trendline":
      return new Trendline();
    case "trace":
      return new TraceLine();
  }
}
