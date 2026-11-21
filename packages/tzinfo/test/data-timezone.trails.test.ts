import { Time } from "@blazetrails/date";
import { describe, expect, it } from "vitest";
import { ConstantOffsetDataTimezoneInfo, TimezoneOffset } from "../lib/index.js";

describe("DataTimezone over a ConstantOffsetDataTimezoneInfo", () => {
  const tz = new ConstantOffsetDataTimezoneInfo(
    "Test/Constant",
    new TimezoneOffset(18000, 3600, "TEST"),
  ).createTimezone();
  const t = Time.utc(2006, 6, 27, 22, 50, 12);

  it("answers abbr, isDst and observedUtcOffset from info.periodFor", () => {
    expect(tz.abbr(t)).toBe("TEST");
    expect(tz.isDst(t)).toBe(true);
    expect(tz.observedUtcOffset(t)).toBe(21600);
  });

  it("converts utcToLocal with the period offset", () => {
    const local = tz.utcToLocal(t);
    expect(local.utcOffset).toBe(21600);
    expect(local.hour).toBe(4);
  });
});
