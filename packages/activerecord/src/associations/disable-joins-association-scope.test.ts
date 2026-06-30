import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, MigrationContext, registerModel } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { DisableJoinsAssociationScope } from "./disable-joins-association-scope.js";
import { DisableJoinsAssociationRelation } from "../disable-joins-association-relation.js";
import { setupFixtures } from "../test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

function migrationCtx() {
  return new MigrationContext(Base.connection);
}

describe("DisableJoinsAssociationScope", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();

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

  beforeAll(async () => {
    await migrationCtx().createTable("djs_authors", { force: true }, (t: any) => {
      t.string("name");
    });
    await migrationCtx().createTable("djs_posts", { force: true }, (t: any) => {
      t.integer("djs_author_id");
      t.string("title");
    });
    await migrationCtx().createTable("djs_comments", { force: true }, (t: any) => {
      t.integer("djs_post_id");
      t.string("body");
    });
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

  afterAll(async () => {
    await migrationCtx().dropTable("djs_comments", "djs_posts", "djs_authors", {
      ifExists: true,
    });
  });

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
      if (event?.payload?.name === "SCHEMA") return;
      if (typeof sql === "string") observed.push(sql);
    });
    try {
      const records = await built.toArray();
      expect(records.length).toBe(1);
      expect((records[0] as any).body).toBe("c1");
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
  });

  it("chained .where() on the deferred DJAR composes into the walker result", async () => {
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

    const records = await built.toArray();
    expect(records.map((r: any) => r.body)).toEqual(["from-a", "from-b"]);
  });

  it("limit on the ordered-upstream wrap case slices AFTER reorder (no SQL LIMIT before IN-list ordering)", async () => {
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
