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

describe("Duration over a Float value", () => {
  const twoHours = () => hours(new Number(2) as number);

  it("<=>, == and eql? read a whole Float value", () => {
    expect(hours(1).compareTo(new Number(2))).toBe(1);
    expect(twoHours().compareTo(7200)).toBe(0);
    expect(new Scalar(5).compareTo(new Number(5))).toBe(0);
    expect(new Scalar(5).compareTo(new Number(6))).toBe(-1);
    expect(twoHours().negate().abs()).toEqual(new Number(7200));
    expect(hours(2).negate().abs()).toBe(7200);
    expect(twoHours().equals(hours(2))).toBe(true);
    expect(twoHours().eql(hours(2))).toBe(false);
    expect(twoHours().eql(twoHours())).toBe(true);
    expect(twoHours().isEqualTo(twoHours())).toBe(true);
  });

  it("/ floors an Integer by an Integer and keeps a Float", () => {
    expect(new Scalar(5).div(2).value).toBe(2);
    expect(new Scalar(5).div(2.5).value).toEqual(new Number(2));
    expect(new Scalar(5).div(new Number(2)).value).toBe(2.5);
    expect(hours(1).dividedBy(seconds(7))).toBe(514);
    expect(twoHours().dividedBy(hours(1))).toEqual(new Number(2));
    expect(new Scalar(7200).div(hours(1))).toBe(2);
  });

  it("-@ and % follow Ruby's Float and sign rules", () => {
    const zero = seconds(new Number(0) as number).negate().value;
    expect(Object.is(zero.valueOf(), -0)).toBe(true);
    expect(seconds(5).modulo(-3).value).toBe(-1);
  });
});
