import { describe, expect, it } from "vitest";
import { TimeWithZone, TimeZone } from "@blazetrails/activesupport";
import { Date, DateTime, Time } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { deserialize, serialize } from "../arguments.js";
import "../serializers.js";

async function roundTrip(arg: unknown): Promise<unknown> {
  return (await deserialize(JSON.parse(JSON.stringify(serialize([arg])))))[0];
}

describe("ActiveJob::Serializers time objects", () => {
  it("round-trips a Date", async () => {
    const date = new Date(2001, 2, 3);
    expect(serialize([date])[0]).toEqual({
      _aj_serialized: "ActiveJob::Serializers::DateSerializer",
      value: "2001-02-03",
    });
  });

  it("round-trips a Date and a DateTime as their own classes", async () => {
    expect(await roundTrip(new Date(2001, 2, 3))).toBeInstanceOf(Date);
    expect(
      await roundTrip(new DateTime(2001, 2, 3, 4, 5, new Rational(6123456, 1000000), "+03:00")),
    ).toBeInstanceOf(DateTime);
  });

  it("round-trips a Time with nine fractional digits", async () => {
    const time = Time.new(2002, 10, 31, 2, 2, new Rational(2123456789, 1000000000), "+02:00");
    expect(serialize([time])[0]).toEqual({
      _aj_serialized: "ActiveJob::Serializers::TimeSerializer",
      value: "2002-10-31T02:02:02.123456789+02:00",
    });
    const back = (await roundTrip(time)) as Time;
    expect(back).toBeInstanceOf(Time);
    expect(back.iso8601(9)).toBe("2002-10-31T02:02:02.123456789+02:00");
  });

  it("serializes a DateTime with DateTimeSerializer, not DateSerializer", () => {
    const dateTime = new DateTime(2001, 2, 3, 4, 5, new Rational(6123456, 1000000), "+03:00");
    expect((serialize([dateTime])[0] as Record<string, unknown>)._aj_serialized).toBe(
      "ActiveJob::Serializers::DateTimeSerializer",
    );
    expect((serialize([dateTime])[0] as Record<string, unknown>).value).toBe(
      "2001-02-03T04:05:06.123456000+03:00",
    );
  });

  it("round-trips a TimeWithZone with nine fractional digits", async () => {
    const twz = new TimeWithZone(
      Time.utc(1999, 12, 31, 23, 59, new Rational(59123456789, 1000000000)),
      TimeZone.find("UTC")!,
    );
    expect(serialize([twz])[0]).toEqual({
      _aj_serialized: "ActiveJob::Serializers::TimeWithZoneSerializer",
      value: "1999-12-31T23:59:59.123456789Z",
      time_zone: "Etc/UTC",
    });
    const back = (await roundTrip(twz)) as TimeWithZone;
    expect(back).toBeInstanceOf(TimeWithZone);
    expect(back.iso8601(9)).toBe("1999-12-31T23:59:59.123456789Z");
  });
});
