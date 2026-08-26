import { describe, expect, it } from "vitest";
import { Time as RubyTime, resetLocalTimeZoneId } from "@blazetrails/date";
import "./calculations.js";

/**
 * `TimeZoneTestHelpers#with_env_tz` (`test/time_zone_test_helpers.rb:20-25`).
 * `Time`'s local-zone memo is MRI's `tzset` cache, so `TZ` moving under it has
 * to drop it, exactly as `tzset` does.
 */
function withEnvTz<T>(tz: string, fn: () => T): T {
  const orig = process.env.TZ;
  process.env.TZ = tz;
  resetLocalTimeZoneId();
  try {
    return fn();
  } finally {
    if (orig === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = orig;
    }
    resetLocalTimeZoneId();
  }
}

/**
 * `Time#advance`'s `:weeks`/`:days` normalisation is `divmod(1)`
 * (`time/calculations.rb:195-201`), which FLOORS: `(-1.5).divmod(1)` is
 * `[-2, 0.5]` on ruby 3.3.11, not the `[-1, -0.5]` truncation would give. Rails
 * has no test over a negative fractional `:weeks`/`:days`, so the two
 * expectations below are MRI's own answers for the Rails body, transcribed.
 */
describe("TimeExtCalculationsTest (trails)", () => {
  it("advance floors a negative fractional weeks like Ruby's divmod", () => {
    withEnvTz("US/Eastern", () => {
      const advanced = RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ weeks: -1.5 });
      expect(advanced.strftime("%Y-%m-%d %H:%M:%S")).toBe("2005-02-18 03:15:10");
    });
  });

  it("advance floors a negative fractional days like Ruby's divmod", () => {
    withEnvTz("US/Eastern", () => {
      const advanced = RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ days: -5.5 });
      expect(advanced.strftime("%Y-%m-%d %H:%M:%S")).toBe("2005-02-23 03:15:10");
    });
  });
});
