import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { applySecondsPrecision, fastStringToTime, newTime } from "./time-value.js";

// Mirrors ActiveModel::Type::Helpers::TimeValue#apply_seconds_precision
// (time_value.rb:24-34). Truncation, not rounding — verify each
// precision boundary against the Temporal types Rails would touch.
describe("applySecondsPrecision", () => {
  const dt = Temporal.PlainDateTime.from("2024-01-02T03:04:05.123456789");

  it("returns value unchanged when precision is undefined", () => {
    expect(applySecondsPrecision.call({}, dt)).toBe(dt);
  });

  it("returns value unchanged for precision >= 9 (full nanosecond keep)", () => {
    expect(applySecondsPrecision.call({ precision: 9 }, dt)).toBe(dt);
  });

  it("rejects non-integer precision", () => {
    expect(applySecondsPrecision.call({ precision: 3.5 }, dt)).toBe(dt);
  });

  it("rejects out-of-range precision", () => {
    expect(applySecondsPrecision.call({ precision: -1 }, dt)).toBe(dt);
    expect(applySecondsPrecision.call({ precision: 10 }, dt)).toBe(dt);
  });

  it("precision 0 truncates to whole seconds", () => {
    const r = applySecondsPrecision.call({ precision: 0 }, dt) as Temporal.PlainDateTime;
    expect(r.millisecond).toBe(0);
    expect(r.microsecond).toBe(0);
    expect(r.nanosecond).toBe(0);
  });

  it("precision 3 keeps milliseconds, drops micros + nanos", () => {
    const r = applySecondsPrecision.call({ precision: 3 }, dt) as Temporal.PlainDateTime;
    expect(r.millisecond).toBe(123);
    expect(r.microsecond).toBe(0);
    expect(r.nanosecond).toBe(0);
  });

  it("precision 6 keeps micros, drops nanos", () => {
    const r = applySecondsPrecision.call({ precision: 6 }, dt) as Temporal.PlainDateTime;
    expect(r.millisecond).toBe(123);
    expect(r.microsecond).toBe(456);
    expect(r.nanosecond).toBe(0);
  });

  it("precision 8 keeps two of three nano digits", () => {
    const r = applySecondsPrecision.call({ precision: 8 }, dt) as Temporal.PlainDateTime;
    expect(r.millisecond).toBe(123);
    expect(r.microsecond).toBe(456);
    expect(r.nanosecond).toBe(780);
  });

  it("truncates rather than rounds (789 → 780 at precision 8, not 790)", () => {
    const r = applySecondsPrecision.call({ precision: 8 }, dt) as Temporal.PlainDateTime;
    expect(r.nanosecond).toBe(780);
  });

  it("works on Temporal.Instant via .round()", () => {
    const inst = Temporal.Instant.from("2024-01-02T03:04:05.123456789Z");
    const r = applySecondsPrecision.call({ precision: 3 }, inst) as Temporal.Instant;
    // Compare via the same field path Temporal uses for Instant->ZDT.
    const zdt = r.toZonedDateTimeISO("UTC");
    expect(zdt.millisecond).toBe(123);
    expect(zdt.microsecond).toBe(0);
    expect(zdt.nanosecond).toBe(0);
  });

  it("passes PlainDate (no .round) through unchanged", () => {
    const d = Temporal.PlainDate.from("2024-01-02");
    expect(applySecondsPrecision.call({ precision: 3 }, d)).toBe(d);
  });

  it("passes null/undefined through unchanged", () => {
    expect(applySecondsPrecision.call({ precision: 3 }, null)).toBeNull();
    expect(applySecondsPrecision.call({ precision: 3 }, undefined)).toBeUndefined();
  });
});

describe("newTime", () => {
  it("returns null for 0000-00-00 00:00:00 and rejects out-of-range components", () => {
    expect(newTime(0, 0, 0, 0, 0, 0, 0)).toBeNull();
    expect(newTime(2024, 2, 30, 0, 0, 0, 0)).toBeNull();
  });

  it("subtracts offset (in seconds) when offset != 0", () => {
    const i = newTime(2024, 1, 2, 12, 0, 0, 0, 3600);
    expect(i?.toString()).toBe("2024-01-02T11:00:00Z");
  });
});

describe("fastStringToTime", () => {
  it("returns null for strings without '-'", () => {
    expect(fastStringToTime("1234")).toBeNull();
  });

  it("normalizes Postgres short offset (+00) to (+00:00)", () => {
    const i = fastStringToTime("2026-04-26 14:23:55.123456+00");
    expect(i?.toString().startsWith("2026-04-26T14:23:55.123456")).toBe(true);
  });
});
