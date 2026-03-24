/**
 * Mirrors Rails activerecord/test/cases/associations/has_many_through_disable_joins_associations_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { association, loadHasMany } from "../associations.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("HasManyThroughDisableJoinsAssociationsTest", () => {
  let adapter: DatabaseAdapter;

  class Author extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  class Post extends Base {
    static {
      this.attribute("author_id", "integer");
      this.attribute("title", "string");
      this.attribute("body", "string");
    }
  }

  class Comment extends Base {
    static {
      this.attribute("post_id", "integer");
      this.attribute("body", "string");
      this.attribute("origin_id", "integer");
      this.attribute("origin_type", "string");
    }
  }

  class Rating extends Base {
    static {
      this.attribute("comment_id", "integer");
      this.attribute("value", "integer");
    }
  }

  class Member extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("member_type_id", "integer");
    }
  }

  class MemberType extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Author.adapter = adapter;
    Post.adapter = adapter;
    Comment.adapter = adapter;
    Rating.adapter = adapter;
    Member.adapter = adapter;
    MemberType.adapter = adapter;
    registerModel(Author);
    registerModel(Post);
    registerModel(Comment);
    registerModel(Rating);
    registerModel(Member);
    registerModel(MemberType);

    (Author as any)._associations = [
      { type: "hasMany", name: "posts", options: { className: "Post", foreignKey: "author_id" } },
      {
        type: "hasMany",
        name: "comments",
        options: { className: "Comment", through: "posts", source: "comments" },
      },
      {
        type: "hasMany",
        name: "noJoinsComments",
        options: {
          className: "Comment",
          through: "posts",
          source: "comments",
          disableJoins: true,
        },
      },
      {
        type: "hasMany",
        name: "ratings",
        options: { className: "Rating", through: "comments", source: "ratings" },
      },
      {
        type: "hasMany",
        name: "noJoinsRatings",
        options: {
          className: "Rating",
          through: "comments",
          source: "ratings",
          disableJoins: true,
        },
      },
    ];
    (Post as any)._associations = [
      {
        type: "belongsTo",
        name: "author",
        options: { className: "Author", foreignKey: "author_id" },
      },
      {
        type: "hasMany",
        name: "comments",
        options: { className: "Comment", foreignKey: "post_id" },
      },
    ];
    (Comment as any)._associations = [
      {
        type: "belongsTo",
        name: "post",
        options: { className: "Post", foreignKey: "post_id" },
      },
      {
        type: "hasMany",
        name: "ratings",
        options: { className: "Rating", foreignKey: "comment_id" },
      },
      {
        type: "belongsTo",
        name: "origin",
        options: {
          className: "Member",
          foreignKey: "origin_id",
          polymorphic: true,
        },
      },
    ];
    (Rating as any)._associations = [
      {
        type: "belongsTo",
        name: "comment",
        options: { className: "Comment", foreignKey: "comment_id" },
      },
    ];
    (Member as any)._associations = [
      {
        type: "belongsTo",
        name: "memberType",
        options: { className: "MemberType", foreignKey: "member_type_id" },
      },
    ];
    (MemberType as any)._associations = [];
  });

  // Helper to set up standard test data
  async function setupData() {
    const author = await Author.create({ name: "Mary" });
    const post = await Post.create({ author_id: author.id, title: "title", body: "body" });
    const memberType = await MemberType.create({ name: "club" });
    const member = await Member.create({ member_type_id: memberType.id });
    const comment = await Comment.create({
      post_id: post.id,
      body: "text",
      origin_id: member.id,
      origin_type: "Member",
    });
    const post2 = await Post.create({ author_id: author.id, title: "title2", body: "body2" });
    const member2 = await Member.create({ member_type_id: memberType.id });
    const comment2 = await Comment.create({
      post_id: post2.id,
      body: "text2",
      origin_id: member2.id,
      origin_type: "Member",
    });
    const rating1 = await Rating.create({ comment_id: comment.id, value: 8 });
    const rating2 = await Rating.create({ comment_id: comment.id, value: 9 });
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
    const commentsProxy = association(author, "comments");
    const noJoinsProxy = association(author, "noJoinsComments");
    const normalCount = await commentsProxy.count();
    const noJoinsCount = await noJoinsProxy.count();
    expect(noJoinsCount).toBe(normalCount);
    expect(normalCount).toBe(2);
  });

  it.skip("counting on disable joins through using custom foreign key", () => {});

  it("pluck on disable joins through", async () => {
    const { author } = await setupData();
    const normalIds = (await association(author, "comments").pluck("id")).sort();
    const noJoinsIds = (await association(author, "noJoinsComments").pluck("id")).sort();
    expect(noJoinsIds).toEqual(normalIds);
  });

  it.skip("pluck on disable joins through using custom foreign key", () => {});

  it("fetching on disable joins through", async () => {
    const { author } = await setupData();
    const normalFirst = await association(author, "comments").first();
    const noJoinsFirst = await association(author, "noJoinsComments").first();
    expect(noJoinsFirst).not.toBeNull();
    expect(noJoinsFirst!.id).toBe(normalFirst!.id);
  });

  it.skip("fetching on disable joins through using custom foreign key", () => {});

  it("to a on disable joins through", async () => {
    const { author } = await setupData();
    const normalComments = await association(author, "comments").toArray();
    const noJoinsComments = await association(author, "noJoinsComments").toArray();
    const normalIds = normalComments.map((c: any) => c.id).sort();
    const noJoinsIds = noJoinsComments.map((c: any) => c.id).sort();
    expect(noJoinsIds).toEqual(normalIds);
  });

  it("appending on disable joins through", async () => {
    const { author, post } = await setupData();
    const before = await association(author, "noJoinsComments").count();
    await Comment.create({ post_id: post.id, body: "new" });
    const after = await association(author, "noJoinsComments").count();
    expect(after).toBe(before + 1);
  });

  it.skip("appending on disable joins through using custom foreign key", () => {});

  it("empty on disable joins through", async () => {
    const emptyAuthor = await Author.create({ name: "Bob" });
    const noJoinsComments = await loadHasMany(emptyAuthor, "noJoinsComments", {
      className: "Comment",
      through: "posts",
      source: "comments",
      disableJoins: true,
    });
    expect(noJoinsComments).toEqual([]);
  });

  it.skip("empty on disable joins through using custom foreign key", () => {});

  it("pluck on disable joins through a through", async () => {
    const { author, rating1, rating2 } = await setupData();
    const normalIds = (await association(author, "ratings").pluck("id")).sort();
    const noJoinsIds = (await association(author, "noJoinsRatings").pluck("id")).sort();
    expect(noJoinsIds).toEqual(normalIds);
    expect(normalIds).toEqual([rating1.id, rating2.id].sort());
  });

  it("count on disable joins through a through", async () => {
    const { author } = await setupData();
    const normalCount = await association(author, "ratings").count();
    const noJoinsCount = await association(author, "noJoinsRatings").count();
    expect(noJoinsCount).toBe(normalCount);
    expect(normalCount).toBe(2);
  });

  it.skip("count on disable joins using relation with scope", () => {});
  it.skip("to a on disable joins with multiple scopes", () => {});
  it.skip("preloading has many through disable joins", () => {});
  it.skip("polymophic disable joins through counting", () => {});
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
