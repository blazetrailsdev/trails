import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { freezeTime, travel, travelBack } from "@blazetrails/activesupport";
import { Duration } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";

class Mixin extends Base {}

describe("TouchTest", () => {
  fixtures(["mixins"]);

  beforeEach(() => {
    freezeTime();
  });

  afterEach(() => {
    travelBack();
    vi.useRealTimers();
  });

  it("update", async () => {
    const stamped = new Mixin();

    expect(stamped.readAttribute("updated_at")).toBeNull();
    expect(stamped.readAttribute("created_at")).toBeNull();
    await stamped.save();
    expect(stamped.readAttribute("updated_at")).toEqual(RubyTime.now());
    expect(stamped.readAttribute("created_at")).toEqual(RubyTime.now());
  });

  it("create", async () => {
    const obj = await Mixin.create();
    expect(obj.readAttribute("updated_at")).toEqual(RubyTime.now());
    expect(obj.readAttribute("created_at")).toEqual(RubyTime.now());
  });

  it("many updates", async () => {
    const stamped = new Mixin();
    expect(stamped.readAttribute("updated_at")).toBeNull();
    expect(stamped.readAttribute("created_at")).toBeNull();
    await stamped.save();
    expect(stamped.readAttribute("created_at")).toEqual(RubyTime.now());
    expect(stamped.readAttribute("updated_at")).toEqual(RubyTime.now());

    const oldUpdatedAt = stamped.readAttribute("updated_at");

    travel(Duration.minutes(5));

    (stamped as any).attributeWillChangeBang("lft");
    await stamped.save();

    expect(stamped.readAttribute("updated_at")).toEqual(RubyTime.now());
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
