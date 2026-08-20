import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { include } from "@blazetrails/activesupport";
import { Types, ValueType } from "../../index.js";
import { AcceptsMultiparameterTime } from "./accepts-multiparameter-time.js";

/**
 * `include Helpers::AcceptsMultiparameterTime.new(defaults: ...)` into a fresh
 * type, the way each type does in its own class body — the mixin's methods then
 * answer on the instance, so `cast` reaches its `::Time` assembly. The base is a
 * plain `ValueType`, since Ruby holds a module once per ancestry and each of
 * date.rb / date_time.rb / time.rb includes its own instance exactly once.
 */
function typeIncluding(defaults?: Record<string, number>): { cast(value: unknown): unknown } {
  class IncludingType extends ValueType {}
  include(IncludingType, new AcceptsMultiparameterTime(defaults ? { defaults } : {}));
  return new IncludingType() as unknown as { cast(value: unknown): unknown };
}

describe("AcceptsMultiparameterTime defaults", () => {
  it("defaults fill missing slots", () => {
    const wrapper = typeIncluding({ "4": 0, "5": 0 });
    const result = wrapper.cast({ "1": 2025, "2": 7, "3": 4 });
    expect(result).not.toBeNull();
  });

  it("user values override defaults", () => {
    const wrapper = typeIncluding({ "4": 0 });
    const result = wrapper.cast({ "1": 2025, "2": 7, "3": 4, "4": 15 });
    expect((result as { hour: number }).hour).toBe(15);
  });

  it("a blank slot is a present value and reaches ::Time", () => {
    const wrapper = typeIncluding({ "4": 0 });
    expect(() => wrapper.cast({ "1": 2025, "2": 7, "3": 4, "4": "" })).toThrow(
      'invalid value for Integer(): ""',
    );
  });

  it("no defaults, missing year/month/day keys → null (key-based guard)", () => {
    const wrapper = typeIncluding();
    const result = wrapper.cast({ "6": 0 });
    expect(result).toBeNull();
  });

  it("slots are ordered by index, not by their string spelling", () => {
    const wrapper = typeIncluding({ "10": 0 });
    const time = wrapper.cast({ "1": 2004, "2": 6, "3": 24, "4": 16, "5": 24, "6": 12 }) as {
      hour: number;
      min: number;
      sec: number;
    };
    expect([time.hour, time.min, time.sec]).toEqual([16, 24, 12]);
  });

  it("sub-second precision truncates at a pre-1970 instant", () => {
    const wrapper = typeIncluding();
    const parts = { "1": 1969, "2": 7, "3": 20, "4": 20, "5": 17, "6": 40.9999999999 };
    const time = wrapper.cast(parts) as { nsec: number; sec: number };
    expect(time.nsec).toBe(999_999_999);
    expect(time.sec).toBe(40);

    const instant = new Types.DateTimeType().cast(parts) as Temporal.Instant;
    expect(instant.epochNanoseconds).toBe(-14_182_940n * 1_000_000_000n + 999_999_999n);
  });
});
