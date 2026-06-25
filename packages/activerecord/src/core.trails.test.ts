/**
 * trails-specific invariants relocated from core.test.ts (RFC 0043).
 * These guard documented trails implementation behavior that has no
 * Rails counterpart test, so they live in a `.trails.test.ts` sibling.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";

import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

const TEST_SCHEMA = {
  topics: { title: "string", author: "string" },
  users: { name: "string", email: "string" },
} as const;

describe("frozen / isFrozen", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  it("deleting an unpersisted record still marks it destroyed and frozen", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }

    // Matches Rails' `delete` which only issues the DELETE when persisted?
    // is true, but always ends with `@destroyed = true; freeze`.
    const user = new User({ name: "Alice" });
    await user.delete();
    expect(user.isDestroyed()).toBe(true);
    expect(user.isFrozen()).toBe(true);
  });

  // Rails: ActiveRecord::Core#freeze aliases @attributes = @attributes.clone.freeze.
  // Verifies our implementation backs isFrozen() by freezing the AttributeSet,
  // and that the pre-freeze reference is left untouched so records sharing
  // an attribute map (e.g. via clone/becomes) aren't frozen together.
  it("freeze clones the attribute set so prior references stay mutable", async () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }

    const user = await User.create({ name: "Alice" });
    const attrsOf = (record: User) =>
      (record as unknown as { _attributes: { isFrozen(): boolean } })._attributes;
    const preFreezeAttrs = attrsOf(user);
    user.freeze();
    expect(user.isFrozen()).toBe(true);
    expect(attrsOf(user)).not.toBe(preFreezeAttrs);
    expect(preFreezeAttrs.isFrozen()).toBe(false);
    // The frozen clone is what the record now exposes.
    expect(attrsOf(user).isFrozen()).toBe(true);
  });
});
