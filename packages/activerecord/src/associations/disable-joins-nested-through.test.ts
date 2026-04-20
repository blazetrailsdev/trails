/**
 * DJAS routing widening — nested-through (task #12, PR-B).
 *
 * A "nested through" is a `has_many :through` whose `through:`
 * association is itself a `has_many :through` (i.e.
 * `reflection.isNested()` is true). Rails handles these via the
 * generic chain walk — `reflection.chain` flattens the nested
 * structure into a straight sequence of reflection steps — and
 * `DisableJoinsAssociationScope` iterates that list in its
 * reverseChain walk with no special case.
 *
 * Our routing gate used to bail out on `reflection.isNested()`,
 * forcing nested-through + `disable_joins: true` onto the
 * JOIN-based AssociationScope path. This PR drops the gate; the
 * existing chain walk + constraints machinery already covers it.
 *
 * These tests pin the resulting SQL shape (no JOIN) and the
 * record set via Notifications so a regression that re-introduces
 * the gate, or a change to `_getChain` that silently falls back,
 * gets caught.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, registerModel } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("DJAS routing widening — nested-through", () => {
  let adapter: DatabaseAdapter;

  // Author → Post → Comment → Rating (4-level chain).
  // `noJoinsNtRatings` on the author is nested: it goes through
  // `ntComments`, which is itself a through on `ntPosts`.
  class NtAuthor extends Base {
    static {
      this._tableName = "nt_authors";
      this.attribute("name", "string");
    }
  }
  class NtPost extends Base {
    static {
      this._tableName = "nt_posts";
      this.attribute("nt_author_id", "integer");
      this.attribute("title", "string");
    }
  }
  class NtComment extends Base {
    static {
      this._tableName = "nt_comments";
      this.attribute("nt_post_id", "integer");
      this.attribute("body", "string");
    }
  }
  class NtRating extends Base {
    static {
      this._tableName = "nt_ratings";
      this.attribute("nt_comment_id", "integer");
      this.attribute("value", "integer");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    NtAuthor.adapter = adapter;
    NtPost.adapter = adapter;
    NtComment.adapter = adapter;
    NtRating.adapter = adapter;
    registerModel("NtAuthor", NtAuthor);
    registerModel("NtPost", NtPost);
    registerModel("NtComment", NtComment);
    registerModel("NtRating", NtRating);
    (NtAuthor as any)._associations = [];
    (NtPost as any)._associations = [];
    (NtComment as any)._associations = [];

    // Level 1: posts.
    Associations.hasMany.call(NtAuthor, "ntPosts", {
      className: "NtPost",
      foreignKey: "nt_author_id",
    });
    Associations.hasMany.call(NtPost, "ntComments", {
      className: "NtComment",
      foreignKey: "nt_post_id",
    });
    Associations.hasMany.call(NtComment, "ntRatings", {
      className: "NtRating",
      foreignKey: "nt_comment_id",
    });

    // Level 2 (direct through): author → posts → comments.
    Associations.hasMany.call(NtAuthor, "ntComments", {
      className: "NtComment",
      through: "ntPosts",
      source: "ntComments",
    });

    // Level 3 (nested through): author → (posts → comments) →
    // ratings. `through: ntComments` where `ntComments` is itself a
    // through — that's what makes this reflection `isNested()`.
    Associations.hasMany.call(NtAuthor, "noJoinsNtRatings", {
      className: "NtRating",
      through: "ntComments",
      source: "ntRatings",
      disableJoins: true,
    });
  });

  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("nested-through + disableJoins routes via DJAS (no JOIN, full chain walk)", async () => {
    const author = await NtAuthor.create({ name: "a" });
    const post1 = (await NtPost.create({ nt_author_id: author.id, title: "p1" })) as any;
    const post2 = (await NtPost.create({ nt_author_id: author.id, title: "p2" })) as any;
    const c1 = (await NtComment.create({ nt_post_id: post1.id, body: "c1" })) as any;
    const c2 = (await NtComment.create({ nt_post_id: post2.id, body: "c2" })) as any;
    const r1 = (await NtRating.create({ nt_comment_id: c1.id, value: 5 })) as any;
    const r2 = (await NtRating.create({ nt_comment_id: c2.id, value: 8 })) as any;
    const r3 = (await NtRating.create({ nt_comment_id: c2.id, value: 9 })) as any;

    // A stray rating on a different author's chain — must not leak
    // into the result (proves the chain walk filters by owner at the
    // first step, not just on the source table).
    const otherAuthor = await NtAuthor.create({ name: "b" });
    const otherPost = (await NtPost.create({
      nt_author_id: otherAuthor.id,
      title: "op",
    })) as any;
    const otherComment = (await NtComment.create({
      nt_post_id: otherPost.id,
      body: "oc",
    })) as any;
    await NtRating.create({ nt_comment_id: otherComment.id, value: 1 });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const reflection = (NtAuthor as any)._reflectOnAssociation("noJoinsNtRatings");
      const ratings = await loadHasMany(author, "noJoinsNtRatings", reflection.options);
      expect(ratings.map((r: any) => r.id).sort()).toEqual([r1.id, r2.id, r3.id].sort());
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBeGreaterThan(0);
    // No JOIN anywhere — the 3-step walk (posts → comments → ratings)
    // must emit three separate SELECTs rather than a multi-table
    // join that would collapse under `disable_joins: true`.
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
  });

  it("nested-through + ordered intermediate: DJAR wrap reorders final records by chain-intermediate sequence", async () => {
    // When any step in the (flattened) chain is ordered, DJAS wraps
    // the final step in a DisableJoinsAssociationRelation whose
    // loaded-chain reorder re-emits records in the intermediate's
    // pluck order. This test proves the wrap fires on a nested
    // shape, not just a direct through.
    Associations.hasMany.call(NtPost, "ntCommentsOrdered", {
      className: "NtComment",
      foreignKey: "nt_post_id",
      scope: (rel: any) => rel.order("body"),
    });
    Associations.hasMany.call(NtAuthor, "ntCommentsOrd", {
      className: "NtComment",
      through: "ntPosts",
      source: "ntCommentsOrdered",
    });
    Associations.hasMany.call(NtAuthor, "noJoinsNtRatingsOrdered", {
      className: "NtRating",
      through: "ntCommentsOrd",
      source: "ntRatings",
      disableJoins: true,
    });

    const author = await NtAuthor.create({ name: "ord" });
    const post = (await NtPost.create({ nt_author_id: author.id, title: "p" })) as any;
    // Insert comment "b" first (smaller id), "a" second (larger id).
    // The upstream .order("body") flips their pluck order to a, b,
    // so the final rating reorder should emit a-ratings before
    // b-ratings even though r_from_a has the larger comment id.
    const cb = (await NtComment.create({ nt_post_id: post.id, body: "b" })) as any;
    const ca = (await NtComment.create({ nt_post_id: post.id, body: "a" })) as any;
    await NtRating.create({ nt_comment_id: cb.id, value: 1 });
    await NtRating.create({ nt_comment_id: ca.id, value: 2 });

    const reflection = (NtAuthor as any)._reflectOnAssociation("noJoinsNtRatingsOrdered");
    const ratings = await loadHasMany(author, "noJoinsNtRatingsOrdered", reflection.options);
    // Ordered by the intermediate (comment body a-then-b): value 2
    // (from comment a) before value 1 (from comment b).
    expect(ratings.map((r: any) => r.value)).toEqual([2, 1]);
  });
});
