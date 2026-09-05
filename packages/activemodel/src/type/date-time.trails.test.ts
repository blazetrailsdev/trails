import { describe, it, expect, vi, afterEach } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { instant, plainDateTime } from "@blazetrails/activesupport/testing/temporal-helpers";
import { Types, ValueType } from "../index.js";

describe("DateTimeType fallback string parsing", () => {
  const type = new Types.DateTimeType();
  const cast = (s: string) => (type.cast(s) as RubyTime | null)?.getutc().xmlschema() ?? null;

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
  const cast = (s: string) => (type.cast(s) as RubyTime | null)?.getutc().xmlschema() ?? null;

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

describe("DateTimeType date-only strings with a zone token", () => {
  const type = new Types.DateTimeType();
  const cast = (s: string) => (type.cast(s) as RubyTime | null)?.getutc().xmlschema() ?? null;

  it("ignores a trailing Z on a date-only string", () => {
    expect(cast("2013-09-04Z")).toBe("2013-09-04T00:00:00Z");
  });

  it("ignores a trailing zone abbreviation on a date-only string", () => {
    expect(cast("2013-09-04UTC")).toBe("2013-09-04T00:00:00Z");
    expect(cast("2013-09-04 EAT")).toBe("2013-09-04T00:00:00Z");
  });

  it("applies a trailing numeric offset on a date-only string", () => {
    expect(cast("2013-09-04-10")).toBe("2013-09-04T10:00:00Z");
  });

  it("still applies the offset when a time is present", () => {
    expect(cast("2013-09-04T03:00:00-10")).toBe("2013-09-04T13:00:00Z");
  });
});

describe("DateTimeType offsets sourced from Date._parse", () => {
  const type = new Types.DateTimeType();
  const cast = (s: string) => (type.cast(s) as RubyTime | null)?.getutc().xmlschema() ?? null;

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
    const type = new Types.DateTimeType({ precision: 1 });
    const value = type.cast("1999-12-31 12:34:56.789 -1000");
    expect((type.serializeCastValue(value) as RubyTime).xmlschema(1)).toBe(
      "1999-12-31T22:34:56.7Z",
    );
  });
});

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

describe("DateTimeType serialize_cast_value_compatible?", () => {
  it("is compatible", () => {
    const type = new Types.DateTimeType();
    expect(type.itselfIfSerializeCastValueCompatible()).toBe(type);
  });
});

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

