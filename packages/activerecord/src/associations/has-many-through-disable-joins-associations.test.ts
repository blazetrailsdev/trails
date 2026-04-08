/**
 * Mirrors Rails activerecord/test/cases/associations/has_many_through_disable_joins_associations_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { Associations, association, loadHasMany } from "../associations.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("HasManyThroughDisableJoinsAssociationsTest", () => {
  let adapter: DatabaseAdapter;

  class DjAuthor extends Base {
    static {
      this._tableName = "dj_authors";
      this.attribute("name", "string");
    }
  }

  class DjPost extends Base {
    static {
      this._tableName = "dj_posts";
      this.attribute("dj_author_id", "integer");
      this.attribute("title", "string");
      this.attribute("body", "string");
    }
  }

  class DjComment extends Base {
    static {
      this._tableName = "dj_comments";
      this.attribute("dj_post_id", "integer");
      this.attribute("body", "string");
      this.attribute("origin_id", "integer");
      this.attribute("origin_type", "string");
    }
  }

  class DjRating extends Base {
    static {
      this._tableName = "dj_ratings";
      this.attribute("dj_comment_id", "integer");
      this.attribute("value", "integer");
    }
  }

  class DjMember extends Base {
    static {
      this._tableName = "dj_members";
      this.attribute("name", "string");
      this.attribute("dj_member_type_id", "integer");
    }
  }

  class DjMemberType extends Base {
    static {
      this._tableName = "dj_member_types";
      this.attribute("name", "string");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    DjAuthor.adapter = adapter;
    DjPost.adapter = adapter;
    DjComment.adapter = adapter;
    DjRating.adapter = adapter;
    DjMember.adapter = adapter;
    DjMemberType.adapter = adapter;
    registerModel("DjAuthor", DjAuthor);
    registerModel("DjPost", DjPost);
    registerModel("DjComment", DjComment);
    registerModel("DjRating", DjRating);
    registerModel("DjMember", DjMember);
    registerModel("DjMemberType", DjMemberType);

    (DjAuthor as any)._associations = [];
    (DjPost as any)._associations = [];
    (DjComment as any)._associations = [];
    (DjRating as any)._associations = [];
    (DjMember as any)._associations = [];
    (DjMemberType as any)._associations = [];
    Associations.hasMany.call(DjAuthor, "djPosts", {
      className: "DjPost",
      foreignKey: "dj_author_id",
    });

    Associations.hasMany.call(DjAuthor, "djComments", {
      className: "DjComment",
      through: "djPosts",
      source: "djComments",
    });

    Associations.hasMany.call(DjAuthor, "noJoinsDjComments", {
      className: "DjComment",
      through: "djPosts",
      source: "djComments",
      disableJoins: true,
    });

    Associations.hasMany.call(DjAuthor, "djRatings", {
      className: "DjRating",
      through: "djComments",
      source: "djRatings",
    });

    Associations.hasMany.call(DjAuthor, "noJoinsDjRatings", {
      className: "DjRating",
      through: "djComments",
      source: "djRatings",
      disableJoins: true,
    });

    Associations.hasMany.call(DjAuthor, "djMembers", {
      className: "DjMember",
      through: "djComments",
      source: "origin",
      sourceType: "DjMember",
    });

    Associations.hasMany.call(DjAuthor, "noJoinsDjMembers", {
      className: "DjMember",
      through: "djComments",
      source: "origin",
      sourceType: "DjMember",
      disableJoins: true,
    });
    Associations.belongsTo.call(DjPost, "djAuthor", {
      className: "DjAuthor",
      foreignKey: "dj_author_id",
    });

    Associations.hasMany.call(DjPost, "djComments", {
      className: "DjComment",
      foreignKey: "dj_post_id",
    });
    Associations.belongsTo.call(DjComment, "djPost", {
      className: "DjPost",
      foreignKey: "dj_post_id",
    });

    Associations.hasMany.call(DjComment, "djRatings", {
      className: "DjRating",
      foreignKey: "dj_comment_id",
    });

    Associations.belongsTo.call(DjComment, "origin", {
      className: "DjMember",
      foreignKey: "origin_id",
      polymorphic: true,
    });
    Associations.belongsTo.call(DjRating, "djComment", {
      className: "DjComment",
      foreignKey: "dj_comment_id",
    });
    Associations.belongsTo.call(DjMember, "djMemberType", {
      className: "DjMemberType",
      foreignKey: "dj_member_type_id",
    });
  });

  async function setupData() {
    const author = await DjAuthor.create({ name: "Mary" });
    const post = await DjPost.create({ dj_author_id: author.id, title: "title", body: "body" });
    const memberType = await DjMemberType.create({ name: "club" });
    const member = await DjMember.create({ dj_member_type_id: memberType.id });
    const comment = await DjComment.create({
      dj_post_id: post.id,
      body: "text",
      origin_id: member.id,
      origin_type: "DjMember",
    });
    const post2 = await DjPost.create({ dj_author_id: author.id, title: "title2", body: "body2" });
    const member2 = await DjMember.create({ dj_member_type_id: memberType.id });
    const comment2 = await DjComment.create({
      dj_post_id: post2.id,
      body: "text2",
      origin_id: member2.id,
      origin_type: "DjMember",
    });
    const rating1 = await DjRating.create({ dj_comment_id: comment.id, value: 8 });
    const rating2 = await DjRating.create({ dj_comment_id: comment.id, value: 9 });
    return {
      author,
      post,
      post2,
      comment,
      comment2,
      member,
      member2,
      memberType,
      rating1,
      rating2,
    };
  }

  it("counting on disable joins through", async () => {
    const { author } = await setupData();
    const normalCount = await association(author, "djComments").count();
    const noJoinsCount = await association(author, "noJoinsDjComments").count();
    expect(noJoinsCount).toBe(normalCount);
    expect(normalCount).toBe(2);
  });

  it.skip("counting on disable joins through using custom foreign key", () => {});

  it("pluck on disable joins through", async () => {
    const { author } = await setupData();
    const normalIds = (await association(author, "djComments").pluck("id")).sort(
      (a: any, b: any) => a - b,
    );
    const noJoinsIds = (await association(author, "noJoinsDjComments").pluck("id")).sort(
      (a: any, b: any) => a - b,
    );
    expect(noJoinsIds).toEqual(normalIds);
  });

  it.skip("pluck on disable joins through using custom foreign key", () => {});

  it("fetching on disable joins through", async () => {
    const { author } = await setupData();
    const normalFirst = await association(author, "djComments").first();
    const noJoinsFirst = await association(author, "noJoinsDjComments").first();
    expect(noJoinsFirst).not.toBeNull();
    expect(noJoinsFirst!.id).toBe(normalFirst!.id);
  });

  it.skip("fetching on disable joins through using custom foreign key", () => {});

  it("to a on disable joins through", async () => {
    const { author } = await setupData();
    const normalComments = await association(author, "djComments").toArray();
    const noJoinsComments = await association(author, "noJoinsDjComments").toArray();
    const normalIds = normalComments.map((c: any) => c.id).sort((a: any, b: any) => a - b);
    const noJoinsIds = noJoinsComments.map((c: any) => c.id).sort((a: any, b: any) => a - b);
    expect(noJoinsIds).toEqual(normalIds);
  });

  it("appending on disable joins through", async () => {
    const { author, post } = await setupData();
    const before = await association(author, "noJoinsDjComments").count();
    await DjComment.create({ dj_post_id: post.id, body: "new" });
    const after = await association(author, "noJoinsDjComments").count();
    expect(after).toBe(before + 1);
  });

  it.skip("appending on disable joins through using custom foreign key", () => {});

  it("empty on disable joins through", async () => {
    const emptyAuthor = await DjAuthor.create({ name: "Bob" });
    const noJoinsComments = await loadHasMany(emptyAuthor, "noJoinsDjComments", {
      className: "DjComment",
      through: "djPosts",
      source: "djComments",
      disableJoins: true,
    });
    expect(noJoinsComments).toEqual([]);
  });

  it.skip("empty on disable joins through using custom foreign key", () => {});

  it("pluck on disable joins through a through", async () => {
    const { author, rating1, rating2 } = await setupData();
    const normalIds = (await association(author, "djRatings").pluck("id")).sort(
      (a: any, b: any) => a - b,
    );
    const noJoinsIds = (await association(author, "noJoinsDjRatings").pluck("id")).sort(
      (a: any, b: any) => a - b,
    );
    expect(noJoinsIds).toEqual(normalIds);
    expect(normalIds).toEqual([rating1.id, rating2.id].sort((a: any, b: any) => a - b));
  });

  it("count on disable joins through a through", async () => {
    const { author } = await setupData();
    const normalCount = await association(author, "djRatings").count();
    const noJoinsCount = await association(author, "noJoinsDjRatings").count();
    expect(noJoinsCount).toBe(normalCount);
    expect(normalCount).toBe(2);
  });

  it.skip("count on disable joins using relation with scope", () => {});
  it.skip("to a on disable joins with multiple scopes", () => {});
  it.skip("preloading has many through disable joins", () => {});

  it("polymophic disable joins through counting", async () => {
    const { author } = await setupData();
    const normalCount = await association(author, "djMembers").count();
    const noJoinsCount = await association(author, "noJoinsDjMembers").count();
    expect(noJoinsCount).toBe(normalCount);
    expect(normalCount).toBe(2);
  });

  it.skip("polymophic disable joins through ordering", () => {});
  it.skip("polymorphic disable joins through reordering", () => {});
  it.skip("polymorphic disable joins through ordered scopes", () => {});
  it.skip("polymorphic disable joins through ordered chained scopes", () => {});
  it.skip("polymorphic disable joins through ordered scope limits", () => {});
  it.skip("polymorphic disable joins through ordered scope first", () => {});
  it.skip("order applied in double join", () => {});
  it.skip("first and scope applied in double join", () => {});
  it.skip("first and scope in double join applies order in memory", () => {});
  it.skip("limit and scope applied in double join", () => {});
  it.skip("limit and scope in double join applies limit in memory", () => {});
});
