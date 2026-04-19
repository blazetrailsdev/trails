import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { Associations, loadHasMany } from "../associations.js";
import { DisableJoinsAssociationScope } from "./disable-joins-association-scope.js";
import { DisableJoinsAssociationRelation } from "../disable-joins-association-relation.js";

describe("DisableJoinsAssociationScope", () => {
  let adapter: DatabaseAdapter;

  class DjsAuthor extends Base {
    static {
      this._tableName = "djs_authors";
      this.attribute("name", "string");
    }
  }
  class DjsPost extends Base {
    static {
      this._tableName = "djs_posts";
      this.attribute("djs_author_id", "integer");
      this.attribute("title", "string");
    }
  }
  class DjsComment extends Base {
    static {
      this._tableName = "djs_comments";
      this.attribute("djs_post_id", "integer");
      this.attribute("body", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    DjsAuthor.adapter = adapter;
    DjsPost.adapter = adapter;
    DjsComment.adapter = adapter;
    registerModel("DjsAuthor", DjsAuthor);
    registerModel("DjsPost", DjsPost);
    registerModel("DjsComment", DjsComment);
    (DjsAuthor as any)._associations = [];
    (DjsPost as any)._associations = [];
    (DjsComment as any)._associations = [];
    Associations.hasMany.call(DjsAuthor, "djsPosts", {
      className: "DjsPost",
      foreignKey: "djs_author_id",
    });
    Associations.hasMany.call(DjsPost, "djsComments", {
      className: "DjsComment",
      foreignKey: "djs_post_id",
    });
    Associations.hasMany.call(DjsAuthor, "djsComments", {
      className: "DjsComment",
      through: "djsPosts",
      source: "djsComments",
      disableJoins: true,
    });
    Associations.hasMany.call(DjsAuthor, "djsPostsOrdered", {
      className: "DjsPost",
      foreignKey: "djs_author_id",
      scope: (rel: any) => rel.order("title"),
    });
    Associations.hasMany.call(DjsAuthor, "djsCommentsViaOrderedPosts", {
      className: "DjsComment",
      through: "djsPostsOrdered",
      source: "djsComments",
      disableJoins: true,
    });
  });

  // Backstop in case a test throws before reaching its in-test
  // unsubscribe — leaked sql.active_record subscribers can corrupt
  // sibling tests (and bloat process memory across the suite).
  afterEach(() => {
    Notifications.unsubscribeAll();
  });

  it("INSTANCE is a DisableJoinsAssociationScope", () => {
    expect(DisableJoinsAssociationScope.INSTANCE).toBeInstanceOf(DisableJoinsAssociationScope);
  });

  it("scope(association) returns a sync Relation loadable via toArray", async () => {
    const author = await DjsAuthor.create({ name: "A" });
    const post = await DjsPost.create({ djs_author_id: author.id, title: "p" });
    await DjsComment.create({ djs_post_id: post.id, body: "c1" });
    await DjsComment.create({ djs_post_id: post.id, body: "c2" });

    const reflection = (DjsAuthor as any)._reflectOnAssociation("djsComments");
    // No `await` — DJAS.scope() is sync now (matches Rails). The
    // returned DJAR is in deferred-chain mode; toArray runs the walk.
    const built = DisableJoinsAssociationScope.INSTANCE.scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    }) as DisableJoinsAssociationRelation<Base>;
    expect(built).toBeInstanceOf(DisableJoinsAssociationRelation);

    const records = await built.toArray();
    expect(records.map((r: any) => r.body).sort()).toEqual(["c1", "c2"]);
  });

  it("issues per-step queries (no multi-table JOIN actually emitted to the DB)", async () => {
    // Capture executed SQL via Notifications so we can assert the
    // WHOLE point of DJAS — no JOIN ever hits the wire — instead of
    // just verifying the records came back. (Uses the top-level
    // `Notifications` import; no need for a dynamic re-import.)
    const author = await DjsAuthor.create({ name: "A" });
    const post = await DjsPost.create({ djs_author_id: author.id, title: "p" });
    await DjsComment.create({ djs_post_id: post.id, body: "c1" });

    const reflection = (DjsAuthor as any)._reflectOnAssociation("djsComments");
    const built = DisableJoinsAssociationScope.INSTANCE.scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    }) as DisableJoinsAssociationRelation<Base>;

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const records = await built.toArray();
      expect(records.length).toBe(1);
      expect((records[0] as any).body).toBe("c1");
    } finally {
      Notifications.unsubscribe(sub);
    }
    // Per-step queries hit djs_posts and djs_comments individually;
    // a JOIN-based load would have a single query mentioning both
    // table names with a JOIN keyword. Assert no captured SQL has JOIN.
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
  });

  it("chained .where() on the deferred DJAR composes into the walker result", async () => {
    // Regression: a deferred DJAR's chained query state (wheres,
    // orders, etc.) was silently dropped because the walker built a
    // fresh relation that didn't see anything on the chained DJAR.
    // _loadThroughViaDisableJoinsScope hits this when `options.scope`
    // adds .where on top of the DJAS-returned relation.
    const author = await DjsAuthor.create({ name: "A" });
    const post = await DjsPost.create({ djs_author_id: author.id, title: "p" });
    await DjsComment.create({ djs_post_id: post.id, body: "include-me" });
    await DjsComment.create({ djs_post_id: post.id, body: "exclude-me" });

    const reflection = (DjsAuthor as any)._reflectOnAssociation("djsComments");
    const built = DisableJoinsAssociationScope.INSTANCE.scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    }) as any;
    // Chain a where() onto the deferred DJAR — this is what
    // options.scope(rel) does in production.
    const filtered = built.where({ body: "include-me" });
    const records = await filtered.toArray();
    expect(records.map((r: any) => r.body)).toEqual(["include-me"]);
  });

  it("loadHasMany routes disableJoins:true through DJAS", async () => {
    const author = await DjsAuthor.create({ name: "A" });
    const post = await DjsPost.create({ djs_author_id: author.id, title: "p" });
    await DjsComment.create({ djs_post_id: post.id, body: "hi" });

    const reflection = (DjsAuthor as any)._reflectOnAssociation("djsComments");
    const comments = await loadHasMany(author, "djsComments", reflection.options);
    expect(comments.map((c: any) => c.body)).toEqual(["hi"]);
  });

  it("wraps source step in DisableJoinsAssociationRelation when upstream chain is ordered", async () => {
    const author = await DjsAuthor.create({ name: "A" });
    const postB = await DjsPost.create({ djs_author_id: author.id, title: "b" });
    const postA = await DjsPost.create({ djs_author_id: author.id, title: "a" });
    await DjsComment.create({ djs_post_id: postB.id, body: "from-b" });
    await DjsComment.create({ djs_post_id: postA.id, body: "from-a" });

    const reflection = (DjsAuthor as any)._reflectOnAssociation("djsCommentsViaOrderedPosts");
    const built = DisableJoinsAssociationScope.INSTANCE.scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    }) as DisableJoinsAssociationRelation<Base>;

    // The deferred outer DJAR wraps a chain walk that internally
    // produces a *loaded-chain* DJAR (the source step has no order
    // but the through step does → wrap in DJAR for IN-list reorder).
    // We verify the externally observable contract: records come back
    // in upstream-ordered sequence (postA.title="a" before postB.title="b").
    const records = await built.toArray();
    expect(records.map((r: any) => r.body)).toEqual(["from-a", "from-b"]);
  });

  it("limit on the ordered-upstream wrap case slices AFTER reorder (no SQL LIMIT before IN-list ordering)", async () => {
    // Regression: the ordered-upstream wrap returns a loaded-chain
    // DJAR that, before this fix, applied SQL LIMIT during super.toArray()
    // when a chained .limit(n) was merged in via composition. That
    // sliced rows in IN-clause order (DB-arbitrary), not through-table
    // order — so .limit(1) might return the LAST through record's
    // first comment instead of the FIRST.
    const author = await DjsAuthor.create({ name: "A" });
    const postB = await DjsPost.create({ djs_author_id: author.id, title: "b" });
    const postA = await DjsPost.create({ djs_author_id: author.id, title: "a" });
    await DjsComment.create({ djs_post_id: postB.id, body: "from-b" });
    await DjsComment.create({ djs_post_id: postA.id, body: "from-a" });

    const reflection = (DjsAuthor as any)._reflectOnAssociation("djsCommentsViaOrderedPosts");
    const built = DisableJoinsAssociationScope.INSTANCE.scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    }) as DisableJoinsAssociationRelation<Base>;

    // Chain .limit(1) on the deferred outer DJAR. The first record by
    // through-table ordering (ordered by post.title) is from postA.
    const limited = built.limit(1) as Promise<Base[]> | DisableJoinsAssociationRelation<Base>;
    const records = await limited;
    expect(records.length).toBe(1);
    expect((records[0] as any).body).toBe("from-a");
  });

  it("DisableJoinsAssociationRelation is exported and reorders by ids on load", async () => {
    const post1 = await DjsPost.create({ djs_author_id: 1, title: "p1" });
    const post2 = await DjsPost.create({ djs_author_id: 1, title: "p2" });

    const djar = new DisableJoinsAssociationRelation(DjsPost, "id", [post2.id, post1.id]);
    (djar as any)._whereClause.predicates.push(
      ...(DjsPost as any).where({ id: [post1.id, post2.id] })._whereClause.predicates,
    );
    const loaded = await djar.toArray();
    expect(loaded.map((p: any) => p.title)).toEqual(["p2", "p1"]);
  });
});
