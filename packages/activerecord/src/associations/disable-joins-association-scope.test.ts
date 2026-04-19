import { describe, it, expect, beforeEach } from "vitest";
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

  it("INSTANCE is a DisableJoinsAssociationScope", () => {
    expect(DisableJoinsAssociationScope.INSTANCE).toBeInstanceOf(DisableJoinsAssociationScope);
  });

  it("scope(association) returns a boxed relation loadable via toArray", async () => {
    const author = await DjsAuthor.create({ name: "A" });
    const post = await DjsPost.create({ djs_author_id: author.id, title: "p" });
    await DjsComment.create({ djs_post_id: post.id, body: "c1" });
    await DjsComment.create({ djs_post_id: post.id, body: "c2" });

    const reflection = (DjsAuthor as any)._reflectOnAssociation("djsComments");
    const built = (await DisableJoinsAssociationScope.INSTANCE.scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    })) as { relation: { toArray: () => Promise<Base[]> } };

    const records = await built.relation.toArray();
    expect(records.map((r: any) => r.body).sort()).toEqual(["c1", "c2"]);
  });

  it("issues per-step queries (no multi-table JOIN on source query)", async () => {
    const author = await DjsAuthor.create({ name: "A" });
    const post = await DjsPost.create({ djs_author_id: author.id, title: "p" });
    await DjsComment.create({ djs_post_id: post.id, body: "c1" });

    const reflection = (DjsAuthor as any)._reflectOnAssociation("djsComments");
    const built = (await DisableJoinsAssociationScope.INSTANCE.scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    })) as { relation: { toSql: () => string } };

    const sql = built.relation.toSql();
    expect(sql).not.toMatch(/JOIN/i);
    expect(sql).toMatch(/"djs_comments"/);
    expect(sql).toMatch(/"djs_post_id"/);
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
    const built = (await DisableJoinsAssociationScope.INSTANCE.scope({
      owner: author,
      reflection,
      klass: reflection.klass,
    })) as { relation: unknown };

    expect(built.relation).toBeInstanceOf(DisableJoinsAssociationRelation);
    // Loaded comments come back in the through-ordered sequence (postA.title="a"
    // before postB.title="b"), since the wrapping relation re-groups by key.
    const records = await (built.relation as any).toArray();
    expect(records.map((r: any) => r.body)).toEqual(["from-a", "from-b"]);
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
