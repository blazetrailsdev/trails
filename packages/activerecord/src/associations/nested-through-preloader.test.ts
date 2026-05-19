/**
 * HMT Slot D — Nested-through preloader + STI + joins/includes.
 *
 * A "nested through" is a `has_many :through` whose `through:`
 * association is itself a `has_many :through` (i.e. the source
 * reflection chain has more than one through step). Rails treats
 * these chains by flattening them through `Reflection#chain` and
 * walking each step. These tests pin our preloader's nested-through
 * path against:
 *
 *   - direct load through a 3-level chain (Author -> Posts ->
 *     Comments -> Ratings) with the regular JOIN-based path
 *   - eager preload through the same chain via `includes`
 *   - eager preload combined with an outer-relation `where` filter
 *     (preloaded targets must not be silently dropped)
 *   - STI subclass as the final source of a nested-through chain,
 *     under both direct load and `includes` preload
 *
 *   - JOIN-based `joins(nestedThrough).where(targetTable.col: N)`
 *     traversal of the same 3-level chain (currently BLOCKED on a
 *     JoinDependency gap — see the skipped test below)
 *
 * Intermediate-table `references` against a nested-through chain
 * belong to Slot E and are not covered here.
 *
 * Mirrors selected scenarios from
 * vendor/rails/activerecord/test/cases/associations/nested_through_associations_test.rb.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel, registerSubclass, enableSti } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("HMT Slot D — nested-through preloader / STI / joins+includes", () => {
  let adapter: DatabaseAdapter;

  class NtdAuthor extends Base {
    static {
      this._tableName = "ntd_authors";
      this.attribute("name", "string");
    }
  }
  class NtdPost extends Base {
    static {
      this._tableName = "ntd_posts";
      this.attribute("ntd_author_id", "integer");
      this.attribute("title", "string");
    }
  }
  class NtdComment extends Base {
    static {
      this._tableName = "ntd_comments";
      this.attribute("ntd_post_id", "integer");
      this.attribute("body", "string");
    }
  }
  class NtdRating extends Base {
    static {
      this._tableName = "ntd_ratings";
      this.attribute("ntd_comment_id", "integer");
      this.attribute("value", "integer");
      this.attribute("type", "string");
    }
  }
  class NtdHighRating extends NtdRating {}
  // Register STI subclass once at module scope so repeated beforeEach
  // invocations don't accumulate duplicate descendants on the parent.
  enableSti(NtdRating);
  registerSubclass(NtdHighRating);

  beforeEach(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, {
      ntd_authors: { name: "string" },
      ntd_posts: { ntd_author_id: "integer", title: "string" },
      ntd_comments: { ntd_post_id: "integer", body: "string" },
      ntd_ratings: { ntd_comment_id: "integer", value: "integer", type: "string" },
    });
    NtdAuthor.adapter = adapter;
    NtdPost.adapter = adapter;
    NtdComment.adapter = adapter;
    NtdRating.adapter = adapter;
    NtdHighRating.adapter = adapter;
    registerModel("NtdAuthor", NtdAuthor);
    registerModel("NtdPost", NtdPost);
    registerModel("NtdComment", NtdComment);
    registerModel("NtdRating", NtdRating);
    registerModel("NtdHighRating", NtdHighRating);
    (NtdAuthor as any)._associations = [];
    (NtdPost as any)._associations = [];
    (NtdComment as any)._associations = [];

    Associations.hasMany.call(NtdAuthor, "ntdPosts", {
      className: "NtdPost",
      foreignKey: "ntd_author_id",
    });
    Associations.hasMany.call(NtdPost, "ntdComments", {
      className: "NtdComment",
      foreignKey: "ntd_post_id",
    });
    Associations.hasMany.call(NtdComment, "ntdRatings", {
      className: "NtdRating",
      foreignKey: "ntd_comment_id",
    });

    // Direct through: Author → Posts → Comments.
    Associations.hasMany.call(NtdAuthor, "ntdAllComments", {
      className: "NtdComment",
      through: "ntdPosts",
      source: "ntdComments",
    });

    // Nested through: Author → (Posts → Comments) → Ratings.
    // through:ntdAllComments is itself a has_many :through.
    Associations.hasMany.call(NtdAuthor, "ntdAllRatings", {
      className: "NtdRating",
      through: "ntdAllComments",
      source: "ntdRatings",
    });
  });

  async function seed() {
    const a = await NtdAuthor.create({ name: "a" });
    const p1 = (await NtdPost.create({ ntd_author_id: a.id, title: "p1" })) as any;
    const p2 = (await NtdPost.create({ ntd_author_id: a.id, title: "p2" })) as any;
    const c1 = (await NtdComment.create({ ntd_post_id: p1.id, body: "c1" })) as any;
    const c2 = (await NtdComment.create({ ntd_post_id: p2.id, body: "c2" })) as any;
    const c3 = (await NtdComment.create({ ntd_post_id: p2.id, body: "c3" })) as any;
    const r1 = (await NtdRating.create({ ntd_comment_id: c1.id, value: 5 })) as any;
    const r2 = (await NtdRating.create({ ntd_comment_id: c2.id, value: 7 })) as any;
    const r3 = (await NtdRating.create({ ntd_comment_id: c3.id, value: 9 })) as any;

    // Stray rating belonging to a different author's chain. Must
    // never appear in a's nested-through result.
    const other = await NtdAuthor.create({ name: "other" });
    const op = (await NtdPost.create({ ntd_author_id: other.id, title: "op" })) as any;
    const oc = (await NtdComment.create({ ntd_post_id: op.id, body: "oc" })) as any;
    await NtdRating.create({ ntd_comment_id: oc.id, value: 1 });

    return { a, p1, p2, c1, c2, c3, r1, r2, r3 };
  }

  it("loadHasMany walks a 3-level nested-through chain and filters by owner", async () => {
    const { a, r1, r2, r3 } = await seed();
    const reflection = (NtdAuthor as any)._reflectOnAssociation("ntdAllRatings");
    const ratings = await loadHasMany(a, "ntdAllRatings", reflection.options);
    expect(ratings.map((r: any) => r.id).sort()).toEqual([r1.id, r2.id, r3.id].sort());
  });

  it("includes() preloads nested-through and binds results into _preloadedAssociations", async () => {
    const { a, r1, r2, r3 } = await seed();
    const loaded = (await NtdAuthor.all().includes("ntdAllRatings").toArray()) as any[];
    const author = loaded.find((row) => row.id === a.id) as any;
    expect(author).toBeDefined();
    const preloaded = author._preloadedAssociations?.get("ntdAllRatings") as any[];
    expect(preloaded).toBeDefined();
    expect(preloaded.map((r: any) => r.id).sort()).toEqual([r1.id, r2.id, r3.id].sort());
  });

  it("includes() preloads the direct-through intermediate independently from the nested-through", async () => {
    const { a, c1, c2, c3 } = await seed();
    const loaded = (await NtdAuthor.all().includes("ntdAllComments").toArray()) as any[];
    const author = loaded.find((row) => row.id === a.id) as any;
    const preloaded = author._preloadedAssociations?.get("ntdAllComments") as any[];
    expect(preloaded.map((c: any) => c.id).sort()).toEqual([c1.id, c2.id, c3.id].sort());
  });

  it("includes() + outer-relation where preserves all preloaded nested-through targets", async () => {
    const { a, r1, r2, r3 } = await seed();
    const loaded = (await NtdAuthor.all()
      .includes("ntdAllRatings")
      .where({ id: a.id })
      .toArray()) as any[];
    const author = loaded.find((row) => row.id === a.id) as any;
    expect(author).toBeDefined();
    const preloaded = author._preloadedAssociations?.get("ntdAllRatings") as any[];
    // Filtering the outer relation must not silently drop preloaded
    // targets, introduce duplicates, or leak stray rows.
    expect(preloaded.map((r: any) => r.id).sort()).toEqual([r1.id, r2.id, r3.id].sort());
  });

  it.skip("joins() on a nested-through chain emits intermediates and accepts where on the target table", async () => {
    // BLOCKED: associations — JoinDependency nested-through chaining
    // ROOT-CAUSE: associations/join-dependency/ — inner through (ntdAllComments) not flattened; emits ntd_comments.ntd_author_id instead of walking ntd_posts
    // SCOPE: ~80–120 LOC fix in associations/join-dependency/ and/or CollectionProxy._buildThroughScope; affects nested-through JOIN-based loaders
    // Mirrors Post.joins(:special_comments_ratings).where(...) in
    // vendor/rails/activerecord/test/cases/associations/nested_through_associations_test.rb:478,488.
    // Author -> Posts -> Comments -> Ratings. JOINing `ntdAllRatings`
    // must traverse both the direct-through (ntdPosts) and the inner
    // through (ntdAllComments) so a where-clause on the final
    // ntd_ratings table resolves against the chained join, not a
    // dangling reference. JoinDependency, not the preloader, drives
    // this path; the preload-based tests above don't cover it.
    const { a } = await seed();
    const matched = await NtdAuthor.all()
      .joins("ntdAllRatings")
      .where({ "ntd_ratings.value": 7 })
      .distinct()
      .toArray();
    expect(matched.map((row: any) => row.id)).toEqual([a.id]);

    const none = await NtdAuthor.all()
      .joins("ntdAllRatings")
      .where({ "ntd_ratings.value": 999 })
      .toArray();
    expect(none).toHaveLength(0);
  });

  it("STI subclass instances flow through the nested-through chain with the correct type", async () => {
    const a = await NtdAuthor.create({ name: "sti" });
    const p = (await NtdPost.create({ ntd_author_id: a.id, title: "sp" })) as any;
    const c = (await NtdComment.create({ ntd_post_id: p.id, body: "sc" })) as any;
    const high = (await NtdHighRating.create({
      ntd_comment_id: c.id,
      value: 99,
    })) as any;
    const reflection = (NtdAuthor as any)._reflectOnAssociation("ntdAllRatings");
    const ratings = await loadHasMany(a, "ntdAllRatings", reflection.options);
    expect(ratings.length).toBe(1);
    expect(ratings[0].id).toBe(high.id);
    // STI promotion: subclass row must materialize as NtdHighRating,
    // not the base class, when the through chain finalizes.
    expect(ratings[0].constructor).toBe(NtdHighRating);

    // Same chain via the preloader path (includes) must also
    // materialize the STI subclass — a regression that bypasses STI
    // discriminator dispatch in the source-preload step would
    // otherwise slip through.
    const loaded = (await NtdAuthor.all()
      .includes("ntdAllRatings")
      .where({ id: a.id })
      .toArray()) as any[];
    const preloaded = loaded[0]._preloadedAssociations?.get("ntdAllRatings") as any[];
    expect(preloaded.length).toBe(1);
    expect(preloaded[0].constructor).toBe(NtdHighRating);
  });
});
