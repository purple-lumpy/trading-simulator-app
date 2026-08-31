import { crispLine, crispRect } from "../pixel.js";

describe("crispLine", () => {
  it("rounds to the nearest integer then adds a half-pixel offset", () => {
    expect(crispLine(10)).toBe(10.5);
    expect(crispLine(10.2)).toBe(10.5);
    expect(crispLine(10.6)).toBe(11.5);
  });

  it("keeps the half-pixel offset for negative and zero input", () => {
    expect(crispLine(0)).toBe(0.5);
    expect(crispLine(-3)).toBe(-2.5);
  });
});

describe("crispRect", () => {
  it("rounds fractional coordinates to whole device pixels", () => {
    expect(crispRect(10.4)).toBe(10);
    expect(crispRect(10.5)).toBe(11);
    expect(crispRect(-1.4)).toBe(-1); // avoid asserting -0 === 0 (Math.round(-0.4) is -0; Jest's toBe distinguishes them, canvas does not)
  });

  it("leaves already-integer values unchanged", () => {
    expect(crispRect(42)).toBe(42);
  });
});
