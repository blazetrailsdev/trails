import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/date";
import { isBlank, isPresent, presence, TimeWithZone, TimeZone } from "../../index.js";

const NOW = new Temporal.Instant(1_700_000_000_000_000_000n);
const TIMES = [
  new Date(NOW.epochMilliseconds),
  new TimeWithZone(NOW, TimeZone.create("UTC")),
  NOW,
  NOW.toZonedDateTimeISO("UTC"),
  Temporal.PlainDate.from("2026-08-13"),
  Temporal.PlainDateTime.from("2026-08-13T12:00:00"),
  Temporal.PlainTime.from("12:00:00"),
];

describe("BlankTest", () => {
  it("blank", () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank("")).toBe(true);
    expect(isBlank("  ")).toBe(true);
    expect(isBlank([])).toBe(true);
    expect(isBlank({})).toBe(true);
    expect(isBlank(false)).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank("hello")).toBe(false);
    expect(isBlank([1])).toBe(false);
    for (const v of TIMES) expect(isBlank(v)).toBe(false);
  });

  it("blank with bundled string encodings", () => {
    expect(isBlank("\t\n")).toBe(true);
    expect(isBlank(" \t\n ")).toBe(true);
    expect(isBlank("a")).toBe(false);
  });

  it("present", () => {
    expect(isPresent("hello")).toBe(true);
    expect(isPresent(42)).toBe(true);
    expect(isPresent(null)).toBe(false);
    expect(isPresent("")).toBe(false);
    for (const v of TIMES) expect(isPresent(v)).toBe(true);
  });

  it("presence", () => {
    expect(presence("hello")).toBe("hello");
    expect(presence("")).toBeUndefined();
    expect(presence(null)).toBeUndefined();
    expect(presence(42)).toBe(42);
    for (const v of TIMES) expect(presence(v)).toBe(v);
  });
});
