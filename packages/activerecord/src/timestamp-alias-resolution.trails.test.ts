import { describe, it, expect } from "vitest";
import { Time as RubyTime } from "@blazetrails/date";
import { Developer } from "./test-helpers/models/developer.js";
import { fixtures } from "./test-fixtures.js";

describe("timestamp alias resolution", () => {
  fixtures(["developers"]);

  it("fixtures auto-fill the aliased timestamp column", async () => {
    const dev = await Developer.first();
    expect(dev!.readAttribute("legacy_updated_at")).toBeInstanceOf(RubyTime);
    expect(dev!.readAttribute("updated_at")).toBeInstanceOf(RubyTime);
  });

  it("cache key embeds the aliased updated_at timestamp", async () => {
    const dev = await Developer.first();
    expect(dev!.cacheKey()).toMatch(/^developers\/\d+-\d{20}$/);
  });

  it("cache key is stable across reads", async () => {
    const dev = await Developer.first();
    expect(dev!.cacheKey()).toBe(dev!.cacheKey());
  });

  it("cache version reads the aliased updated_at when versioning is on", async () => {
    const original = Developer.cacheVersioning;
    Developer.cacheVersioning = true;
    try {
      const dev = await Developer.first();
      expect(dev!.cacheVersion()).toMatch(/^\d{20}$/);
      expect(dev!.cacheKey()).toMatch(/^developers\/\d+$/);
    } finally {
      Developer.cacheVersioning = original;
    }
  });

  it("touch updates the aliased timestamp column", async () => {
    const dev = await Developer.first();
    const before = dev!.readAttribute("legacy_updated_at") as RubyTime;
    const future = before.plus(3600);
    await dev!.touch({ time: future });
    const reloaded = await Developer.find(dev!.id as number);
    const after = reloaded.readAttribute("legacy_updated_at") as RubyTime;
    expect(after.toF()).toBeGreaterThan(before.toF());
  });
});
