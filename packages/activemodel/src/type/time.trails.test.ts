import { describe, it, expect, vi, afterEach } from "vitest";
import { Temporal } from "@blazetrails/date";
import { TimeWithZone, useZone } from "@blazetrails/activesupport";
import { Types, ValueType } from "../index.js";

describe("TimeTypeTrails", () => {
  it("serialize_cast_value applies the declared precision", () => {
    const type = new Types.TimeType({ precision: 1 });
    const value = type.cast("1999-12-31T12:34:56.789-10:00");

    expect(String(type.serializeCastValue(value))).toBe("2000-01-01T22:34:56.7Z");
  });
});

// AcceptsMultiparameterTime::InstanceMethods#assert_valid_value
// (activemodel/lib/active_model/type/helpers/accepts_multiparameter_time.rb:24-30)
// sends a non-Hash value on to `super`. `ActiveModel::Type::Value#assert_valid_value`
// is a no-op, so the arm is only observable once an ancestor supplies a real one —
// which ActiveRecord's Type::Serialized and the enum/PG OID types do.
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

// `serialize_cast_value` comes from Helpers::TimeValue, included AFTER
// AcceptsMultiparameterTime (time.rb:40-43), so it sits nearer the class than
// the mixin's `serialize` and the predicate (serialize_cast_value.rb:9-12) is
// true.
describe("TimeType serialize_cast_value_compatible?", () => {
  it("is compatible", () => {
    const type = new Types.TimeType();
    expect(type.itselfIfSerializeCastValueCompatible()).toBe(type);
  });
});

// `type_cast_for_schema` comes from Helpers::TimeValue (time_value.rb:36-38) —
// `value.to_fs(:db).inspect` — where without the mixin the class would inherit
// `Type::Value`'s `value.inspect` (value.rb:71-73). Verified against MRI:
// `ActiveModel::Type::Time.new.type_cast_for_schema(cast)` answers
// `"2000-01-01 10:20:30"` (quoted) — the 2000-01-01 dummy date is the one
// `AcceptsMultiparameterTime`'s defaults give a bare time (time.rb:40-42).
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