describe("DateTimeType cast and serialize coverage", () => {
  const type = new Types.DateTimeType();

  it("string with offset produces Instant", () => {
    const result = type.cast("2024-01-15T10:30:00+05:00");
    expect(result).toBeInstanceOf(RubyTime);
    expect((result as RubyTime).toI()).toBe(RubyTime.utc(2024, 1, 15, 5, 30, 0).toI());
  });

  it("string without offset produces Instant (treated as UTC)", () => {
    const result = type.cast("2024-01-15T10:30:00") as RubyTime;
    expect(result).toBeInstanceOf(RubyTime);
    const utc = result.getutc();
    expect(utc.hour).toBe(10);
    expect(utc.min).toBe(30);
  });

  it("Postgres wire format (space separator, short offset) produces Instant", () => {
    const result = type.cast("2026-04-26 14:23:55.123456+00");
    expect(result).toBeInstanceOf(RubyTime);
    const i = result as RubyTime;
    expect(i.getutc().xmlschema(6)).toBe("2026-04-26T14:23:55.123456Z");
  });

  it("Postgres naive wire format produces Instant (treated as UTC)", () => {
    const result = type.cast("2026-04-26 14:23:55.123456") as RubyTime;
    expect(result).toBeInstanceOf(RubyTime);
    expect(result.getutc().usec % 1000).toBe(456);
  });

  it("microsecond precision is preserved through cast", () => {
    const result = type.cast("2026-04-26T14:23:55.123456Z");
    expect(result).toBeInstanceOf(RubyTime);
    expect((result as RubyTime).getutc().usec).toBe(123456);
  });

  it("Temporal.Instant passthrough", () => {
    const original = instant("2026-04-26T14:23:55.123456Z");
    expect((type.cast(original) as RubyTime).getutc().xmlschema(6)).toBe(
      "2026-04-26T14:23:55.123456Z",
    );
  });

  it("Temporal.PlainDateTime is converted to Instant (treated as UTC)", () => {
    const pdt = plainDateTime("2026-04-26T14:23:55.123456");
    const result = type.cast(pdt) as RubyTime;
    expect(result).toBeInstanceOf(RubyTime);
    expect(result.getutc().usec % 1000).toBe(456);
  });

  it("has name 'datetime'", () => {
    expect(type.type()).toBe("datetime");
  });

  it("casts null to null", () => {
    expect(type.cast(null)).toBe(null);
  });

  it("casts undefined to null", () => {
    expect(type.cast(undefined)).toBe(null);
  });

  it("casts empty string to null", () => {
    expect(type.cast("")).toBe(null);
  });

  it("serialize returns the cast Instant (not a SQL string)", () => {
    const i = instant("2026-04-26T14:23:55.123456Z");
    expect((type.serialize(i) as RubyTime).getutc().xmlschema(6)).toBe(
      "2026-04-26T14:23:55.123456Z",
    );
  });

  it("serialize returns the cast Instant for PlainDateTime (cast to Instant first)", () => {
    const pdt = plainDateTime("2026-04-26T14:23:55.123456");
    expect((type.serialize(pdt) as RubyTime).getutc().xmlschema(6)).toBe(
      "2026-04-26T14:23:55.123456Z",
    );
  });

  it("serialize null returns null", () => {
    expect(type.serialize(null)).toBe(null);
  });

  it("serialize respects column precision", () => {
    const t = new Types.DateTimeType({ precision: 3 });
    const i = instant("2026-04-26T14:23:55.123456Z");
    expect((t.serialize(i) as RubyTime).getutc().xmlschema(3)).toBe("2026-04-26T14:23:55.123Z");
  });

  it("PlainDateTime input is converted to Instant (multiparameter support)", () => {
    const pdt = Temporal.PlainDateTime.from("2026-04-26T14:23:55");
    const result = type.cast(pdt);
    expect(result).toBeInstanceOf(RubyTime);
  });

  it("valueFromMultiparameterAssignment reconstructs an Instant from {1..6}", () => {
    class Probe extends Types.DateTimeType {
      call(values: Record<number, unknown>) {
        return this.valueFromMultiparameterAssignment(values);
      }
    }
    const result = new Probe().call({ 1: 2024, 2: 1, 3: 2, 4: 12, 5: 30, 6: 0 });
    expect(result).toBeInstanceOf(RubyTime);
  });

  it("valueFromMultiparameterAssignment throws when keys 1/2/3 missing", () => {
    class Probe extends Types.DateTimeType {
      call(values: Record<number, unknown>) {
        return this.valueFromMultiparameterAssignment(values);
      }
    }
    expect(() => new Probe().call({ 1: 2024, 4: 12 })).toThrow(
      expect.objectContaining({ name: "ArgumentError" }),
    );
  });

  it("cast accepts numeric-keyed multiparameter hash and returns Temporal.Instant", () => {
    const type = new Types.DateTimeType();
    const result = type.cast({ 1: 2024, 2: 6, 3: 15, 4: 10, 5: 30 });
    expect(result).toBeInstanceOf(RubyTime);
    const utc = (result as RubyTime).getutc();
    expect(utc.year).toBe(2024);
    expect(utc.month).toBe(6);
    expect(utc.day).toBe(15);
    expect(utc.hour).toBe(10);
    expect(utc.min).toBe(30);
  });

  it("valueFromMultiparameterAssignment defaults hour/minute to 0 when only date parts given (P21)", () => {
    class Probe extends Types.DateTimeType {
      call(values: Record<number, unknown>) {
        return this.valueFromMultiparameterAssignment(values);
      }
    }
    const result = new Probe().call({ 1: 2025, 2: 7, 3: 4 }) as RubyTime;
    expect(result).toBeInstanceOf(RubyTime);
    const utc = result.getutc();
    expect(utc.year).toBe(2025);
    expect(utc.month).toBe(7);
    expect(utc.day).toBe(4);
    expect(utc.hour).toBe(0);
    expect(utc.min).toBe(0);
  });
});

describe("DateTimeType#isChanged", () => {
  const at = (nsec: number) => RubyTime.utc(2024, 1, 2, 3, 4, 5, new Rational(nsec, 1000));

  it("two identical Time references are unchanged", () => {
    const t = new Types.DateTimeType();
    const a = at(0);
    expect(t.isChanged(a, a)).toBe(false);
  });

  it("two distinct Time objects with same epoch are unchanged (precision=null)", () => {
    const t = new Types.DateTimeType();
    expect(t.isChanged(at(0), at(0))).toBe(false);
  });

  it("times differing by one full microsecond are changed (precision=null)", () => {
    const t = new Types.DateTimeType();
    expect(t.isChanged(at(0), at(1000))).toBe(true);
  });

  it("times differing by one full millisecond are changed (precision=3)", () => {
    const t = new Types.DateTimeType({ precision: 3 });
    expect(t.isChanged(at(0), at(1_000_000))).toBe(true);
  });

  it("times differing by one full nanosecond are changed (precision=9)", () => {
    const t = new Types.DateTimeType({ precision: 9 });
    expect(t.isChanged(at(0), at(1))).toBe(true);
  });

  it("non-Time values fall back to reference equality", () => {
    const t = new Types.DateTimeType();
    expect(t.isChanged(null, null)).toBe(false);
    expect(t.isChanged(null, "2024-01-01")).toBe(true);
  });
});
