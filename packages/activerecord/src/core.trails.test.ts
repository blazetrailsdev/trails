/**
 * trails-specific invariants relocated from core.test.ts (RFC 0043).
 * These guard documented trails implementation behavior that has no
 * Rails counterpart test, so they live in a `.trails.test.ts` sibling.
 */
import { describe, it, expect } from "vitest";

import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Topic } from "./test-helpers/models/topic.js";

describe("frozen / isFrozen", () => {
  useHandlerFixtures(["topics"], { schema: canonicalSchema });

  it("deleting an unpersisted record still marks it destroyed and frozen", async () => {
    // Matches Rails' `delete` which only issues the DELETE when persisted?
    // is true, but always ends with `@destroyed = true; freeze`.
    const topic = new Topic({ title: "Alice" });
    await topic.delete();
    expect(topic.isDestroyed()).toBe(true);
    expect(topic.isFrozen()).toBe(true);
  });

  // Rails: ActiveRecord::Core#freeze aliases @attributes = @attributes.clone.freeze.
  // Verifies our implementation backs isFrozen() by freezing the AttributeSet,
  // and that the pre-freeze reference is left untouched so records sharing
  // an attribute map (e.g. via clone/becomes) aren't frozen together.
  it("freeze clones the attribute set so prior references stay mutable", async () => {
    const topic = await Topic.create({ title: "Alice" });
    const attrsOf = (record: Topic) =>
      (record as unknown as { _attributes: { isFrozen(): boolean } })._attributes;
    const preFreezeAttrs = attrsOf(topic);
    topic.freeze();
    expect(topic.isFrozen()).toBe(true);
    expect(attrsOf(topic)).not.toBe(preFreezeAttrs);
    expect(preFreezeAttrs.isFrozen()).toBe(false);
    // The frozen clone is what the record now exposes.
    expect(attrsOf(topic).isFrozen()).toBe(true);
  });
});
