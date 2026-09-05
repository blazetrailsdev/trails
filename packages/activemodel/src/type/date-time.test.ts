import { describe, it, expect } from "vitest";
import { Temporal, Time as RubyTime, strftime } from "@blazetrails/date";
import { TimeZone, setZoneDefault } from "@blazetrails/activesupport";
import { rbObjAsString as toS } from "@blazetrails/ruby-compat";
import { Types } from "../index.js";

describe("DateTimeTest", () => {
  const type = new Types.DateTimeType();

  it("type cast datetime and timestamp", () => {
    const type = new Types.DateTimeType();
    expect(type.cast(null)).toBeNull();
    expect(type.cast("")).toBeNull();
    expect(type.cast("  ")).toBeNull();
    expect(type.cast("ABC")).toBeNull();
    expect(type.cast(" ".repeat(129))).toBeNull();

    const datetimeString = strftime(Temporal.Now.instant(), "%FT%T");
    expect((type.cast(datetimeString) as RubyTime).strftime("%FT%T")).toBe(datetimeString);
  });

  it("string to time with timezone", () => {
    for (const zone of ["UTC", "US/Eastern"]) {
      setZoneDefault(TimeZone.find(zone));
      try {
        const t = new Types.DateTimeType();
        expect((t.cast("Wed, 04 Sep 2013 03:00:00 EAT") as RubyTime).getutc()).toEqual(
          RubyTime.utc(2013, 9, 4, 0, 0, 0),
        );
      } finally {
        setZoneDefault(null);
      }
    }
  });

  it("hash to time", () => {
    const type = new Types.DateTimeType();
    expect(type.cast({ 1: 2018, 2: 10, 3: 15 })).toEqual(RubyTime.utc(2018, 10, 15));
  });

  it("hash with wrong keys", () => {
    const type = new Types.DateTimeType();
    let error: unknown;
    expect(() => {
      try {
        type.cast({ ":a": 1 });
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(expect.objectContaining({ name: "ArgumentError" }));
    expect((error as Error).message).toBe(
      `Provided hash ${toS({ ":a": 1 })} doesn't contain necessary keys: [1, 2, 3]`,
    );
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new Types.DateTimeType({ precision: 1 });
    const value = type.cast("1999-12-31 12:34:56.789 -1000");

    expect(type.serialize(value)).toEqual(type.serializeCastValue(value));
  });
});
