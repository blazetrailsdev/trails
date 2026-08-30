import { describe, it, expectTypeOf, assertType } from "vitest";
import { Base, CollectionProxy, AssociationProxy } from "@blazetrails/activerecord";

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
    expectTypeOf(proxy.first()).resolves.toEqualTypeOf<Post | null>();
    expectTypeOf(proxy.first(2)).resolves.toEqualTypeOf<Post[]>();
    expectTypeOf(proxy.last()).resolves.toEqualTypeOf<Post | null>();
    expectTypeOf(proxy.last(2)).resolves.toEqualTypeOf<Post[]>();
    expectTypeOf(proxy.take()).resolves.toEqualTypeOf<Post | null>();
    expectTypeOf(proxy.take(2)).resolves.toEqualTypeOf<Post[]>();
    expectTypeOf(proxy.find(1)).resolves.toEqualTypeOf<Post>();
    expectTypeOf(proxy.find([1, 2])).resolves.toEqualTypeOf<Post[]>();
    expectTypeOf(proxy.find(1, 2)).resolves.toMatchTypeOf<Post | Post[]>();
    expectTypeOf(proxy.build()).toEqualTypeOf<Post>();
    expectTypeOf(proxy.build({})).toEqualTypeOf<Post>();
    expectTypeOf(proxy.build([{}, {}])).toEqualTypeOf<Post[]>();
    expectTypeOf(proxy.create()).resolves.toEqualTypeOf<Post>();
    expectTypeOf(proxy.create({})).resolves.toEqualTypeOf<Post>();
    expectTypeOf(proxy.create([{}, {}])).resolves.toEqualTypeOf<Post[]>();
    expectTypeOf(proxy.createBang()).resolves.toEqualTypeOf<Post>();
    expectTypeOf(proxy.createBang({})).resolves.toEqualTypeOf<Post>();
    expectTypeOf(proxy.createBang([{}, {}])).resolves.toEqualTypeOf<Post[]>();
    expectTypeOf(proxy.target).toEqualTypeOf<Post[]>();
  });

  it("declare posts: AssociationProxy<Post> gives the chainable / array-shaped reader on the instance", () => {
    class Blog extends Base {
      declare name: string;
      declare posts: AssociationProxy<Post>;
      static {
        this.attribute("name", "string");
        this.hasMany("posts");
      }
    }
    const blog = new Blog({ name: "dean's blog" });
    expectTypeOf(blog.posts).toEqualTypeOf<AssociationProxy<Post>>();
  });

  it("without a `declare`, an association accessor read is a compile error", () => {
    const post = new Post({ title: "hi", author_id: 1, published: true });
    // @ts-expect-error `belongsTo("author")` needs a `declare author: Author | null` to reach the type side.
    expectTypeOf(post.author);
    const author = new Author({ name: "dean" });
    // @ts-expect-error `hasMany("posts")` needs a `declare posts: AssociationProxy<Post>`.
    expectTypeOf(author.posts);
  });
});
