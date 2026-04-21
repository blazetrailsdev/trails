/**
 * `CollectionProxy#count` on `disable_joins: true` through-
 * associations (task #22).
 *
 * Before this PR, CP#count fell back to `loadHasMany(...).length`
 * for every disable-joins through shape — the chain walk runs
 * intermediate pluck queries either way, but the final step
 * would SELECT every target row and `.length` the array. On
 * large collections the row-wise SELECT is the expensive part.
 *
 * Now CP#count routes through DJAR's deferred walker and emits a
 * single `SELECT COUNT(*)` on the final-step relation instead.
 * The intermediate plucks are unchanged.
 *
 * Rails' `CollectionAssociation#count` on a through uses
 * `scope.count`, and for disable_joins that resolves to the
 * DJAR's loaded `records.size` — perf-equivalent because Rails'
 * DJAR materializes records to enforce the in-memory reorder.
 * We don't need to materialize for the count, so we emit COUNT.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, association, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("CollectionProxy#count — disable_joins through", () => {
  let adapter: DatabaseAdapter;

  class CdAuthor extends Base {
    static {
      this._tableName = "cd_authors";
      this.attribute("name", "string");
    }
  }
  class CdPost extends Base {
    static {
      this._tableName = "cd_posts";
      this.attribute("cd_author_id", "integer");
      this.attribute("title", "string");
    }
  }
  class CdComment extends Base {
    static {
      this._tableName = "cd_comments";
      this.attribute("cd_post_id", "integer");
      this.attribute("body", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    CdAuthor.adapter = adapter;
    CdPost.adapter = adapter;
    CdComment.adapter = adapter;
    registerModel("CdAuthor", CdAuthor);
    registerModel("CdPost", CdPost);
    registerModel("CdComment", CdComment);
    (CdAuthor as any)._associations = [];
    (CdAuthor as any)._reflections = {};
    (CdPost as any)._associations = [];
    (CdPost as any)._reflections = {};
    (CdComment as any)._associations = [];
    (CdComment as any)._reflections = {};

    Associations.hasMany.call(CdAuthor, "cdPosts", {
      className: "CdPost",
      foreignKey: "cd_author_id",
    });
    Associations.hasMany.call(CdPost, "cdComments", {
      className: "CdComment",
      foreignKey: "cd_post_id",
    });
    Associations.hasMany.call(CdAuthor, "noJoinsCdComments", {
      className: "CdComment",
      through: "cdPosts",
      source: "cdComments",
      disableJoins: true,
    });
  });

  afterEach(() => Notifications.unsubscribeAll());

  it("emits COUNT(*) on the final step — no row-wise SELECT of the target", async () => {
    const author = await CdAuthor.create({ name: "a" });
    const post = (await CdPost.create({ cd_author_id: author.id, title: "p" })) as any;
    await CdComment.create({ cd_post_id: post.id, body: "c1" });
    await CdComment.create({ cd_post_id: post.id, body: "c2" });
    await CdComment.create({ cd_post_id: post.id, body: "c3" });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string") observed.push(sql);
    });
    let n: number;
    try {
      n = await association(author, "noJoinsCdComments").count();
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(n).toBe(3);
    // Intermediate pluck step + final COUNT — exactly two SQLs.
    // No row-wise SELECT against cd_comments.
    const commentsSelects = observed.filter((s) => /\bFROM\b\s+["`]?cd_comments\b/i.test(s));
    expect(commentsSelects.length).toBe(1);
    expect(commentsSelects[0]).toMatch(/SELECT\s+COUNT\b/i);
    expect(commentsSelects[0]).not.toMatch(/SELECT\s+\*/i);
  });

  it("nested-through + disable_joins: walker chains through the nested level and still COUNTs the final step", async () => {
    // Add a Rating model and nest the chain:
    //   Author → (Posts → Comments) → Ratings
    // `noJoinsCdRatings` is nested-through with disable_joins. DJAS'
    // chain walker handles the flattened chain (PR #668), and our
    // COUNT fast path rides on top.
    class CdRating extends Base {
      static {
        this._tableName = "cd_ratings";
        this.attribute("cd_comment_id", "integer");
        this.attribute("value", "integer");
      }
    }
    CdRating.adapter = adapter;
    registerModel("CdRating", CdRating);
    (CdRating as any)._associations = [];
    (CdRating as any)._reflections = {};

    Associations.hasMany.call(CdComment, "cdRatings", {
      className: "CdRating",
      foreignKey: "cd_comment_id",
    });
    Associations.hasMany.call(CdAuthor, "noJoinsCdRatings", {
      className: "CdRating",
      through: "noJoinsCdComments",
      source: "cdRatings",
      disableJoins: true,
    });

    const author = await CdAuthor.create({ name: "a" });
    const post = (await CdPost.create({ cd_author_id: author.id, title: "p" })) as any;
    const c1 = (await CdComment.create({ cd_post_id: post.id, body: "c1" })) as any;
    const c2 = (await CdComment.create({ cd_post_id: post.id, body: "c2" })) as any;
    await CdRating.create({ cd_comment_id: c1.id, value: 5 });
    await CdRating.create({ cd_comment_id: c2.id, value: 8 });
    await CdRating.create({ cd_comment_id: c2.id, value: 9 });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      expect(await association(author, "noJoinsCdRatings").count()).toBe(3);
    } finally {
      Notifications.unsubscribe(sub);
    }
    // Final step is a single COUNT — not a row-wise SELECT.
    const ratingsSelects = observed.filter((s) => /\bFROM\b\s+["`]?cd_ratings\b/i.test(s));
    expect(ratingsSelects.length).toBe(1);
    expect(ratingsSelects[0]).toMatch(/SELECT\s+COUNT\b/i);
    // No JOIN across the chain.
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
  });

  it("unsaved owner returns 0 without firing any SQL", async () => {
    const unsaved = CdAuthor.new({ name: "unsaved" });
    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      expect(await association(unsaved, "noJoinsCdComments").count()).toBe(0);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed).toEqual([]);
  });
});
