/**
 * Abstract base for every primitive this library draws directly onto a
 * Canvas 2D context. A `Shape` owns its own geometry and color and knows
 * how to render itself given nothing but a context — concrete chart
 * elements (a candle body, a wick, a volume bar) are built by composing or
 * subclassing these primitives instead of each writing its own raw
 * `ctx.fillRect`/`ctx.stroke` calls. That matters for two reasons: the
 * pixel-snapping rules in `../../utils/pixel.ts` then only have to be
 * applied once per primitive kind instead of at every call site, and a
 * shape can be unit-tested on its own (construct it, hand it a mock
 * context, assert what got drawn) without needing a real `<canvas>` or a
 * running `ChartCore`.
 *
 * This is intentionally minimal — no shared transform, rotation, or
 * hit-testing machinery — because nothing in this chart needs it yet. Add
 * capability here only once a second concrete shape actually needs it too;
 * speculative shared behavior is harder to remove than to add later.
 */

/**
 * A single (x, y) pixel coordinate, in the same CSS-pixel space every
 * `Shape` draws in. The common currency multi-point primitives
 * (`./Polyline.ts`, `./Triangle.ts`) take their geometry in, so a caller
 * building either one doesn't need to remember a different tuple/array
 * shape per primitive.
 */
export interface Point {
  x: number;
  y: number;
}

export abstract class Shape {
  /**
   * @param color CSS color string (e.g. `"#26a69a"`, `"green"`) this shape
   *   renders itself in. Stored as a plain public field rather than behind
   *   a getter/setter because nothing here needs to react to it changing —
   *   a shape is cheap to construct fresh with a new color instead.
   */
  constructor(public color: string) {}

  /**
   * Render this shape onto `ctx`. Implementations work in the same
   * CSS-pixel coordinate space every draw call in this library uses (see
   * `ChartCore`'s devicePixelRatio handling) — never device pixels
   * directly — and are expected to leave the context's drawing state
   * (fillStyle, strokeStyle, lineWidth, …) as they found it, typically via
   * `ctx.save()`/`ctx.restore()`.
   */
  abstract draw(ctx: CanvasRenderingContext2D): void;
}
