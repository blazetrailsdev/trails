import { describe, expect, it } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { advance } from "../time-ext.js";
import "./time/calculations.js";
import { toFs } from "./time/conversions.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";

function zoned(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from({ timeZone, year, month, day, hour, minute, second });
}

describe("Time#advance on a zoned receiver", () => {
  it("combines date and time options across the end of dst", () => {
    const midnight = zoned("US/Eastern", 2005, 10, 29, 0, 0, 0);

    expect(
      advance(midnight, { days: 1, hours: 1 }).equals(zoned("US/Eastern", 2005, 10, 30, 1, 0, 0)),
    ).toBe(true);
    expect(
      advance(midnight, { days: 1, hours: 2 }).equals(
        zoned("US/Eastern", 2005, 10, 30, 2, 0, 0).subtract({ seconds: 3600 }),
      ),
    ).toBe(true);
    expect(
      advance(midnight, { days: 1, hours: 3 }).equals(zoned("US/Eastern", 2005, 10, 30, 2, 0, 0)),
    ).toBe(true);
  });

  it("applies date options with no seconds to advance", () => {
    const oneAm = zoned("US/Eastern", 2005, 10, 30, 1, 0, 0);

    expect(advance(oneAm, { months: 1 }).equals(zoned("US/Eastern", 2005, 11, 30, 1, 0, 0))).toBe(
      true,
    );
    expect(advance(oneAm, { years: 1 }).equals(zoned("US/Eastern", 2006, 10, 30, 1, 0, 0))).toBe(
      true,
    );
  });
});

describe("toFs dispatches on the receiver", () => {
  it("sends a TimeWithZone to its own to_fs, whose :db arm is UTC", () => {
    const twz = new TimeWithZone(
      RubyTime.utc(2000, 1, 1, 0, 0, 0),
      TimeZone.find("Eastern Time (US & Canada)")!,
    );

    expect(toFs(twz, "db")).toBe("2000-01-01 00:00:00");
    expect(toFs(twz, "db")).toBe(twz.toFs("db"));
  });

  it("sends a Temporal.PlainDate to Date#to_fs", () => {
    expect(toFs(Temporal.PlainDate.from("2005-02-21"), "inspect")).toBe("2005-02-21");
  });
});
