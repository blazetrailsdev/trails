import { describe, it, expect, afterEach, vi } from "vitest";
import { currentTimeInstant, freezeTime, travel, travelBack } from "@blazetrails/activesupport";
import { Duration } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";

describe("TouchTest", () => {
  fixtures([]);
  afterEach(() => {
    travelBack();
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

    freezeTime();

    const stamped = new Mixin();
    expect(stamped.readAttribute("updated_at")).toBeNull();
    expect(stamped.readAttribute("created_at")).toBeNull();
    await stamped.save();
    expect(stamped.readAttribute("created_at")).toEqual(currentTimeInstant());
    expect(stamped.readAttribute("updated_at")).toEqual(currentTimeInstant());

    const oldUpdatedAt = stamped.readAttribute("updated_at");

    travel(Duration.minutes(5));

    (stamped as any).attributeWillChangeBang("lft");
    await stamped.save();

    expect(stamped.readAttribute("updated_at")).toEqual(currentTimeInstant());
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
