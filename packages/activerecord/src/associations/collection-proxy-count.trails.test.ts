import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, association, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { fixtures } from "../test-fixtures.js";

describe("CollectionProxy#count — non-through fast path", () => {
  fixtures({});

  class CpcAuthor extends Base {
    static {
      this._tableName = "authors";
      this.attribute("name", "string");
    }
  }
  class CpcPost extends Base {
    static {
      this._tableName = "posts";
      this.attribute("author_id", "integer");
      this.attribute("title", "string");
      this.attribute("body", "text");
      this.attribute("legacy_comments_count", "integer");
    }
  }
  class CpcComment extends Base {
    static {
      this._tableName = "comments";
      this.attribute("post_id", "integer");
      this.attribute("body", "text");
    }
  }

  beforeAll(() => {
    registerModel("CpcAuthor", CpcAuthor);
    registerModel("CpcPost", CpcPost);
    registerModel("CpcComment", CpcComment);
    (CpcAuthor as any)._reflections = {};
    (CpcPost as any)._reflections = {};
    (CpcComment as any)._reflections = {};
    Associations.hasMany.call(CpcAuthor, "cpcPosts", {
      className: "CpcPost",
      foreignKey: "author_id",
    });
  });
  afterEach(() => Notifications.unsubscribeAll());

  it("issues a SELECT COUNT(*) and does not load individual rows", async () => {
    const author = await CpcAuthor.create({ name: "a" });
    await CpcPost.create({ author_id: author.id, title: "p1", body: "b1" });
    await CpcPost.create({ author_id: author.id, title: "p2", body: "b2" });
    await CpcPost.create({ author_id: author.id, title: "p3", body: "b3" });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof sql === "string") observed.push(sql);
    });
    let n: number;
    try {
      n = (await association(author, "cpcPosts").count()) as number;
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(n).toBe(3);
    expect(observed.length).toBe(1);
    expect(observed[0]).toMatch(/SELECT\s+COUNT\b/i);
  });

  it("size() on a new-record owner returns the buffered target without querying", async () => {
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
    const author = await CpcAuthor.create({ name: "ids" });
    await CpcPost.create({ author_id: author.id, title: "p1", body: "b1" });
    await CpcPost.create({ author_id: author.id, title: "p2", body: "b2" });
    await CpcPost.create({ author_id: author.id, title: "p3", body: "b3" });

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
    Associations.hasMany.call(
      CpcAuthor,
      "cpcPostsByTitle",
      (rel: any) => rel.group("title").select("title"),
      {
        className: "CpcPost",
        foreignKey: "author_id",
      },
    );
    const author = await CpcAuthor.create({ name: "g" });
    await CpcPost.create({ author_id: author.id, title: "X", body: "b1" });
    await CpcPost.create({ author_id: author.id, title: "X", body: "b2" });
    await CpcPost.create({ author_id: author.id, title: "Y", body: "b3" });

    const grouped = association(author, "cpcPostsByTitle") as any;
    expect(grouped.groupValues).toEqual(["title"]);
    expect(await grouped.size()).toBe(2);
  });

  it("size() with DISTINCT ignores the unsaved-records shortcut and counts via SQL", async () => {
    Associations.hasMany.call(CpcAuthor, "cpcPostsDistinct", (rel: any) => rel.distinct(), {
      className: "CpcPost",
      foreignKey: "author_id",
    });
    const author = await CpcAuthor.create({ name: "d" });
    await CpcPost.create({ author_id: author.id, title: "p1", body: "b1" });
    await CpcPost.create({ author_id: author.id, title: "p2", body: "b2" });

    const distinct = association(author, "cpcPostsDistinct") as any;
    expect(distinct.distinctValue).toBe(true);
    distinct.build({ title: "buffered" });
    expect(await distinct.size()).toBe(2);
  });

  it("single-level through: count() emits a SELECT COUNT(*) (IN-subquery or JOIN form)", async () => {
    Associations.hasMany.call(CpcPost, "cpcComments", {
      className: "CpcComment",
      foreignKey: "post_id",
    });
    Associations.hasMany.call(CpcAuthor, "cpcCommentsThrough", {
      className: "CpcComment",
      through: "cpcPosts",
      source: "cpcComments",
    });

    const author = await CpcAuthor.create({ name: "a" });
    const post = (await CpcPost.create({ author_id: author.id, title: "p", body: "b" })) as any;
    await CpcComment.create({ post_id: post.id, body: "c1" });
    await CpcComment.create({ post_id: post.id, body: "c2" });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      const sql = event?.payload?.sql;
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const n = await association(author, "cpcCommentsThrough").count();
      expect(n).toBe(2);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBe(1);
    expect(observed[0]).toMatch(/SELECT\s+COUNT\b/i);
    expect(observed[0]).not.toMatch(/SELECT\s+\*/i);
  });

  it("_addToTarget dedups a re-fetched record by AR id under a distinct scope", async () => {
    Associations.hasMany.call(CpcAuthor, "cpcPostsDedup", (rel: any) => rel.distinct(), {
      className: "CpcPost",
      foreignKey: "author_id",
    });
    const author = await CpcAuthor.create({ name: "dedup" });
    const post = await CpcPost.create({ author_id: author.id, title: "p1", body: "b1" });

    const proxy = association(author, "cpcPostsDedup") as any;
    await proxy.load();
    expect(proxy.target.length).toBe(1);

    const reloaded = await CpcPost.find(post.id);
    expect(reloaded).not.toBe(post);
    await proxy.push(reloaded);

    expect(proxy.target.length).toBe(1);
  });

  it("foreignKeyPresent on the proxy agrees with the OO association (owner PK present)", async () => {
    const newWithPk = CpcAuthor.new({ name: "withpk" });
    (newWithPk as any)._writeAttribute("id", 999);
    const newWithoutPk = CpcAuthor.new({ name: "nopk" });

    const withPkProxy = association(newWithPk, "cpcPosts") as any;
    const withoutPkProxy = association(newWithoutPk, "cpcPosts") as any;
    expect(withPkProxy.isNullScope()).toBe(false);
    expect(withoutPkProxy.isNullScope()).toBe(true);
  });

  it("count_records reads the active counter cache instead of querying", async () => {
    Associations.hasMany.call(CpcPost, "cpcCommentsCounted", {
      className: "CpcComment",
      foreignKey: "post_id",
      counterCache: "legacy_comments_count",
    });
    const post = await CpcPost.create({ title: "counted", body: "b", legacy_comments_count: 7 });

    const observed: string[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof event?.payload?.sql === "string") observed.push(event.payload.sql);
    });
    try {
      expect(await association(post, "cpcCommentsCounted").size()).toBe(7);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.some((s) => /SELECT\s+COUNT\b/i.test(s))).toBe(false);
  });

  it("count_records clamps the result to the association scope's limit_value", async () => {
    Associations.hasMany.call(CpcAuthor, "cpcPostsLimited", (rel: any) => rel.limit(2), {
      className: "CpcPost",
      foreignKey: "author_id",
    });
    const author = await CpcAuthor.create({ name: "limited" });
    await CpcPost.create({ author_id: author.id, title: "p1", body: "b1" });
    await CpcPost.create({ author_id: author.id, title: "p2", body: "b2" });
    await CpcPost.create({ author_id: author.id, title: "p3", body: "b3" });

    expect(await association(author, "cpcPostsLimited").size()).toBe(2);
  });

  it("count_records marks the target loaded and purges non-new records when the DB is empty", async () => {
    const author = await CpcAuthor.create({ name: "empty" });
    const proxy = association(author, "cpcPosts") as any;

    expect(await proxy.size()).toBe(0);
    expect(proxy.loaded).toBe(true);
    expect(proxy.target.length).toBe(0);
  });
});
