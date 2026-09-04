import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { Temporal, Time, resetLocalTimeZoneId } from "@blazetrails/date";
import { Scalar, days, hours, seconds } from "./duration.js";

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

describe("Duration applied to a ::Time receiver", () => {
  beforeEach(() => {
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("America/New_York");
    resetLocalTimeZoneId();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetLocalTimeZoneId();
  });

  const eastern = (): Time => Time.utc(2024, 3, 9, 17, 0, 0).getlocal();

  it("#since answers a Time, advancing calendar parts on the wall clock across DST", () => {
    const result = days(1).since(eastern());

    expect(result).toBeInstanceOf(Time);
    expect(result.strftime("%F %T %z %Z")).toBe("2024-03-10 12:00:00 -0400 EDT");
  });

  it("#since advances seconds on the instant across DST", () => {
    expect(hours(24).since(eastern()).strftime("%F %T %z %Z")).toBe(
      "2024-03-10 13:00:00 -0400 EDT",
    );
  });

  it("#ago, #until and #before walk a Time backwards", () => {
    const afterDst = (): Time => Time.utc(2024, 3, 11, 16, 0, 0).getlocal();

    expect(days(1).ago(afterDst()).strftime("%F %T %z")).toBe("2024-03-10 12:00:00 -0400");
    expect(days(1).until(afterDst()).strftime("%F %T %z")).toBe("2024-03-10 12:00:00 -0400");
    expect(days(1).before(afterDst()).strftime("%F %T %z")).toBe("2024-03-10 12:00:00 -0400");
  });

  it("#after keeps the receiver's sub-millisecond precision", () => {
    const precise = Time.utc(2024, 1, 1, 0, 0, 0).plus(0.000000123);

    expect(seconds(1).after(precise).nsec).toBe(123);
    expect(days(1).after(precise).nsec).toBe(123);
  });

  it("raises ArgumentError for a receiver that is not a time or date", () => {
    expect(() => days(1).since("nope" as unknown as Date)).toThrow(
      'expected a time or date, got "nope"',
    );
  });
});
