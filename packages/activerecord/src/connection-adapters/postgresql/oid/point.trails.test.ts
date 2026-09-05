import { describe, it, expect } from "vitest";
import { Point, PointValue } from "./point.js";

describe("Point", () => {
  it("reports no change for a member-equal point", () => {
    const type = new Point();
    expect(type.isChanged(new PointValue(1, 2), new PointValue(1, 2), null)).toBe(false);
  });

  it("reports a change for a differing member", () => {
    const type = new Point();
    expect(type.isChanged(new PointValue(1, 2), new PointValue(1, 3), null)).toBe(true);
  });

  it("reports no change in place for a member-equal point", () => {
    const type = new Point();
    expect(type.isChangedInPlace("(1,2)", new PointValue(1, 2))).toBe(false);
  });
});
