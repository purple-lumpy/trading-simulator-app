import { Triangle } from "./Triangle.js";
import type { Marker } from "../types.js";

/** Marker fill colors — entry (long/short opened) vs. exit (position closed). Matches `upColor`/`downColor`'s green/red convention elsewhere, but kept as its own constants rather than reusing `ChartOptions` colors: an entry/exit marker's color is about the *action*, not whether that bar happened to close up or down. */
const ENTRY_COLOR = "#26a69a";
const EXIT_COLOR = "#ef5350";

/** Half the triangle's base width, in CSS pixels. */
const HALF_WIDTH = 5;
/** The triangle's height (tip to base), in CSS pixels. */
const HEIGHT = 8;

/**
 * One entry/exit marker, drawn as a small filled triangle whose tip sits
 * exactly at the marker's (time, price) pixel position — pointing down
 * for an entry (as if planting a flag from above) and up for an exit.
 * Extends `Triangle` the same way `Wick` extends `Line`: the base class
 * stays a generic three-point fill, and this subclass's whole job is
 * resolving those three points (and the fill color) from a domain
 * concept — here, a `Marker`'s `kind` — before handing them up via
 * `super()`.
 */
export class MarkerTriangle extends Triangle {
  /** Whether this marker is an entry (`true`) or an exit (`false`) — exposed for a caller that wants to know without re-deriving it from `color`. */
  readonly isEntry: boolean;

  /**
   * @param x Tip x, in CSS pixels — typically the marker's candle center.
   * @param y Tip y, in CSS pixels — the marker's price, already mapped through a `PriceScale`.
   * @param kind `"entry"` points the triangle down from the tip (into the price it marks); `"exit"` points it up.
   */
  constructor(x: number, y: number, kind: Marker["kind"]) {
    const isEntry = kind === "entry";
    const direction = isEntry ? 1 : -1; // +1 = triangle extends downward in canvas y (larger y is lower on screen), -1 = upward
    const color = isEntry ? ENTRY_COLOR : EXIT_COLOR;
    super(
      { x, y },
      { x: x - HALF_WIDTH, y: y + HEIGHT * direction },
      { x: x + HALF_WIDTH, y: y + HEIGHT * direction },
      color
    );
    this.isEntry = isEntry;
  }
}
