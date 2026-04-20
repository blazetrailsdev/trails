import { describe, it, expectTypeOf, assertType } from "vitest";
import { Base, CollectionProxy, AssociationProxy } from "@blazetrails/activerecord";

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

  it("CollectionProxy is generic in its element type", () => {
    const proxy = {} as CollectionProxy<Post>;
    expectTypeOf(proxy.toArray).returns.resolves.toEqualTypeOf<Post[]>();
    // first / last / take are overloaded: () → T | null, (n) → T[].
    // Call the zero-arg form explicitly so the assertion picks the
    // intended overload.
    expectTypeOf(proxy.first()).resolves.toEqualTypeOf<Post | null>();
    expectTypeOf(proxy.first(2)).resolves.toEqualTypeOf<Post[]>();
    expectTypeOf(proxy.last()).resolves.toEqualTypeOf<Post | null>();
    expectTypeOf(proxy.last(2)).resolves.toEqualTypeOf<Post[]>();
    expectTypeOf(proxy.take()).resolves.toEqualTypeOf<Post | null>();
    expectTypeOf(proxy.take(2)).resolves.toEqualTypeOf<Post[]>();
    // find is overloaded: (id) → T, ([ids]) → T[], (...ids) → T | T[].
    expectTypeOf(proxy.find(1)).resolves.toEqualTypeOf<Post>();
    expectTypeOf(proxy.find([1, 2])).resolves.toEqualTypeOf<Post[]>();
    expectTypeOf(proxy.find(1, 2)).resolves.toMatchTypeOf<Post | Post[]>();
    expectTypeOf(proxy.build).returns.toEqualTypeOf<Post>();
    expectTypeOf(proxy.create).returns.resolves.toEqualTypeOf<Post>();
    expectTypeOf(proxy.target).toEqualTypeOf<Post[]>();
  });

  it("declare posts: AssociationProxy<Post> gives the chainable / array-shaped reader on the instance", () => {
    class Blog extends Base {
      declare name: string;
      // Post-Phase-R: collection readers return the AssociationProxy
      // (Rails-faithful — `blog.posts` is chainable, awaitable, and
      // array-shaped against the loaded target via R.1's array-likeness).
      declare posts: AssociationProxy<Post>;
      static {
        this.attribute("name", "string");
        this.hasMany("posts");
      }
    }
    const blog = new Blog({ name: "dean's blog" });
    expectTypeOf(blog.posts).toEqualTypeOf<AssociationProxy<Post>>();
  });

  it("KNOWN GAP: without a `declare`, association accessors still return `unknown`", () => {
    // `Model` has `[key: string]: unknown`, so without a `declare posts:
    // Post[]` (or similar) on the class body, the accessor still falls
    // through to `unknown`. Users opt in per-association.
    const post = new Post({ title: "hi", author_id: 1, published: true });
    expectTypeOf(post.author).toBeUnknown();
    const author = new Author({ name: "dean" });
    expectTypeOf(author.posts).toBeUnknown();
  });
});
