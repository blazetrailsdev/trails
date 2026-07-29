import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Types } from "../index.js";

// Fallback-parser coverage for shapes `Date._parse` accepts that no Rails test
// exercises directly. Rails reaches them through `Date._parse` in
// `fallback_string_to_time` (date_time.rb:67-76); trails reaches them through
// the `parseTimeHash` stand-in.
describe("DateTimeType fallback string parsing", () => {
  const type = new Types.DateTimeType();
  const cast = (s: string) => (type.cast(s) as Temporal.Instant | null)?.toString() ?? null;

  it("parses asctime order (Wed Sep 04 03:00:00 2013)", () => {
    expect(cast("Wed Sep 04 03:00:00 2013")).toBe("2013-09-04T03:00:00Z");
  });

  it("parses asctime order with a named zone", () => {
    expect(cast("Wed Sep 04 03:00:00 EAT 2013")).toBe("2013-09-04T00:00:00Z");
  });

  it("parses slash-separated dates with a named zone", () => {
    expect(cast("2013/09/04 03:00:00 EAT")).toBe("2013-09-04T00:00:00Z");
  });

  it("parses slash-separated dates without a time", () => {
    expect(cast("2013/09/04")).toBe("2013-09-04T00:00:00Z");
  });

  it("parses dot-separated dates", () => {
    expect(cast("2013.09.04 03:00:00")).toBe("2013-09-04T03:00:00Z");
  });

  it("parses a numeric offset written without a colon", () => {
    expect(cast("1999-12-31 12:34:56 -1000")).toBe("1999-12-31T22:34:56Z");
  });

  it("returns null for an unparsable string", () => {
    expect(cast("ABC")).toBe(null);
  });

  it("leaves the offset unset for an unknown zone abbreviation", () => {
    expect(cast("Wed, 04 Sep 2013 03:00:00 XYZ")).toBe("2013-09-04T03:00:00Z");
  });
});

describe("DateTimeType fallback zone and ordering coverage", () => {
  const type = new Types.DateTimeType();
  const cast = (s: string) => (type.cast(s) as Temporal.Instant | null)?.toString() ?? null;

  it("parses month-day-year order with a named zone", () => {
    expect(cast("Sep 04 2013 03:00:00 EAT")).toBe("2013-09-04T00:00:00Z");
  });

  it("parses a zone abbreviation attached to an ISO datetime", () => {
    expect(cast("2013-09-04T03:00:00EAT")).toBe("2013-09-04T00:00:00Z");
  });

  it("parses ISO basic format with a basic-format offset", () => {
    expect(cast("20130904T030000+0900")).toBe("2013-09-03T18:00:00Z");
  });

  it("does not mistake the day of a bare date for an offset", () => {
    expect(cast("2013-09-04")).toBe("2013-09-04T00:00:00Z");
  });
});
