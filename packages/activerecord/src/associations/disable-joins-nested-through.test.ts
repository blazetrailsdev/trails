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
 * the gate, or a change to `getChain` that silently falls back,
 * gets caught.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base, MigrationContext, registerModel } from "../index.js";
import { Associations, loadHasMany } from "../associations.js";
import { setupFixtures } from "../test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

function migrationCtx() {
  return new MigrationContext(Base.connection);
}

describe("DJAS routing widening — nested-through", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();

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

  beforeAll(async () => {
    await migrationCtx().createTable("nt_authors", { force: true }, (t: any) => {
      t.string("name");
    });
    await migrationCtx().createTable("nt_posts", { force: true }, (t: any) => {
      t.integer("nt_author_id");
      t.string("title");
    });
    await migrationCtx().createTable("nt_comments", { force: true }, (t: any) => {
      t.integer("nt_post_id");
      t.string("body");
    });
    await migrationCtx().createTable("nt_ratings", { force: true }, (t: any) => {
      t.integer("nt_comment_id");
      t.integer("value");
    });
    registerModel("NtAuthor", NtAuthor);
    registerModel("NtPost", NtPost);
    registerModel("NtComment", NtComment);
    registerModel("NtRating", NtRating);
    (NtAuthor as any)._associations = [];
    (NtPost as any)._associations = [];
    (NtComment as any)._associations = [];

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
    Associations.hasMany.call(NtAuthor, "ntComments", {
      className: "NtComment",
      through: "ntPosts",
      source: "ntComments",
    });
    Associations.hasMany.call(NtAuthor, "noJoinsNtRatings", {
      className: "NtRating",
      through: "ntComments",
      source: "ntRatings",
      disableJoins: true,
    });
  });

  afterAll(async () => {
    await migrationCtx().dropTable("nt_ratings", "nt_comments", "nt_posts", "nt_authors", {
      ifExists: true,
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
      if (event?.payload?.name === "SCHEMA") return;
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
    expect(observed.some((s) => /\bJOIN\b/i.test(s))).toBe(false);
  });

  it("nested-through + ordered intermediate: DJAR wrap reorders final records by chain-intermediate sequence", async () => {
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
    const cb = (await NtComment.create({ nt_post_id: post.id, body: "b" })) as any;
    const ca = (await NtComment.create({ nt_post_id: post.id, body: "a" })) as any;
    await NtRating.create({ nt_comment_id: cb.id, value: 1 });
    await NtRating.create({ nt_comment_id: ca.id, value: 2 });

    const reflection = (NtAuthor as any)._reflectOnAssociation("noJoinsNtRatingsOrdered");
    const ratings = await loadHasMany(author, "noJoinsNtRatingsOrdered", reflection.options);
    expect(ratings.map((r: any) => r.value)).toEqual([2, 1]);
  });
});
