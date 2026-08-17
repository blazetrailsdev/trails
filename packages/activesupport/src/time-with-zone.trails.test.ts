import { describe, it, expect } from "vitest";
import { TimeWithZone } from "./time-with-zone.js";
import { TimeZone } from "./values/time-zone.js";
import { Temporal } from "@blazetrails/date";
import { DATE_FORMATS } from "./time-ext.js";

// Ruby's Time carries full nanosecond precision, so %N answers nine significant
// digits (time_with_zone.rb:223-227 delegates strftime to that Time). These
// cover the readers and formatters that derive the sub-second part.
describe("TimeWithZone sub-millisecond precision", () => {
  const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
  const subMs = () =>
    new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00.123456789Z"), eastern);

  it("usec answers the full microseconds", () => {
    expect(subMs().usec).toBe(123456);
  });

  it("nsec answers the full nanoseconds", () => {
    expect(subMs().nsec).toBe(123456789);
  });

  it("strftime %N answers nine significant digits", () => {
    expect(subMs().strftime("%N")).toBe("123456789");
  });

  it("strftime %L is unchanged for a millisecond-precision time", () => {
    const twz = new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00.123Z"), eastern);
    expect(twz.strftime("%L")).toBe("123");
    expect(twz.nsec).toBe(123000000);
  });

  it("inspect prints the full nanoseconds", () => {
    expect(subMs().inspect()).toBe("1999-12-31 19:00:00.123456789 EST -05:00");
  });

  it("xmlschema truncates the fraction to the requested digits", () => {
    expect(subMs().xmlschema(3)).toBe("1999-12-31T19:00:00.123-05:00");
    expect(subMs().xmlschema(6)).toBe("1999-12-31T19:00:00.123456-05:00");
    expect(subMs().xmlschema(9)).toBe("1999-12-31T19:00:00.123456789-05:00");
  });
});

// `to_fs` resolves through `Time::DATE_FORMATS` (time_with_zone.rb:212-220), so
// every key in that hash answers here — including one an app registers at boot.
describe("TimeWithZone to_fs over Time::DATE_FORMATS", () => {
  const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
  const twz = () => new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00Z"), eastern);

  it("resolves every built-in key", () => {
    expect(twz().toFs("number")).toBe("19991231190000");
    expect(twz().toFs("usec")).toBe("19991231190000000000");
    expect(twz().toFs("nsec")).toBe("19991231190000000000000");
    expect(twz().toFs("time")).toBe("19:00");
    expect(twz().toFs("long_ordinal")).toBe("December 31st, 1999 19:00");
  });

  it("reaches a format registered after boot", () => {
    DATE_FORMATS["shouty"] = "%Y!";
    try {
      expect(twz().toFs("shouty")).toBe("1999!");
    } finally {
      delete DATE_FORMATS["shouty"];
    }
  });
});
