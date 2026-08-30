import { describe, expect, it } from "vitest";
import {
  cmp,
  equals,
  greaterThan,
  greaterThanOrEqual,
  isBetween,
  lessThan,
  lessThanOrEqual,
  rubyClass,
} from "./comparable.js";

describe("<=>", () => {
  it("orders numbers", () => {
    expect(cmp(1, 2)).toBe(-1);
    expect(cmp(2, 1)).toBe(1);
    expect(cmp(1, 1)).toBe(0);
  });

  it("orders strings", () => {
    expect(cmp("a", "b")).toBe(-1);
  });

  it("orders Dates as epoch millis", () => {
    expect(cmp(new Date(0), new Date(1))).toBe(-1);
    expect(cmp(new Date(1), 1)).toBe(0);
  });

  it("returns nil for NaN", () => {
    expect(cmp(Number.NaN, 0)).toBeNull();
  });

  it("returns nil for nil against a value and 0 for nil against nil", () => {
    expect(cmp(null, 0)).toBeNull();
    expect(cmp(null, null)).toBe(0);
  });

  it("returns nil for an unrelated object, as Object#<=> does", () => {
    expect(cmp({ a: 1 }, { a: 2 })).toBeNull();
    expect(cmp({ a: 1 }, { a: 1 })).toBe(0);
  });

  it("returns nil rather than ordering what Ruby leaves to Object#<=>", () => {
    expect(cmp(false, true)).toBeNull();
    expect(cmp(true, true)).toBe(0);
    expect(cmp(1, "a")).toBeNull();
    expect(cmp("a", 1)).toBeNull();
  });

  it("sends the receiver's own <=> under either trails spelling", () => {
    expect(cmp({ cmp: () => -1 }, 0)).toBe(-1);
  });

  it("sends the receiver's own <=> when it has one", () => {
    const receiver = { compareTo: (other: unknown) => (other === "x" ? 0 : null) };
    expect(cmp(receiver, "x")).toBe(0);
    expect(cmp(receiver, "y")).toBeNull();
  });
});

class Sign {
  readonly [rubyClass] = "Sign";
  constructor(readonly value: number) {}
  compareTo(other: unknown): number | null {
    return other instanceof Sign ? cmp(this.value, other.value) : null;
  }
  lessThan = lessThan;
  lessThanOrEqual = lessThanOrEqual;
  greaterThan = greaterThan;
  greaterThanOrEqual = greaterThanOrEqual;
  equals = equals;
  isBetween = isBetween;
}

describe("Comparable", () => {
  it("derives the operators from <=>", () => {
    const one = new Sign(1);
    const two = new Sign(2);
    expect(one.lessThan(two)).toBe(true);
    expect(one.lessThanOrEqual(one)).toBe(true);
    expect(two.greaterThan(one)).toBe(true);
    expect(two.greaterThanOrEqual(two)).toBe(true);
    expect(one.equals(new Sign(1))).toBe(true);
    expect(two.isBetween(one, new Sign(3))).toBe(true);
  });

  it("raises ArgumentError for an operand <=> cannot place", () => {
    expect(() => new Sign(1).lessThan("x")).toThrow("comparison of Sign with String failed");
  });

  it("names a special constant by inspect, as rb_cmperr does", () => {
    expect(() => new Sign(1).lessThan(2)).toThrow("comparison of Sign with 2 failed");
  });

  it("answers false rather than raising for ==", () => {
    expect(new Sign(1).equals("x")).toBe(false);
  });

  it("answers true for an identical object before sending <=>", () => {
    const incomparable = {
      compareTo: () => null,
      equals,
    };
    expect(incomparable.equals(incomparable)).toBe(true);
  });
});
