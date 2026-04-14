import { describe, it, expectTypeOf, assertType } from "vitest";
import { Base, CollectionProxy } from "@blazetrails/activerecord";

// Scenario: blog-style domain — Authors write Posts, Posts have Comments,
// Authors have a Profile. This is the Rails guides' canonical example.

class Author extends Base {
  declare name: string;

  static {
    this.attribute("name", "string");
    this.hasMany("posts");
    this.hasOne("profile");
  }
}

class Post extends Base {
  declare title: string;
  declare author_id: number;
  declare published: boolean;

  static {
    this.attribute("title", "string");
    this.attribute("author_id", "integer");
    this.attribute("published", "boolean", { default: false });
    this.belongsTo("author");
    this.hasMany("comments", { dependent: "destroy" });
  }
}

class Comment extends Base {
  declare body: string;
  declare post_id: number;

  static {
    this.attribute("body", "string");
    this.attribute("post_id", "integer");
    this.belongsTo("post");
  }
}

class Profile extends Base {
  declare bio: string;
  declare author_id: number;

  static {
    this.attribute("bio", "string");
    this.attribute("author_id", "integer");
    this.belongsTo("author");
  }
}

describe("associations DX", () => {
  it("belongsTo / hasMany / hasOne are statically typed on typeof Base", () => {
    expectTypeOf(Base.belongsTo).toBeFunction();
    expectTypeOf(Base.hasOne).toBeFunction();
    expectTypeOf(Base.hasMany).toBeFunction();
    expectTypeOf(Base.hasAndBelongsToMany).toBeFunction();
    expectTypeOf<ReturnType<typeof Base.belongsTo>>().toEqualTypeOf<void>();
  });

  it("model classes that declare associations remain their own type", () => {
    const post = new Post({ title: "hi", author_id: 1, published: true });
    expectTypeOf(post).toEqualTypeOf<Post>();
    const author = new Author({ name: "dean" });
    expectTypeOf(author).toEqualTypeOf<Author>();
    const profile = new Profile({ author_id: 1, bio: "hi" });
    expectTypeOf(profile).toEqualTypeOf<Profile>();
    const comment = new Comment({ post_id: 1, body: "nice" });
    expectTypeOf(comment).toEqualTypeOf<Comment>();
  });

  it("association options bag accepts common Rails keys", () => {
    class Tagged extends Base {
      static {
        this.belongsTo("author", { className: "Author", foreignKey: "author_id" });
        this.belongsTo("post", { optional: true });
        this.hasMany("comments", { dependent: "destroy", inverseOf: "tagged" });
        this.hasOne("profile", { through: "author" });
      }
    }
    assertType(Tagged);
  });

  it("CollectionProxy is exported (currently non-generic — known gap)", () => {
    assertType<typeof CollectionProxy>(CollectionProxy);
  });

  it("KNOWN GAP: association accessors return `unknown` via Model's index signature", () => {
    // `Model` declares `[key: string]: unknown`, so `post.author` type-checks
    // but resolves to `unknown` — no autocomplete, no narrowing. The ideal DX
    // is `post.author: Promise<Author | null>` and `author.posts: CollectionProxy<Post>`.
    const post = new Post({ title: "hi", author_id: 1, published: true });
    expectTypeOf(post.author).toBeUnknown();
    const author = new Author({ name: "dean" });
    expectTypeOf(author.posts).toBeUnknown();
  });
});
