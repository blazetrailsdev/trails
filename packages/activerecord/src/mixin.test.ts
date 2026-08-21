import { describe, it, expect, afterEach, vi } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";

// Rails' `travel` freezes `Time.now`; vitest's fake timers only patch `Date`,
// and the timestamp writer reads `Temporal.Now.instant()` off a nanosecond
// clock, so freeze that too — otherwise `assert_equal Time.now, created_at`
// compares against a drifting sub-millisecond tail.
let frozenNow = Temporal.Instant.fromEpochMilliseconds(0);
const timeNow = () => frozenNow;

describe("TouchTest", () => {
  fixtures([]);
  afterEach(() => {
    vi.useRealTimers();
  });

  it("many updates", async () => {
    class Mixin extends Base {
      static {
        this.tableName = "mixins";
        this.attribute("lft", "integer");
        this.attribute("updated_at", "datetime");
        this.attribute("created_at", "datetime");
      }
    }

    const t0 = new Date("2024-01-01T00:00:00.000Z");
    vi.useFakeTimers({ now: t0 });
    frozenNow = Temporal.Instant.fromEpochMilliseconds(t0.getTime());
    vi.spyOn(Temporal.Now, "instant").mockImplementation(() => frozenNow);

    const stamped = new Mixin();
    expect(stamped.readAttribute("updated_at")).toBeNull();
    expect(stamped.readAttribute("created_at")).toBeNull();
    await stamped.save();
    expect(stamped.readAttribute("created_at")).toEqual(timeNow());
    expect(stamped.readAttribute("updated_at")).toEqual(timeNow());

    const oldUpdatedAt = stamped.readAttribute("updated_at");

    // travel 5 minutes — vi.setSystemTime advances the fake clock without resetting it
    vi.setSystemTime(new Date(t0.getTime() + 5 * 60 * 1000));
    frozenNow = Temporal.Instant.fromEpochMilliseconds(t0.getTime() + 5 * 60 * 1000);

    // Mirror lft_will_change! — force-marks lft dirty without changing its value.
    // Use _attributes.fetchValue (not readAttribute) to match attributeWillChangeBang semantics:
    // fetchValue doesn't add to _accessedFields.
    (stamped as any)._dirty.forceChange("lft", (stamped as any)._attributes.fetchValue("lft"));
    await stamped.save();

    expect(stamped.readAttribute("updated_at")).toEqual(timeNow());
    // created_at does not change on update, so it still reads as the
    // pre-travel updated_at (mixin_test.rb:46).
    expect(stamped.readAttribute("created_at")).toEqual(oldUpdatedAt);
  });

  it("create turned off", async () => {
    class Mixin extends Base {
      static {
        this.tableName = "mixins";
        this.attribute("lft", "integer");
        this.attribute("updated_at", "datetime");
        this.attribute("created_at", "datetime");
      }
    }

    const prevRecordTimestamps = Mixin.recordTimestamps;
    Mixin.recordTimestamps = false;
    try {
      const mixin = new Mixin();
      expect(mixin.readAttribute("updated_at")).toBeNull();
      await mixin.save();
      expect(mixin.readAttribute("updated_at")).toBeNull();
    } finally {
      Mixin.recordTimestamps = prevRecordTimestamps;
    }
  });
});
