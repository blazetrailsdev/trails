// Fidelity: ActiveRecord::Timestamp resolves attribute aliases before reading
// timestamp columns (timestamp.rb:92-97, 163-167) and ActiveRecord::Integration
// builds cache keys / versions from the alias-resolved reader (integration.rb).
// The canonical `Developer` model aliases updated_at/updated_on to the real
// `legacy_updated_at`/`legacy_updated_on` columns, so cache keys, fixture
// auto-timestamping, and touch must all follow the aliases.
import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Developer } from "./test-helpers/models/developer.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";

describe("timestamp alias resolution", () => {
  useHandlerFixtures(["developers"]);

  it("fixtures auto-fill the aliased timestamp column", async () => {
    const dev = await Developer.first();
    // The developers table has only legacy_updated_at; fixture fill resolves
    // the updated_at alias and stamps it.
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
      // Versioning on ⇒ cache key omits the timestamp.
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
