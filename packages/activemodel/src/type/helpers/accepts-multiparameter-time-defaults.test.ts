import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
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
    // Rails' cast for a Hash answers the assembled ::Time itself.
    expect((result as { hour: number }).hour).toBe(15);
  });

  it("a blank slot is a present value and reaches ::Time", () => {
    const type = new Types.DateTimeType();
    const wrapper = new AcceptsMultiparameterTime(type, { "4": 0 });
    // Ruby `values_hash[k] ||= v` leaves "" alone (it is truthy), so the empty
    // string reaches ::Time and its strict Integer() raises. ActiveRecord never
    // gets here with one: `extract_callstack_for_multiparameter_attributes`
    // maps `value.empty?` to nil first (attribute_assignment.rb:157).
    expect(() => wrapper.cast({ "1": 2025, "2": 7, "3": 4, "4": "" })).toThrow(
      'invalid value for Integer(): ""',
    );
  });

  it("no defaults, missing year/month/day keys → null (key-based guard)", () => {
    const type = new Types.DateType();
    const wrapper = new AcceptsMultiparameterTime(type);
    // Only key "6" (second) present, no defaults → keys "1"/"2"/"3" absent → guard fires.
    const result = wrapper.cast({ "6": 0 });
    expect(result).toBeNull();
  });

  it("sub-second precision truncates at a pre-1970 instant", () => {
    // MRI: Time.utc(1969, 7, 20, 20, 17, 40.9999999999).nsec == 999_999_999 —
    // the exact binary value of the Float is truncated at nine digits, never
    // rounded up into the next second, and the negative epoch does not flip the
    // truncation direction.
    const wrapper = new AcceptsMultiparameterTime(new Types.DateTimeType());
    const time = wrapper.cast({
      "1": 1969,
      "2": 7,
      "3": 20,
      "4": 20,
      "5": 17,
      "6": 40.9999999999,
    }) as { nsec: number; sec: number };
    expect(time.nsec).toBe(999_999_999);
    expect(time.sec).toBe(40);

    const instant = new Types.DateTimeType().cast({
      "1": 1969,
      "2": 7,
      "3": 20,
      "4": 20,
      "5": 17,
      "6": 40.9999999999,
    }) as Temporal.Instant;
    // MRI: the same Time#to_i is -14182940, so the instant is that whole
    // second plus the 999_999_999 nanoseconds — one nanosecond shy of the
    // epoch second above it, not rounded past it.
    expect(instant.epochNanoseconds).toBe(-14_182_940n * 1_000_000_000n + 999_999_999n);
  });
});
