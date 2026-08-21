import { describe, it, expect, vi, afterEach } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Types, ValueType } from "../index.js";

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

// Date._parse reports a zone only alongside a time; a date-only string keeps
// its trailing token out of the hash and is read in the default zone. Each
// expectation below was checked against Ruby's Date._parse.
describe("DateTimeType date-only strings with a zone token", () => {
  const type = new Types.DateTimeType();
  const cast = (s: string) => (type.cast(s) as Temporal.Instant | null)?.toString() ?? null;

  it("ignores a trailing Z on a date-only string", () => {
    expect(cast("2013-09-04Z")).toBe("2013-09-04T00:00:00Z");
  });

  it("ignores a trailing zone abbreviation on a date-only string", () => {
    expect(cast("2013-09-04UTC")).toBe("2013-09-04T00:00:00Z");
    expect(cast("2013-09-04 EAT")).toBe("2013-09-04T00:00:00Z");
  });

  it("ignores a trailing numeric offset on a date-only string", () => {
    expect(cast("2013-09-04-10")).toBe("2013-09-04T00:00:00Z");
  });

  it("still applies the offset when a time is present", () => {
    expect(cast("2013-09-04T03:00:00-10")).toBe("2013-09-04T13:00:00Z");
  });
});

describe("DateTimeType offsets sourced from Date._parse", () => {
  const type = new Types.DateTimeType();
  const cast = (s: string) => (type.cast(s) as Temporal.Instant | null)?.toString() ?? null;

  it("applies a fractional-hour numeric offset", () => {
    expect(cast("2013-09-04 03:00:00 +05:45")).toBe("2013-09-03T21:15:00Z");
  });

  it("applies a sub-minute numeric offset", () => {
    expect(cast("2013-09-04 03:00:00 -00:44:30")).toBe("2013-09-04T03:44:30Z");
  });

  it("applies an offset from the gem's full zone table", () => {
    expect(cast("2013-09-04 03:00:00 IST")).toBe("2013-09-03T21:30:00Z");
  });
});

describe("DateTimeType#serializeCastValue", () => {
  it("applies the column precision to the cast Instant", () => {
    // The concrete value date_time_test.rb:40-45 only compares against
    // `serialize`, pinned here so a change of precision handling is visible.
    const type = new Types.DateTimeType({ precision: 1 });
    const value = type.cast("1999-12-31 12:34:56.789 -1000");
    expect((type.serializeCastValue(value) as Temporal.Instant).toString()).toBe(
      "1999-12-31T22:34:56.7Z",
    );
  });
});

// AcceptsMultiparameterTime::InstanceMethods#assert_valid_value
// (activemodel/lib/active_model/type/helpers/accepts_multiparameter_time.rb:24-30)
// sends a non-Hash value on to `super`. `ActiveModel::Type::Value#assert_valid_value`
// is a no-op, so the arm is only observable once an ancestor supplies a real one —
// which ActiveRecord's Type::Serialized and the enum/PG OID types do.
describe("DateTimeType assert_valid_value", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a non-hash value to super", () => {
    const spy = vi.spyOn(ValueType.prototype, "assertValidValue").mockImplementation(() => {
      throw new Error("from super");
    });
    const type = new Types.DateTimeType();
    expect(() => type.assertValidValue("2020-07-04T12:30:00Z")).toThrow("from super");
    expect(spy).toHaveBeenCalledWith("2020-07-04T12:30:00Z");
  });

  it("does not send a multiparameter hash to super", () => {
    const spy = vi.spyOn(ValueType.prototype, "assertValidValue").mockImplementation(() => {
      throw new Error("from super");
    });
    const type = new Types.DateTimeType();
    expect(() => type.assertValidValue({ 1: 2025, 2: 7, 3: 4 })).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});

// `serialize_cast_value` comes from Helpers::TimeValue, included AFTER
// AcceptsMultiparameterTime (date_time.rb:44-47), so it sits nearer the class
// than the mixin's `serialize` and the predicate
// (serialize_cast_value.rb:9-12) is true.
describe("DateTimeType serialize_cast_value_compatible?", () => {
  it("is compatible", () => {
    const type = new Types.DateTimeType();
    expect(type.itselfIfSerializeCastValueCompatible()).toBe(type);
  });
});

// `type_cast_for_schema` comes from Helpers::TimeValue (time_value.rb:36-38) —
// `value.to_fs(:db).inspect` — where without the mixin the class would inherit
// `Type::Value`'s `value.inspect` (value.rb:71-73). Verified against MRI:
// `ActiveModel::Type::DateTime.new.type_cast_for_schema(cast)` answers
// `"2000-01-01 00:00:00"` (quoted).
describe("DateTimeType type_cast_for_schema", () => {
  it("answers the to_fs(:db) form, quoted", () => {
    const type = new Types.DateTimeType();
    expect(type.typeCastForSchema(type.cast("2000-01-01 00:00:00"))).toBe('"2000-01-01 00:00:00"');
  });
});

describe("DateTimeType Helpers::TimeValue ancestry", () => {
  it("resolves the mixin members through the ancestry, not off the instance", () => {
    const type = new Types.DateTimeType();
    for (const name of [
      "serializeCastValue",
      "applySecondsPrecision",
      "typeCastForSchema",
      "userInputInTimeZone",
      "newTime",
      "fastStringToTime",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(type, name)).toBe(false);
      expect(typeof (type as unknown as Record<string, unknown>)[name]).toBe("function");
    }
  });
});

describe("DateTimeType type_cast_for_schema", () => {
  it("quotes the to_fs(:db) form", () => {
    const type = new Types.DateTimeType();
    expect(type.typeCastForSchema(type.cast("2000-01-01T12:34:56Z"))).toBe('"2000-01-01 12:34:56"');
  });
});
