import { describe, it, expect } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Types } from "../index.js";
import { TimeWithZone, useZone, zone } from "@blazetrails/activesupport";

function timeUtc(year: number, mon: number, mday: number, hour = 0, min = 0, sec = 0): RubyTime {
  return RubyTime.utc(year, mon, mday, hour, min, sec);
}

describe("TimeTest", () => {
  const type = new Types.TimeType();

  it("type cast time", () => {
    expect(type.cast(null)).toBeNull();
    expect(type.cast("")).toBeNull();
    expect(type.cast("ABC")).toBeNull();
    expect(type.cast(" ".repeat(129))).toBeNull();

    const timeString = Temporal.Now.instant()
      .toZonedDateTimeISO("UTC")
      .toPlainTime()
      .round("second")
      .toString();
    expect((type.cast(timeString) as RubyTime).getutc().strftime("%H:%M:%S")).toEqual(timeString);

    expect(type.cast("2015-06-13T19:45:54+03:00")).toEqual(timeUtc(2000, 1, 1, 16, 45, 54));
    expect(type.cast("06:07:08+09:00")).toEqual(timeUtc(1999, 12, 31, 21, 7, 8));
    expect(type.cast({ "4": 16, "5": 45, "6": 54 })).toEqual(timeUtc(2000, 1, 1, 16, 45, 54));
    expect(type.cast("2023-01-01T00:00:00-03:30")).toEqual(timeUtc(2000, 1, 1, 3, 30, 0));
  });

  it("user input in time zone", () => {
    useZone("Pacific Time (US & Canada)", () => {
      const type = new Types.TimeType();
      expect(type.userInputInTimeZone(null)).toBeNull();
      expect(type.userInputInTimeZone("")).toBeNull();
      expect(type.userInputInTimeZone("ABC")).toBeNull();
      expect(type.userInputInTimeZone(" ".repeat(129))).toBeNull();

      const offset = zone()!.formattedOffset();
      const timeString = `2015-02-09T19:45:54${offset}`;

      expect((type.userInputInTimeZone(timeString) as TimeWithZone).hour).toEqual(19);
      expect((type.userInputInTimeZone(timeString) as TimeWithZone).formattedOffset()).toEqual(
        offset,
      );
    });
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new Types.TimeType({ precision: 1 });
    const value = type.cast("1999-12-31T12:34:56.789-10:00");

    expect(type.serializeCastValue(value)).toEqual(type.serialize(value));
  });
});
