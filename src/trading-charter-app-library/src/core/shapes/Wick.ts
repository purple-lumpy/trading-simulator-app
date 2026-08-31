import { crispLine, crispRect } from "../../utils/pixel.js";
import { Line } from "./Line.js";

/**
 * A candle's high-low wick: always exactly vertical, always a 1px stroke.
 * `Wick` is what `Line` describes as "a subclass that knows its own
 * orientation" — it adds the specific pixel-snapping a vertical hairline
 * needs (see `../pixel.ts`): the shared x gets the half-pixel `crispLine`
 * offset so the stroke doesn't straddle two device-pixel columns, while
 * the endpoints just need `crispRect`'s plain rounding, since a line's
 * own length doesn't blur the way its 1px width does.
 */
export class Wick extends Line {
  /**
   * @param x Center x of the candle the wick belongs to, in CSS pixels
   *   (unsnapped — this constructor applies the crisp offset itself).
   * @param yTop y of the wick's upper end (the candle's high price), in
   *   CSS pixels.
   * @param yBottom y of the wick's lower end (the candle's low price), in
   *   CSS pixels.
   * @param color Stroke color — normally the same up/down color as the
   *   candle body it belongs to.
   */
  constructor(x: number, yTop: number, yBottom: number, color: string) {
    const crispX = crispLine(x);
    super(crispX, crispRect(yTop), crispX, crispRect(yBottom), color);
  }
}
