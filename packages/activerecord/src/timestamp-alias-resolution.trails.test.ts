import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Developer } from "./test-helpers/models/developer.js";
import { fixtures } from "./test-fixtures.js";

describe("timestamp alias resolution", () => {
  fixtures(["developers"]);

  it("fixtures auto-fill the aliased timestamp column", async () => {
    const dev = await Developer.first();
    expect(dev!.readAttribute("legacy_updated_at")).toBeInstanceOf(Temporal.Instant);
    expect(dev!.readAttribute("updated_at")).toBeInstanceOf(Temporal.Instant);
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
    const before = dev!.readAttribute("legacy_updated_at") as Temporal.Instant;
    const future = before.add({ hours: 1 });
    await dev!.touch({ time: future });
    const reloaded = await Developer.find(dev!.id as number);
    const after = reloaded.readAttribute("legacy_updated_at") as Temporal.Instant;
    expect(Temporal.Instant.compare(after, before)).toBeGreaterThan(0);
  });
});
