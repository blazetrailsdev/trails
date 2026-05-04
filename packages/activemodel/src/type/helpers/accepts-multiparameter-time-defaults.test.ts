import { describe, it, expect } from "vitest";
import { Types } from "../../index.js";
import { AcceptsMultiparameterTime } from "./accepts-multiparameter-time.js";

describe("AcceptsMultiparameterTime defaults", () => {
  it("defaults fill missing slots", () => {
    const type = new Types.DateTimeType();
    const wrapper = new AcceptsMultiparameterTime(type, { "4": 0, "5": 0 });
    // Only year/month/day provided — hour and minute should default to 0
    const result = wrapper.cast({ "1": 2025, "2": 7, "3": 4 });
    expect(result).not.toBeNull();
  });

  it("user values override defaults", () => {
    const type = new Types.DateTimeType();
    const wrapper = new AcceptsMultiparameterTime(type, { "4": 0 });
    // hour explicitly provided as 15 — default of 0 must not overwrite it
    const result = wrapper.cast({ "1": 2025, "2": 7, "3": 4, "4": 15 });
    expect(result).not.toBeNull();
    // The Instant's UTC hour should be 15 (timezone is UTC in test env)
    const instant = result as import("@blazetrails/activesupport/temporal").Temporal.Instant;
    expect(instant.toZonedDateTimeISO("UTC").hour).toBe(15);
  });

  it("empty-string slots get defaults", () => {
    const type = new Types.DateTimeType();
    const wrapper = new AcceptsMultiparameterTime(type, { "4": 0 });
    // hour is empty string — should be treated as missing and filled with 0
    const result = wrapper.cast({ "1": 2025, "2": 7, "3": 4, "4": "" });
    expect(result).not.toBeNull();
    const instant = result as import("@blazetrails/activesupport/temporal").Temporal.Instant;
    expect(instant.toZonedDateTimeISO("UTC").hour).toBe(0);
  });

  it("no defaults, missing year/month/day keys → null (key-based guard)", () => {
    const type = new Types.DateType();
    const wrapper = new AcceptsMultiparameterTime(type);
    // Only key "6" (second) present, no defaults → keys "1"/"2"/"3" absent → guard fires.
    const result = wrapper.cast({ "6": 0 });
    expect(result).toBeNull();
  });
});
