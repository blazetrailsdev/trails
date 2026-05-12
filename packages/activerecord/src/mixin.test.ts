import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("TouchTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(async () => {
    adapter = freshAdapter();
    await defineSchema(adapter, {
      mixins: { lft: "integer", updated_at: "datetime", created_at: "datetime" },
    });
  });

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
        this.adapter = adapter;
      }
    }

    const t0 = new Date("2024-01-01T00:00:00.000Z");
    vi.useFakeTimers({ now: t0 });

    const stamped = new Mixin();
    expect(stamped.readAttribute("updated_at")).toBeNull();
    expect(stamped.readAttribute("created_at")).toBeNull();
    await stamped.save();
    const createdAt = stamped.readAttribute("created_at") as unknown;
    expect(createdAt).not.toBeNull();

    const oldUpdatedAt = stamped.readAttribute("updated_at");

    // travel 5 minutes — vi.setSystemTime advances the fake clock without resetting it
    vi.setSystemTime(new Date(t0.getTime() + 5 * 60 * 1000));

    // Mirror lft_will_change! — force-marks lft dirty without changing its value
    (stamped as any)._dirty.forceChange("lft", stamped.readAttribute("lft"));
    await stamped.save();

    const newUpdatedAt = stamped.readAttribute("updated_at");
    expect(newUpdatedAt).not.toBeNull();
    expect(newUpdatedAt).not.toEqual(oldUpdatedAt);
    // created_at does not change on update
    expect(stamped.readAttribute("created_at")).toEqual(createdAt);
  });

  it("create turned off", async () => {
    class Mixin extends Base {
      static {
        this.tableName = "mixins";
        this.attribute("lft", "integer");
        this.attribute("updated_at", "datetime");
        this.attribute("created_at", "datetime");
        this.adapter = adapter;
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
