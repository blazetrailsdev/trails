import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { quotedDate, quotedTime } from "./quoting.js";

describe("quotedDate", () => {
  it("formats a Temporal.Instant as UTC datetime string", () => {
    const v = Temporal.Instant.from("2026-04-26T14:23:55Z");
    expect(quotedDate(v)).toBe("2026-04-26 14:23:55");
  });

  it("formats a Temporal.PlainDateTime", () => {
    const v = Temporal.PlainDateTime.from("2026-04-26T14:23:55");
    expect(quotedDate(v)).toBe("2026-04-26 14:23:55");
  });

  it("formats a Temporal.PlainDate", () => {
    const v = Temporal.PlainDate.from("2026-04-26");
    expect(quotedDate(v)).toBe("2026-04-26");
  });

  it("formats a Temporal.PlainTime (normalised to 2000-01-01 date)", () => {
    const v = Temporal.PlainTime.from("14:23:55");
    expect(quotedDate(v)).toBe("2000-01-01 14:23:55");
  });

  it("formats a Temporal.ZonedDateTime via its instant", () => {
    const v = Temporal.ZonedDateTime.from("2026-04-26T14:23:55+00:00[UTC]");
    expect(quotedDate(v)).toBe("2026-04-26 14:23:55");
  });

  it("throws for unrecognised types", () => {
    expect(() => quotedDate("2026-04-26" as any)).toThrow("quotedDate: cannot format");
  });
});

describe("quotedTime", () => {
  it("formats a Temporal.PlainTime stripping the date prefix", () => {
    const v = Temporal.PlainTime.from("14:23:55");
    expect(quotedTime(v)).toBe("14:23:55");
  });

  it("formats a Temporal.PlainDateTime stripping the date", () => {
    const v = Temporal.PlainDateTime.from("2026-04-26T14:23:55.123456");
    expect(quotedTime(v)).toBe("14:23:55.123456");
  });

  it("normalises the date component to 2000-01-01", () => {
    const v = Temporal.PlainDateTime.from("2099-12-31T09:00:00");
    expect(quotedTime(v)).toBe("09:00:00");
  });
});
