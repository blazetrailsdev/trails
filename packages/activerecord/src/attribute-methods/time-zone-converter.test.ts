import { describe, it, expect, afterEach } from "vitest";
import { TimeZoneConverter } from "./time-zone-conversion.js";
import { DateTime } from "../type/date-time.js";
import { TimeWithZone, TimeZone, setZone, resetZone } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";

describe("TimeZoneConverterTest", () => {
  afterEach(() => {
    resetZone();
  });

  it("comparison with date time type", () => {
    // Two distinct DateTime instances (mirrors Rails' Marshal round-trip producing
    // a new object) — verifies ValueType.equals compares by shape, not reference.
    const value = new TimeZoneConverter(new DateTime());
    const valueFromCache = new TimeZoneConverter(new DateTime());

    expect(value.equals(valueFromCache)).toBe(true);
    expect(value.equals("foo" as any)).toBe(false);
  });

  it("cast returns null for null/undefined", () => {
    const converter = new TimeZoneConverter(new DateTime());
    expect(converter.cast(null)).toBeNull();
    expect(converter.cast(undefined)).toBeNull();
  });

  it("cast wraps Temporal.Instant in TimeWithZone for current zone", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const instant = Temporal.Instant.from("2024-06-15T14:00:00Z");
    const result = converter.cast(instant);
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    // 14:00 UTC = 10:00 EDT (UTC-4 in summer)
    expect(twz.hour).toBe(10);
    expect(twz.timeZone.name).toBe("Eastern Time (US & Canada)");
  });

  it("cast wraps Temporal.ZonedDateTime in current zone", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    // ZonedDateTime in UTC at 14:00
    const zdt = Temporal.Instant.from("2024-06-15T14:00:00Z").toZonedDateTimeISO("UTC");
    const result = converter.cast(zdt);
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    // 14:00 UTC = 10:00 EDT (UTC-4 in summer)
    expect(twz.hour).toBe(10);
    expect(twz.timeZone.name).toBe("Eastern Time (US & Canada)");
    expect(twz.toI()).toBe(zdt.toInstant().epochMilliseconds / 1000);
  });

  it("cast moves existing TimeWithZone to current zone", () => {
    const pacific = TimeZone.find("Pacific Time (US & Canada)");
    const eastern = TimeZone.find("Eastern Time (US & Canada)");
    const instant = Temporal.Instant.from("2024-06-15T14:00:00Z");
    const pacificTime = new TimeWithZone(instant, pacific);

    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const result = converter.cast(pacificTime);
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    expect(twz.timeZone.name).toBe(eastern.name);
    expect(twz.toI()).toBe(pacificTime.toI()); // same instant
  });

  it("cast parses offset-less string as local to current zone (not default_timezone)", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    // "10:30:00" with no offset → should be 10:30 local Eastern, not 10:30 UTC
    const result = converter.cast("2024-06-15 10:30:00");
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    // Wall-clock in the zone must be 10:30 (not 06:30 as wrong UTC-then-display would give)
    expect(twz.hour).toBe(10);
    expect(twz.min).toBe(30);
    expect(twz.timeZone.name).toBe("Eastern Time (US & Canada)");
    // UTC instant should be 14:30 (10:30 EDT = UTC-4, so UTC = 10:30 + 4h)
    expect(twz.utc().epochMilliseconds).toBe(
      Temporal.Instant.from("2024-06-15T14:30:00Z").epochMilliseconds,
    );
  });

  it("cast parses string with offset as absolute instant then wraps in zone", () => {
    setZone("UTC");
    const converter = new TimeZoneConverter(new DateTime());
    const result = converter.cast("2024-06-15T10:30:00-04:00");
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    // 10:30 EDT = 14:30 UTC, displayed in UTC zone
    expect(twz.hour).toBe(14);
    expect(twz.min).toBe(30);
  });

  it("cast returns raw subtype result when no zone is configured", () => {
    resetZone();
    const converter = new TimeZoneConverter(new DateTime());
    const instant = Temporal.Instant.from("2024-06-15T14:00:00Z");
    const result = converter.cast(instant);
    // No zone set — value passes through unchanged
    expect(result).toBeInstanceOf(Temporal.Instant);
  });

  it("cast returns null for plain object with non-multiparameter keys", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    // A plain object that isn't a valid multiparameter hash → subtype returns null → null
    const result = converter.cast({ date: "2024-06-15" });
    expect(result).toBeNull();
  });

  it("deserialize wraps Temporal.Instant from subtype in TimeWithZone", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    // DB value: "2024-06-15 14:00:00" (UTC stored value)
    const result = converter.deserialize("2024-06-15 14:00:00");
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    // 14:00 UTC = 10:00 EDT
    expect(twz.hour).toBe(10);
  });

  it("serialize extracts UTC from TimeWithZone before delegating to subtype", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const instant = Temporal.Instant.from("2024-06-15T14:00:00Z");
    const eastern = TimeZone.find("Eastern Time (US & Canada)");
    const twz = new TimeWithZone(instant, eastern);
    // 14:00 UTC displayed as 10:00 EDT; serialize must produce the UTC SQL string
    const result = converter.serialize(twz);
    expect(typeof result).toBe("string");
    expect(result).toContain("2024-06-15");
    expect(result).toContain("14:00:00");
  });

  it("serialize round-trips: deserialize then serialize returns UTC SQL string", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const deserialized = converter.deserialize("2024-06-15 14:00:00");
    expect(deserialized).toBeInstanceOf(TimeWithZone);
    const serialized = converter.serialize(deserialized);
    // UTC, space-separated SQL format (default precision 6 adds .000000)
    expect(serialized).toMatch(/^2024-06-15 14:00:00/);
  });
});
