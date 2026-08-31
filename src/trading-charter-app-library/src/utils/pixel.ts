/**
 * Canvas hairline rendering blurs unless coordinates land on exact device
 * pixels. A 1px-wide stroke centered on an integer coordinate straddles
 * two pixel rows and gets anti-aliased into a soft 2px smudge; offsetting
 * by 0.5 puts it inside a single row instead. Filled rects don't need the
 * 0.5 offset — an integer edge is already crisp — but they do need
 * rounding so a fractional coordinate (from price/time-scale math) doesn't
 * quietly reintroduce the same blur.
 *
 * This is the fix for "bars look fuzzy, especially zoomed into a
 * screenshot" — see ChartCore's devicePixelRatio handling for the other
 * half (a backing store that actually has the pixels to be sharp with).
 *
 * Lives in `src/utils/`, not `src/core/`, because there's nothing
 * chart-domain-specific about it — it's generic canvas-coordinate math
 * that any drawable (a shape in `core/shapes/`, or something outside the
 * chart entirely) can use, which is exactly what `core/shapes/` does.
 */

/** Snap a coordinate for a 1px stroke (wicks, grid lines, price lines). */
export function crispLine(value: number): number {
  return Math.round(value) + 0.5;
}

/** Snap a coordinate/length for a filled shape (candle bodies, volume bars). */
export function crispRect(value: number): number {
  return Math.round(value);
}
