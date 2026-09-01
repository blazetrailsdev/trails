import { describe, it, expect } from "vitest";
import { Scalar, days } from "./duration.js";

describe("Scalar", () => {
  it("<=> orders against a Scalar, a Duration and a Numeric", () => {
    expect(new Scalar(2).compareTo(new Scalar(3))).toBe(-1);
    expect(new Scalar(2).compareTo(days(1))).toBe(-1);
    expect(new Scalar(3).compareTo(3)).toBe(0);
    expect(new Scalar(3).compareTo("foo")).toBeNull();
  });

  it("== answers a Numeric, and Duration#== answers a Scalar", () => {
    expect(new Scalar(172800).equals(172800)).toBe(true);
    expect(new Scalar(172800).equals(new Scalar(172800))).toBe(true);
    expect(new Scalar(172800).equals("foo")).toBe(false);
    expect(days(2).equals(new Scalar(172800))).toBe(true);
    expect(days(2).equals(new Scalar(1))).toBe(false);
  });
});

describe("Scalar Comparable", () => {
  it("<=> answers nil for an incomparable receiver", () => {
    expect(new Scalar(3).compareTo("foo")).toBeNull();
  });

  it("== is cmp_equal, so an identical object is true before <=> is sent", () => {
    const scalar = new Scalar(3);
    expect(scalar.equals(scalar)).toBe(true);
    expect(scalar.equals("foo")).toBe(false);
  });
});
