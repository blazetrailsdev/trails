import { describe, it, expectTypeOf, assertType } from "vitest";
import { Base, CollectionProxy } from "@blazetrails/activerecord";

// Structural shape of the (currently-runtime-only) association API. Keeping
// it here makes the casts below readable and the assertions meaningful.
interface AssocHost {
  belongsTo(name: string, options?: Record<string, unknown>): void;
  hasOne(name: string, options?: Record<string, unknown>): void;
  hasMany(name: string, options?: Record<string, unknown>): void;
}

// Scenario: blog-style domain — Authors write Posts, Posts have Comments,
// Authors have a Profile. This is the Rails guides' canonical example.

class Author extends Base {
  declare name: string;

  static {
    this.attribute("name", "string");
    // `hasMany` is mixed into typeof Base at runtime via extend().
    // Until it's statically typed, we invoke through a local cast.
    (this as unknown as AssocHost).hasMany("posts");
    (this as unknown as AssocHost).hasOne("profile");
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
    (this as unknown as AssocHost).belongsTo("author");
    (this as unknown as AssocHost).hasMany("comments", { dependent: "destroy" });
  }
}

class Comment extends Base {
  declare body: string;
  declare post_id: number;

  static {
    this.attribute("body", "string");
    this.attribute("post_id", "integer");
    (this as unknown as AssocHost).belongsTo("post");
  }
}

class Profile extends Base {
  declare bio: string;
  declare author_id: number;

  static {
    this.attribute("bio", "string");
    this.attribute("author_id", "integer");
    (this as unknown as AssocHost).belongsTo("author");
  }
}

describe("associations DX", () => {
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
        const klass = this as unknown as AssocHost;
        klass.belongsTo("author", { className: "Author", foreignKey: "author_id" });
        klass.belongsTo("post", { optional: true });
        klass.hasMany("comments", { dependent: "destroy", inverseOf: "tagged" });
        klass.hasOne("profile", { through: "author" });
      }
    }
    assertType(Tagged);
  });

  it("CollectionProxy is exported (currently non-generic — known gap)", () => {
    assertType<typeof CollectionProxy>(CollectionProxy);
  });

  it("KNOWN GAP: belongsTo/hasMany/hasOne are not statically declared on typeof Base", () => {
    // This test encodes the current shape. When these methods are typed on
    // `typeof Base`, remove the `AssocHost` cast above and update this test.
    type HasHasMany = "hasMany" extends keyof typeof Base ? true : false;
    assertType<HasHasMany>(false as HasHasMany);
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
