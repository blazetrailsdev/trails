import { describe, it, expect, afterEach, vi } from "vitest";
import { freezeTime, travel, travelBack } from "@blazetrails/activesupport";
import { Duration } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";

class Mixin extends Base {
  static {
    this.tableName = "mixins";
    this.attribute("lft", "integer");
    this.attribute("updated_at", "datetime");
    this.attribute("created_at", "datetime");
  }
}

describe("TouchTest", () => {
  fixtures([]);
  afterEach(() => {
    travelBack();
    vi.useRealTimers();
  });

  it("update", async () => {
    freezeTime();

    const stamped = new Mixin();

    expect(stamped.readAttribute("updated_at")).toBeNull();
    expect(stamped.readAttribute("created_at")).toBeNull();
    await stamped.save();
    expect(stamped.readAttribute("updated_at")).toEqual(
      await Mixin.currentTimeFromProperTimezone(),
    );
    expect(stamped.readAttribute("created_at")).toEqual(
      await Mixin.currentTimeFromProperTimezone(),
    );
  });

  it("create", async () => {
    freezeTime();

    const obj = await Mixin.create();
    expect(obj.readAttribute("updated_at")).toEqual(await Mixin.currentTimeFromProperTimezone());
    expect(obj.readAttribute("created_at")).toEqual(await Mixin.currentTimeFromProperTimezone());
  });

  it("many updates", async () => {
    freezeTime();

    const stamped = new Mixin();
    expect(stamped.readAttribute("updated_at")).toBeNull();
    expect(stamped.readAttribute("created_at")).toBeNull();
    await stamped.save();
    expect(stamped.readAttribute("created_at")).toEqual(
      await Mixin.currentTimeFromProperTimezone(),
    );
    expect(stamped.readAttribute("updated_at")).toEqual(
      await Mixin.currentTimeFromProperTimezone(),
    );

    const oldUpdatedAt = stamped.readAttribute("updated_at");

    travel(Duration.minutes(5));

    (stamped as any).attributeWillChangeBang("lft");
    await stamped.save();

    expect(stamped.readAttribute("updated_at")).toEqual(
      await Mixin.currentTimeFromProperTimezone(),
    );
    expect(stamped.readAttribute("created_at")).toEqual(oldUpdatedAt);
  });

  it("create turned off", async () => {
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
