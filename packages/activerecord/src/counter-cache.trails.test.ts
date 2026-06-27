/**
 * Trails-specific counter-cache guards with no Rails analogue.
 *
 * These exercise implementation details unique to the trails port (deferred
 * counter-cache resolution through the model registry, demodulized column
 * staging, and identity-keyed memo invalidation) that the canonical
 * counter_cache_test.rb does not — and cannot — cover, since Rails resolves
 * belongs_to targets once via constant lookup rather than a mutable registry.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base, registerModel } from "./index.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Post as CanonicalPost } from "./test-helpers/models/post.js";
import { Comment as CanonicalComment } from "./test-helpers/models/comment.js";

describe("CounterCacheTest (trails)", () => {
  setupHandlerSuite();
  useHandlerFixtures(["posts", "comments"], { schema: canonicalSchema });
  beforeAll(() => {
    registerModel(CanonicalPost);
    registerModel(CanonicalComment);
  });

  // Counter cache pointing at an aliased column resolves to the real column at
  // update time. Mirrors Rails' Post#comments_count (alias_attribute for
  // legacy_comments_count) used as a belongs_to counter cache: the derived
  // snake_case column name is resolved through the camelCase attribute alias.
  it("counter cache updates an aliased column", async () => {
    const post = await CanonicalPost.create({ title: "Hello", body: "World" });
    await CanonicalComment.create({ body: "First", post_id: post.id });

    const reloaded = await CanonicalPost.find(post.id);
    expect(reloaded.legacy_comments_count).toBe(1);
  });
});

describe("CounterCacheTest deferred resolution (trails)", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  afterAll(async () => {
    const { modelRegistry } = await import("./associations.js");
    modelRegistry.delete("Reply");
    modelRegistry.delete("Topic");
    modelRegistry.delete("CpkOrder");
  });

  it("counter cache on unloaded association class works", async () => {
    // Declare Reply (with belongs_to + counterCache) BEFORE Topic exists in the
    // registry — exercises pendingCounterCacheColumns deferred-resolution.
    // Reply rides the canonical `topics` table (STI-style, FK = parent_id),
    // mirroring how Rails' Reply < Topic works.
    class Reply extends Base {
      static _tableName = "topics";
      static {
        this.attribute("content", "text");
        this.attribute("parent_id", "integer");
        this.belongsTo("topic", { counterCache: true, foreignKey: "parent_id" });
      }
    }
    // Clear any leftover Topic from prior tests so the unloaded path is
    // actually exercised (registerModel leaks across test cases).
    const { modelRegistry } = await import("./associations.js");
    modelRegistry.delete("Topic");
    registerModel(Reply);

    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("replies_count", "integer", { default: 0 });
      }
    }
    registerModel(Topic);

    expect(Topic.isCounterCacheColumn("replies_count")).toBe(true);
    const t = await Topic.create({ title: "x" });
    await Reply.create({ content: "r", parent_id: t.id });
    const reloaded = await Topic.find(t.id);
    expect(reloaded.replies_count).toBe(1);
  });

  it("flushed counter cache column uses demodulized name when owner is defined before target", async () => {
    // CpkBook (belongs_to :order, counter_cache) is defined before CpkOrder in
    // cpk.ts, so addCounterCacheCallbacks stages the column while CpkOrder is
    // unregistered. The staged value must be re-derived at flush time to the
    // demodulized `books_count`, not the flat `cpk_books_count`.
    const { CpkOrder } = await import("./test-helpers/models/cpk.js");
    registerModel(CpkOrder);
    const cols = (CpkOrder as unknown as { _counterCacheColumns: Set<string> })
      ._counterCacheColumns;
    expect(cols.has("books_count")).toBe(true);
    expect(cols.has("cpk_books_count")).toBe(false);
  });
});

// Trails-specific guard (no Rails analogue): Rails memoizes
// `counter_cache_column` unconditionally with `@counter_cache_column ||=`,
// because its target class resolves once via constant lookup. Trails resolves
// the belongs_to target through the model registry on every call (flat class
// names emulate Rails' demodulize), so a target re-registered between tests
// would otherwise return a stale memo. PR #3704 keys the memo on the resolved
// class identity (`_counterCacheColumnKlass`); this exercises that invalidation
// path directly: compute -> re-register the target with a different inverse
// hasMany shape -> recompute yields the new column, not the cached one.
describe("counterCacheColumn memo invalidation on target re-registration", () => {
  const makeShelfWithoutInverse = (): typeof Base => {
    class Shelf extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    return Shelf;
  };

  const makeShelfWithInverse = (): typeof Base => {
    class Shelf extends Base {
      static {
        this.attribute("name", "string");
        // hasMany whose singular camelCase ("Book") is a suffix of the flat
        // owner name "FooBook" -> demodulized "books_count" rather than the
        // default pluralized-owner "foo_books_count".
        this.hasMany("books", { className: "FooBook" });
      }
    }
    return Shelf;
  };

  afterAll(async () => {
    const { modelRegistry } = await import("./associations.js");
    modelRegistry.delete("FooBook");
    modelRegistry.delete("Shelf");
  });

  it("recomputes the counter cache column after the target class is re-registered", async () => {
    const { modelRegistry } = await import("./associations.js");
    modelRegistry.delete("Shelf");

    class FooBook extends Base {
      static {
        this.attribute("shelf_id", "integer");
        this.belongsTo("shelf", { counterCache: true });
      }
    }
    registerModel(FooBook);

    const reflection = (
      FooBook as unknown as {
        _reflectOnAssociation: (name: string) => { counterCacheColumn: () => string };
      }
    )._reflectOnAssociation("shelf");

    // First target: no inverse hasMany -> column derives from the flat owner
    // name. This populates the identity-keyed memo.
    registerModel(makeShelfWithoutInverse());
    expect(reflection.counterCacheColumn()).toBe("foo_books_count");

    // Re-register a *different* class object under the same name, now carrying
    // the inverse hasMany. The registry returns the new identity, so the memo
    // misses and recomputes to the demodulized column instead of the stale one.
    modelRegistry.delete("Shelf");
    registerModel(makeShelfWithInverse());
    expect(reflection.counterCacheColumn()).toBe("books_count");
  });
});
