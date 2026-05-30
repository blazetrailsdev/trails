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
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, association, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { createTestAdapter, type TestDatabaseAdapter } from "../test-adapter.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { withTransactionalFixtures } from "../test-helpers/with-transactional-fixtures.js";

describe("CollectionProxy#count — non-through fast path", () => {
  let adapter: TestDatabaseAdapter;

  class CpcAuthor extends Base {
    static {
      this._tableName = "cpc_authors";
      this.attribute("name", "string");
      this.attribute("cpcPostsCounted_count", "integer");
    }
  }
  class CpcPost extends Base {
    static {
      this._tableName = "cpc_posts";
      this.attribute("cpc_author_id", "integer");
      this.attribute("title", "string");
    }
  }

  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, {
      cpc_authors: { name: "string", cpcPostsCounted_count: "integer" },
      cpc_posts: { cpc_author_id: "integer", title: "string" },
      cpc_comments: { cpc_post_id: "integer", body: "string" },
    });
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
  withTransactionalFixtures(() => adapter);

  afterEach(() => Notifications.unsubscribeAll());

  it("issues a SELECT COUNT(*) and does not load individual rows", async () => {
    const author = await CpcAuthor.create({ name: "a" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p1" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p2" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p3" });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      // Ignore adapter-internal SCHEMA introspection (e.g. PG type-map loads
      // that LEFT JOIN pg_range) — matches Rails' SQLCounter, which never
      // counts SCHEMA queries; not a CollectionProxy query.
      if (event?.payload?.name === "SCHEMA") return;
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

  it("size() on a new-record owner returns the buffered target without querying", async () => {
    // Mirrors Association#find_target? false for an unsaved owner: size never
    // hits the DB, it just counts the build-ed records.
    const author = CpcAuthor.new({ name: "unsaved" });
    const proxy = association(author, "cpcPosts") as any;
    proxy.build({ title: "b1" });
    proxy.build({ title: "b2" });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof event?.payload?.sql === "string") observed.push(event.payload.sql);
    });
    try {
      expect(await proxy.size()).toBe(2);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBe(0);
  });

  it("size() returns the cached @association_ids length without querying", async () => {
    // Mirrors CollectionAssociation#size's `@association_ids` branch: once a
    // prior ids reader (`record.<assoc>Ids` → idsReader) has cached the ids on
    // the owner's association instance, size() returns their count, no SQL.
    const author = await CpcAuthor.create({ name: "ids" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p1" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p2" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p3" });

    // Populate the cache via the real ids reader.
    const ids = await (author as any).association("cpcPosts").idsReader();
    expect(ids.length).toBe(3);

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof event?.payload?.sql === "string") observed.push(event.payload.sql);
    });
    try {
      expect(await association(author, "cpcPosts").size()).toBe(3);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBe(0);
  });

  it("size() with a GROUP BY loads the target and counts the group rows", async () => {
    // Mirrors a grouped association scope (Rails' `clients_grouped_by_name`,
    // defined `-> { group("name").select("name") }`): size() takes the
    // `!group_values.empty?` branch — load + count rows, not a scalar
    // COUNT(*). The `.select("title")` pairs with the GROUP BY so the loaded
    // SELECT is valid SQL (PostgreSQL rejects `SELECT *` under GROUP BY).
    Associations.hasMany.call(CpcAuthor, "cpcPostsByTitle", {
      className: "CpcPost",
      foreignKey: "cpc_author_id",
      scope: (rel: any) => rel.group("title").select("title"),
    });
    const author = await CpcAuthor.create({ name: "g" });
    await CpcPost.create({ cpc_author_id: author.id, title: "X" });
    await CpcPost.create({ cpc_author_id: author.id, title: "X" });
    await CpcPost.create({ cpc_author_id: author.id, title: "Y" });

    const grouped = association(author, "cpcPostsByTitle") as any;
    expect(grouped.groupValues).toEqual(["title"]);
    // Two distinct titles → two group rows, not the scalar COUNT(*) of 3.
    expect(await grouped.size()).toBe(2);
  });

  it("size() with DISTINCT ignores the unsaved-records shortcut and counts via SQL", async () => {
    Associations.hasMany.call(CpcAuthor, "cpcPostsDistinct", {
      className: "CpcPost",
      foreignKey: "cpc_author_id",
      scope: (rel: any) => rel.distinct(),
    });
    const author = await CpcAuthor.create({ name: "d" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p1" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p2" });

    const distinct = association(author, "cpcPostsDistinct") as any;
    expect(distinct.distinctValue).toBe(true);
    distinct.build({ title: "buffered" });
    // distinct_value present → skip the `unsaved + count` branch, count via SQL.
    expect(await distinct.size()).toBe(2);
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
      // Ignore adapter-internal SCHEMA introspection (e.g. PG type-map loads
      // that LEFT JOIN pg_range) — matches Rails' SQLCounter, which never
      // counts SCHEMA queries; not a CollectionProxy query.
      if (event?.payload?.name === "SCHEMA") return;
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

  it("_addToTarget dedups a re-fetched record by AR id under a distinct scope", async () => {
    // Mirrors Ruby `@target.index(record)` inside replace_on_target: equality is
    // ActiveRecord::Core#== (class + present primary key), not object identity.
    // A re-fetched instance (same id, different object) must dedup in place
    // rather than appending a duplicate to the loaded target.
    Associations.hasMany.call(CpcAuthor, "cpcPostsDedup", {
      className: "CpcPost",
      foreignKey: "cpc_author_id",
      scope: (rel: any) => rel.distinct(),
    });
    const author = await CpcAuthor.create({ name: "dedup" });
    const post = await CpcPost.create({ cpc_author_id: author.id, title: "p1" });

    const proxy = association(author, "cpcPostsDedup") as any;
    await proxy.load();
    expect(proxy.target.length).toBe(1);

    const reloaded = await CpcPost.find(post.id);
    expect(reloaded).not.toBe(post);
    await proxy.push(reloaded);

    // With JS `===` the re-fetched instance would not match and the target would
    // grow to 2; AR-id equality keeps it at 1.
    expect(proxy.target.length).toBe(1);
  });

  it("foreignKeyPresent on the proxy agrees with the OO association (owner PK present)", async () => {
    // ForeignAssociation#foreign_key_present? — a new-record owner whose primary
    // key is already assigned is fetchable; the proxy and the OO association must
    // not disagree.
    const newWithPk = CpcAuthor.new({ name: "withpk" });
    (newWithPk as any)._writeAttribute("id", 999);
    const newWithoutPk = CpcAuthor.new({ name: "nopk" });

    const withPkProxy = association(newWithPk, "cpcPosts") as any;
    const withoutPkProxy = association(newWithoutPk, "cpcPosts") as any;
    expect(withPkProxy._foreignKeyPresent()).toBe(true);
    expect(withoutPkProxy._foreignKeyPresent()).toBe(false);
  });

  it("count_records reads the active counter cache instead of querying", async () => {
    // Mirrors HasManyAssociation#count_records: when the reflection has an
    // active cached counter, size() reads owner.read_attribute(counter_cache_column)
    // rather than emitting a COUNT(*). `counterCache: true` derives the column
    // name from the association (`<name>_count`).
    Associations.hasMany.call(CpcAuthor, "cpcPostsCounted", {
      className: "CpcPost",
      foreignKey: "cpc_author_id",
      counterCache: true,
    });
    const author = await CpcAuthor.create({ name: "counted", cpcPostsCounted_count: 7 });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof event?.payload?.sql === "string") observed.push(event.payload.sql);
    });
    try {
      expect(await association(author, "cpcPostsCounted").size()).toBe(7);
    } finally {
      Notifications.unsubscribe(sub);
    }
    // The cache short-circuit means no COUNT(*) is issued.
    expect(observed.some((s) => /SELECT\s+COUNT\b/i.test(s))).toBe(false);
  });

  it("count_records clamps the result to the association scope's limit_value", async () => {
    // Mirrors `[association_scope.limit_value, count].compact.min`: a scoped
    // limit caps the reported size even when the DB holds more rows.
    Associations.hasMany.call(CpcAuthor, "cpcPostsLimited", {
      className: "CpcPost",
      foreignKey: "cpc_author_id",
      scope: (rel: any) => rel.limit(2),
    });
    const author = await CpcAuthor.create({ name: "limited" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p1" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p2" });
    await CpcPost.create({ cpc_author_id: author.id, title: "p3" });

    expect(await association(author, "cpcPostsLimited").size()).toBe(2);
  });

  it("count_records marks the target loaded and purges non-new records when the DB is empty", async () => {
    // Documented side-effect: when count == 0, @target retains only new records
    // and the association is flagged loaded, avoiding an extra SELECT.
    const author = await CpcAuthor.create({ name: "empty" });
    const proxy = association(author, "cpcPosts") as any;

    expect(await proxy.size()).toBe(0);
    expect(proxy.loaded).toBe(true);
    expect(proxy.target.length).toBe(0);
  });
});
