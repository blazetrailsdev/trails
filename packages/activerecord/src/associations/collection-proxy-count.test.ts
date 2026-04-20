/**
 * CollectionProxy#count emits a real COUNT query (task #16).
 *
 * Previously the non-diverged branch of CP#count called
 * `loadHasMany(...)` and returned `results.length`, instantiating
 * every associated record just to get a cardinality. For large
 * collections that's a significant perf regression. This test
 * captures emitted SQL via `Notifications.subscribe("sql.active_record")`
 * and pins the contract: on the common non-through path,
 * `proxy.count()` issues a single `SELECT COUNT(*) ...` and does
 * not load individual rows.
 *
 * Mirrors: ActiveRecord::Associations::CollectionAssociation#count
 * (associations/collection_association.rb) — loaded target returns
 * `.length`, otherwise delegates to `scope.count(...)`.
 *
 * Simple (single-level) through-associations also take the fast
 * path. Nested-through and `disable_joins: true` through shapes
 * fall back to load-and-length — tracked in task #22.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, association, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("CollectionProxy#count — non-through fast path", () => {
  let adapter: DatabaseAdapter;

  class CpcAuthor extends Base {
    static {
      this._tableName = "cpc_authors";
      this.attribute("name", "string");
    }
  }
  class CpcPost extends Base {
    static {
      this._tableName = "cpc_posts";
      this.attribute("cpc_author_id", "integer");
      this.attribute("title", "string");
    }
  }

  beforeEach(() => {
    adapter = createTestAdapter();
    CpcAuthor.adapter = adapter;
    CpcPost.adapter = adapter;
    registerModel("CpcAuthor", CpcAuthor);
    registerModel("CpcPost", CpcPost);
    (CpcAuthor as any)._associations = [];
    (CpcPost as any)._associations = [];
    Associations.hasMany.call(CpcAuthor, "cpcPosts", {
      className: "CpcPost",
      foreignKey: "cpc_author_id",
    });
  });

  afterEach(() => Notifications.unsubscribeAll());

  it("issues a SELECT COUNT(*) and does not load individual rows", async () => {
    const author = await CpcAuthor.create({ name: "a" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p1" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p2" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p3" });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string") observed.push(sql);
    });
    let n: number;
    try {
      n = await association(author, "cpcPosts").count();
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(n).toBe(3);
    // Exactly one SQL emitted, and it's a COUNT — not a SELECT of
    // the row data the loader would have issued. Regression guard:
    // reverting to the load-and-length path would show `SELECT *`
    // or a row-wise column list and no COUNT.
    expect(observed.length).toBe(1);
    expect(observed[0]).toMatch(/SELECT\s+COUNT\b/i);
  });

  it("single-level through: count() emits a SELECT COUNT(*) (IN-subquery or JOIN form)", async () => {
    class CpcComment extends Base {
      static {
        this._tableName = "cpc_comments";
        this.attribute("cpc_post_id", "integer");
        this.attribute("body", "string");
      }
    }
    CpcComment.adapter = adapter;
    registerModel("CpcComment", CpcComment);
    (CpcComment as any)._associations = [];
    Associations.hasMany.call(CpcPost, "cpcComments", {
      className: "CpcComment",
      foreignKey: "cpc_post_id",
    });
    Associations.hasMany.call(CpcAuthor, "cpcCommentsThrough", {
      className: "CpcComment",
      through: "cpcPosts",
      source: "cpcComments",
    });

    const author = await CpcAuthor.create({ name: "a" });
    const post = (await CpcPost.create({ cpc_author_id: author.id, title: "p" })) as any;
    await CpcComment.create({ cpc_post_id: post.id, body: "c1" });
    await CpcComment.create({ cpc_post_id: post.id, body: "c2" });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const n = await association(author, "cpcCommentsThrough").count();
      expect(n).toBe(2);
    } finally {
      Notifications.unsubscribe(sub);
    }
    // Exactly one SQL, a COUNT — not a row-wise SELECT the loader
    // path would emit. Shape is `COUNT ... IN (subquery)` via our
    // `_buildThroughScope`; other valid forms (explicit JOIN) would
    // also be fine, so we only assert COUNT and no row-wise select.
    expect(observed.length).toBe(1);
    expect(observed[0]).toMatch(/SELECT\s+COUNT\b/i);
    expect(observed[0]).not.toMatch(/SELECT\s+\*/i);
  });
});
