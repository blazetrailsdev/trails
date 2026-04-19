/**
 * Unscope coverage for keys that were missing from UnscopeType:
 * `:create_with`, `:preload`, `:eager_load`. Mirrors Rails'
 * `Relation::QueryMethods#unscope` switch (relation/query_methods.rb).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("Relation#unscope — full Rails key coverage", () => {
  let adapter: DatabaseAdapter;

  class UscAuthor extends Base {
    static {
      this.attribute("name", "string");
    }
  }
  class UscPost extends Base {
    static {
      this.attribute("usc_author_id", "integer");
      this.attribute("title", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    UscAuthor.adapter = adapter;
    UscPost.adapter = adapter;
    registerModel("UscAuthor", UscAuthor);
    registerModel("UscPost", UscPost);
    (UscAuthor as any)._associations = [];
    (UscPost as any)._associations = [];
    Associations.hasMany.call(UscAuthor, "uscPosts", {
      className: "UscPost",
      foreignKey: "usc_author_id",
    });
  });

  it("unscope('createWith') clears _createWithAttrs", () => {
    const rel = (UscAuthor as any).all().createWith({ name: "default" });
    expect((rel as any)._createWithAttrs).toEqual({ name: "default" });
    const cleared = rel.unscope("createWith");
    expect((cleared as any)._createWithAttrs).toEqual({});
  });

  it("unscope('preload') clears preload only — leaves includes / eagerLoad alone", () => {
    const rel = (UscAuthor as any)
      .all()
      .preload("uscPosts")
      .includes("uscPosts")
      .eagerLoad("uscPosts");
    expect((rel as any)._preloadAssociations).toEqual(["uscPosts"]);
    const cleared = rel.unscope("preload");
    expect((cleared as any)._preloadAssociations).toEqual([]);
    expect((cleared as any)._includesAssociations).toEqual(["uscPosts"]);
    expect((cleared as any)._eagerLoadAssociations).toEqual(["uscPosts"]);
  });

  it("unscope('eagerLoad') clears eagerLoad only — leaves includes / preload alone", () => {
    const rel = (UscAuthor as any)
      .all()
      .preload("uscPosts")
      .includes("uscPosts")
      .eagerLoad("uscPosts");
    const cleared = rel.unscope("eagerLoad");
    expect((cleared as any)._eagerLoadAssociations).toEqual([]);
    expect((cleared as any)._includesAssociations).toEqual(["uscPosts"]);
    expect((cleared as any)._preloadAssociations).toEqual(["uscPosts"]);
  });

  it("unscope('includes') clears includes only — leaves preload / eagerLoad alone (Rails-faithful)", () => {
    // Pre-PR-B behavior: unscope('includes') ALSO cleared preload and
    // eagerLoad. Rails' query_methods.rb scopes each key independently.
    const rel = (UscAuthor as any)
      .all()
      .preload("uscPosts")
      .includes("uscPosts")
      .eagerLoad("uscPosts");
    const cleared = rel.unscope("includes");
    expect((cleared as any)._includesAssociations).toEqual([]);
    expect((cleared as any)._preloadAssociations).toEqual(["uscPosts"]);
    expect((cleared as any)._eagerLoadAssociations).toEqual(["uscPosts"]);
  });
});
