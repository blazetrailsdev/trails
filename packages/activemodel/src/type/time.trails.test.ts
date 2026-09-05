import { describe, it, expect, vi, afterEach } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { TimeWithZone, useZone } from "@blazetrails/activesupport";
import { Types, ValueType } from "../index.js";

function timeUtc(year: number, mon: number, mday: number, hour = 0, min = 0, sec = 0): RubyTime {
  return RubyTime.utc(year, mon, mday, hour, min, sec);
}

describe("TimeTypeTrails", () => {
  it("serialize_cast_value applies the declared precision", () => {
    const type = new Types.TimeType({ precision: 1 });
    const value = type.cast("1999-12-31T12:34:56.789-10:00");

    expect((type.serializeCastValue(value) as RubyTime).getutc().xmlschema(1)).toBe(
      "2000-01-01T22:34:56.7Z",
    );
  });
});

describe("TimeType assert_valid_value", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a non-hash value to super", () => {
    const spy = vi.spyOn(ValueType.prototype, "assertValidValue").mockImplementation(() => {
      throw new Error("from super");
    });
    const type = new Types.TimeType();
    expect(() => type.assertValidValue("2020-07-04T12:30:00Z")).toThrow("from super");
    expect(spy).toHaveBeenCalledWith("2020-07-04T12:30:00Z");
  });

  it("does not send a multiparameter hash to super", () => {
    const spy = vi.spyOn(ValueType.prototype, "assertValidValue").mockImplementation(() => {
      throw new Error("from super");
    });
    const type = new Types.TimeType();
    expect(() => type.assertValidValue({ 4: 12, 5: 30 })).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("TimeType serialize_cast_value_compatible?", () => {
  it("is compatible", () => {
    const type = new Types.TimeType();
    expect(type.itselfIfSerializeCastValueCompatible()).toBe(type);
  });
});

describe("TimeType type_cast_for_schema", () => {
  it("answers the to_fs(:db) form, quoted", () => {
    const type = new Types.TimeType();
    expect(type.typeCastForSchema(type.cast("10:20:30"))).toBe('"2000-01-01 10:20:30"');
  });
});

describe("TimeType Helpers::TimeValue ancestry", () => {
  it("resolves the mixin members through the ancestry, not off the instance", () => {
    const type = new Types.TimeType();
    for (const name of [
      "serializeCastValue",
      "applySecondsPrecision",
      "typeCastForSchema",
      "newTime",
      "fastStringToTime",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(type, name)).toBe(false);
      expect(typeof (type as unknown as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("keeps its own user_input_in_time_zone over the mixin's", () => {
    expect(
      Object.prototype.hasOwnProperty.call(Types.TimeType.prototype, "userInputInTimeZone"),
    ).toBe(true);
  });
});

describe("TimeType userInputInTimeZone", () => {
  const type = new Types.TimeType();

  it("user input in time zone wraps plain time in Time.zone", () => {
    useZone("Eastern Time (US & Canada)", () => {
      const result = type.userInputInTimeZone("14:30:00") as TimeWithZone;
      expect(result).toBeInstanceOf(TimeWithZone);
      expect(result.hour).toBe(14);
      expect(result.timeZone.tzinfo.identifier).toBe("America/New_York");
    });
  });

  it("user input in time zone answers a zoneless value when Time.zone is unset", () => {
    const result = type.userInputInTimeZone("14:30:00") as Temporal.ZonedDateTime;
    expect(result).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(result.hour).toBe(14);
  });

  it("user input in time zone returns null for null", () => {
    expect(type.userInputInTimeZone(null)).toBe(null);
    expect(type.userInputInTimeZone("")).toBe(null);
    expect(type.userInputInTimeZone("ABC")).toBe(null);
    expect(type.userInputInTimeZone(" ".repeat(129))).toBe(null);
  });

  it("user input in time zone passthrough for ZonedDateTime", () => {
    const zdt = Temporal.ZonedDateTime.from("2024-01-15T14:30:00[America/New_York]");
    expect(type.userInputInTimeZone(zdt)).toBe(zdt);
  });
});

describe("TimeType cast and serialize coverage", () => {
  const type = new Types.TimeType();

  it("extracts time from full datetime string", () => {
    expect(type.cast("2015-02-09T19:45:54+00:00")).toEqual(timeUtc(2000, 1, 1, 19, 45, 54));
  });

  it("microsecond precision is preserved through cast", () => {
    const result = type.cast("14:23:55.123456") as RubyTime;
    expect(result.getutc().xmlschema(6)).toBe("2000-01-01T14:23:55.123456Z");
  });

  it("Temporal.Instant passthrough", () => {
    const original = timeUtc(2000, 1, 1, 14, 23, 55);
    expect(type.cast(original)).toEqual(original);
  });

  it("has name 'time'", () => {
    expect(type.type()).toBe("time");
  });

  it("casts undefined to null", () => {
    expect(type.cast(undefined)).toBe(null);
  });

  it("serialize returns the cast Instant (not a SQL string)", () => {
    const t = type.cast("14:23:55.123456") as RubyTime;
    expect((type.serialize(t) as RubyTime).getutc().xmlschema(6)).toBe(
      "2000-01-01T14:23:55.123456Z",
    );
  });

  it("serialize null returns null", () => {
    expect(type.serialize(null)).toBe(null);
  });

  it("serialize respects column precision", () => {
    const t = new Types.TimeType({ precision: 3 });
    expect((t.serialize("14:23:55.123456") as RubyTime).getutc().xmlschema(3)).toBe(
      "2000-01-01T14:23:55.123Z",
    );
  });

  it("PlainDateTime input extracts time (multiparameter support)", () => {
    const pdt = Temporal.PlainDateTime.from("2024-06-15T14:23:55");
    expect(type.cast(pdt)).toEqual(timeUtc(2024, 6, 15, 14, 23, 55));
  });

  it("cast 3pm returns 15:00", () => {
    expect(type.cast("3pm")).toEqual(timeUtc(2000, 1, 1, 15, 0, 0));
  });

  it("cast 3:30 PM returns 15:30", () => {
    expect(type.cast("3:30 PM")).toEqual(timeUtc(2000, 1, 1, 15, 30, 0));
  });

  it("cast 15:30 returns 15:30", () => {
    expect(type.cast("15:30")).toEqual(timeUtc(2000, 1, 1, 15, 30, 0));
  });

  it("cast garbage string returns null", () => {
    expect(type.cast("garbage")).toBe(null);
  });

  it("cast ISO time string still works (regression guard)", () => {
    expect(type.cast("19:45:54")).toEqual(timeUtc(2000, 1, 1, 19, 45, 54));
  });

  it("cast datetime with non-zero offset shifts the instant", () => {
    expect(type.cast("2015-02-09T19:45:54+02:00")).toEqual(timeUtc(2000, 1, 1, 17, 45, 54));
  });

  it("valueFromMultiparameterAssignment: hour-only hash returns Time on 2000-01-01 base (P21)", () => {
    expect(type.cast({ "4": 15 })).toEqual(timeUtc(2000, 1, 1, 15, 0, 0));
  });

  it("valueFromMultiparameterAssignment: hour and minute hash returns Time", () => {
    expect(type.cast({ "4": 15, "5": 30 })).toEqual(timeUtc(2000, 1, 1, 15, 30, 0));
  });

  it("valueFromMultiparameterAssignment: full hash with year/month/day/hour still works", () => {
    expect(type.cast({ "1": 2025, "2": 6, "3": 15, "4": 10, "5": 20 })).toEqual(
      timeUtc(2025, 6, 15, 10, 20, 0),
    );
  });

  it("sec_fraction reaches new_time as Time.utc's microsecond argument", () => {
    const result = type.cast("3:30:15.5 PM") as RubyTime;
    expect(result.getutc().xmlschema(7)).toBe("2000-01-01T15:30:15.0000005Z");
  });
});
