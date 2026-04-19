/**
 * Mirrors Rails' Association#association_scope memoization
 * (activerecord/lib/active_record/associations/association.rb:300-308):
 *
 *     def association_scope
 *       if klass
 *         @association_scope ||= ...AssociationScope.scope(self)...
 *       end
 *     end
 *
 * Reset on init and on `reload()` via `reset_scope`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { AssociationScope } from "./association-scope.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("Association scope cache", () => {
  let adapter: DatabaseAdapter;

  class CacheAuthor extends Base {
    static {
      this.attribute("name", "string");
    }
  }
  class CachePost extends Base {
    static {
      this.attribute("cache_author_id", "integer");
      this.attribute("title", "string");
    }
  }
  class CacheComment extends Base {
    static {
      this.attribute("cache_post_id", "integer");
      this.attribute("body", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    CacheAuthor.adapter = adapter;
    CachePost.adapter = adapter;
    CacheComment.adapter = adapter;
    registerModel("CacheAuthor", CacheAuthor);
    registerModel("CachePost", CachePost);
    registerModel("CacheComment", CacheComment);
    (CacheAuthor as any)._associations = [];
    (CachePost as any)._associations = [];
    (CacheComment as any)._associations = [];
    Associations.hasMany.call(CacheAuthor, "cachePosts", {
      className: "CachePost",
      foreignKey: "cache_author_id",
    });
    Associations.hasMany.call(CachePost, "cacheComments", {
      className: "CacheComment",
      foreignKey: "cache_post_id",
    });
  });

  // Restore spies even if a test throws — leaked spies on
  // AssociationScope.scope can corrupt sibling tests in this file.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AssociationScope.scope is called once across repeated scope builds (memoized)", async () => {
    // Test the scope cache directly: assert that calling
    // associationScope() twice on the same instance only invokes
    // AssociationScope.scope once, and that resetScope() forces a
    // rebuild. (Going through loadTarget/reload would be ambiguous —
    // a second loadTarget short-circuits on the already-loaded target
    // and never builds a scope, so the cache wouldn't be exercised.)
    const author = await CacheAuthor.create({ name: "A" });
    await CachePost.create({ cache_author_id: author.id, title: "p1" });

    const spy = vi.spyOn(AssociationScope, "scope");
    const assoc = (author as any).association("cachePosts");

    assoc.associationScope();
    const afterFirst = spy.mock.calls.length;
    expect(afterFirst).toBe(1);

    // Second call hits the cache — no new AssociationScope.scope call.
    assoc.associationScope();
    expect(spy.mock.calls.length).toBe(afterFirst);

    // resetScope() (called by reload()) clears the cache; next call rebuilds.
    assoc.resetScope();
    assoc.associationScope();
    expect(spy.mock.calls.length).toBe(afterFirst + 1);
  });

  it("disable_joins associations route through the dedicated DJAS loader, not Association.associationScope()", async () => {
    // Loaders detect `disable_joins: true` early and route to
    // `_loadThroughViaDisableJoinsScope` (which calls DJAS directly,
    // returning a deferred-chain DJAR). They never call
    // `Association.associationScope()` for disable-joins reflections,
    // so the JOIN-based cache contract doesn't apply — DJAS owns
    // its own per-call construction matching Rails' per-call DJAS
    // (association.rb:107-117).
    const { loadHasMany } = await import("../associations.js");
    Associations.hasMany.call(CacheAuthor, "cacheCommentsDj", {
      className: "CacheComment",
      through: "cachePosts",
      source: "cacheComments",
      disableJoins: true,
    });
    const author = await CacheAuthor.create({ name: "A" });
    const post = await CachePost.create({ cache_author_id: author.id, title: "p" });
    await CacheComment.create({ cache_post_id: post.id, body: "c" });

    const spy = vi.spyOn(AssociationScope, "scope");
    const reflection = (CacheAuthor as any)._reflectOnAssociation("cacheCommentsDj");
    const records = await loadHasMany(author, "cacheCommentsDj", reflection.options);
    expect(records.map((r: any) => r.body)).toEqual(["c"]);
    // JOIN-based AssociationScope was never invoked — DJAS handled it.
    expect(spy).not.toHaveBeenCalled();
  });

  it("loader paths hit the cache too (not just explicit record.association(name) calls)", async () => {
    // CollectionProxy / AssociationProxy call loadHasMany / loadHasOne
    // directly without first calling `record.association(name)`. The
    // cache must still apply — otherwise the common proxy path
    // (e.g. `await blog.posts`) would rebuild the scope every time.
    // `_builtAssociationScope` lazily materializes the Association
    // instance to cover this case.
    const { loadHasMany } = await import("../associations.js");
    const author = await CacheAuthor.create({ name: "A" });
    await CachePost.create({ cache_author_id: author.id, title: "p1" });
    await CachePost.create({ cache_author_id: author.id, title: "p2" });

    const spy = vi.spyOn(AssociationScope, "scope");
    const opts = {
      className: "CachePost",
      foreignKey: "cache_author_id",
    };

    // First loader call populates the Association-instance cache.
    await loadHasMany(author, "cachePosts", opts);
    const afterFirst = spy.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    // Second loader call — different caches would rebuild the scope.
    // With our cache, AssociationScope.scope count is unchanged.
    await loadHasMany(author, "cachePosts", opts);
    expect(spy.mock.calls.length).toBe(afterFirst);
  });

  it("different owners get independent caches", async () => {
    const a1 = await CacheAuthor.create({ name: "A1" });
    const a2 = await CacheAuthor.create({ name: "A2" });
    const assoc1 = (a1 as any).association("cachePosts");
    const assoc2 = (a2 as any).association("cachePosts");
    await assoc1.loadTarget();
    await assoc2.loadTarget();
    // Cache fields are per-instance; loading one doesn't pollute the other.
    expect((assoc1 as any)._cachedAssociationScope).toBeDefined();
    expect((assoc2 as any)._cachedAssociationScope).toBeDefined();
    expect((assoc1 as any)._cachedAssociationScope).not.toBe(
      (assoc2 as any)._cachedAssociationScope,
    );
  });
});
