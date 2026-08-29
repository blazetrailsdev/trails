import { describe, it, expectTypeOf } from "vitest";
import {
  Base,
  CollectionProxy,
  AssociationProxy,
  Relation,
  association,
  defineEnum,
} from "@blazetrails/activerecord";

class User extends Base {
  static {
    this.attribute("name", "string");
    this.attribute("email", "string");
    this.attribute("admin", "boolean", { default: false });
  }
}

class Tag extends Base {
  static {
    this.attribute("name", "string");
  }
}

class Author extends Base {
  static {
    this.attribute("name", "string");
    this.hasMany("comments");
    this.hasAndBelongsToMany("tags");
    this.hasOne("profile");
  }
}

class Profile extends Base {
  static {
    this.attribute("bio", "string");
    this.attribute("author_id", "integer");
    this.belongsTo("author");
  }
}

class Post extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("published", "boolean");
    this.scope("published", function (this: Relation<Post>) {
      return this.where({ published: true });
    });
    this.scope("recent", function (this: Relation<Post>, sinceDays: number) {
      void sinceDays;
      return this.where({});
    });
  }
}

class Task extends Base {
  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 });
  }
}

class Article extends Base {
  static {
    this.attribute("status", "integer");
    defineEnum(this, "status", { draft: 0, published: 1 });
  }
}

class BigRecord extends Base {
  static {
    this.attribute("score", "big_integer");
    this.attribute("smallId", "big_integer");
  }
}

class Event extends Base {
  static {
    this.attribute("starts_at", "datetime");
    this.attribute("starts_on", "date");
    this.attribute("duration", "time");
  }
}

describe("virtualized patterns — trails-tsc injects declares + auto-imports", () => {
  it("attributes resolve to their declared type", () => {
    const u = new User({ name: "dean", email: "d@example.com", admin: false });
    expectTypeOf(u.name).toBeString();
    expectTypeOf(u.email).toBeString();
    expectTypeOf(u.admin).toBeBoolean();
  });

  it("big_integer attribute resolves to bigint", () => {
    const r = new BigRecord({ score: 2n ** 62n });
    expectTypeOf(r.score).toEqualTypeOf<bigint>();
    expectTypeOf(r.smallId).toEqualTypeOf<bigint>();
  });

  it("hasMany resolves to AssociationProxy<Target>", async () => {
    const author = new Author({ name: "dean" });
    expectTypeOf(author.comments).toEqualTypeOf<AssociationProxy<Comment>>();
    expectTypeOf(await author.comments).toEqualTypeOf<Comment[]>();
    expectTypeOf(author.comments.target.length).toBeNumber();
    expectTypeOf(author.comments[0]).toEqualTypeOf<Comment | undefined>();
  });

  it("association() helper keeps the full CollectionProxy API", async () => {
    const author = new Author({ name: "dean" });
    const proxy = association<Comment>(author, "comments");
    expectTypeOf(proxy).toMatchTypeOf<CollectionProxy<Comment>>();
    expectTypeOf(await proxy.first()).toEqualTypeOf<Comment | null>();
    expectTypeOf(await proxy.toArray()).toEqualTypeOf<Comment[]>();
  });

  it("hasAndBelongsToMany mirrors hasMany shape", () => {
    const author = new Author({ name: "dean" });
    expectTypeOf(author.tags).toEqualTypeOf<AssociationProxy<Tag>>();
  });

  it("belongsTo resolves to Target | null (synchronous reader)", () => {
    const profile = new Profile({ bio: "hi", author_id: 1 });
    expectTypeOf(profile.author).toEqualTypeOf<Author | null>();
  });

  it("hasOne resolves to Target | null", () => {
    const author = new Author({ name: "dean" });
    expectTypeOf(author.profile).toEqualTypeOf<Profile | null>();
  });

  it("named scope becomes a typed class method", () => {
    expectTypeOf(Post.published()).toMatchTypeOf<Relation<Post>>();
    expectTypeOf(Post.recent).toEqualTypeOf<(sinceDays: number) => Relation<Post>>();
  });

  it("Base.enum produces predicates, persisting bangs, scopes, and not* scopes", () => {
    const t = new Task({ status: 0 });
    expectTypeOf(t.isLow()).toBeBoolean();
    expectTypeOf(t.lowBang).toEqualTypeOf<() => Promise<true | undefined>>();
    expectTypeOf(Task.low()).toMatchTypeOf<Relation<Task>>();
    expectTypeOf(Task.notLow()).toMatchTypeOf<Relation<Task>>();
  });

  it("defineEnum (alias of _enum) produces predicates, persisting bangs, and not* scopes", () => {
    const a = new Article({ status: 0 });
    expectTypeOf(a.isDraft()).toBeBoolean();
    expectTypeOf(a.draftBang).toEqualTypeOf<() => Promise<true | undefined>>();
    expectTypeOf(Article.draft()).toMatchTypeOf<Relation<Article>>();
    expectTypeOf(Article.notDraft()).toMatchTypeOf<Relation<Article>>();
  });

  it("loadBelongsTo / loadHasOne overloads narrow by association name", async () => {
    const profile = new Profile({ bio: "hi", author_id: 1 });
    expectTypeOf(await profile.loadBelongsTo("author")).toEqualTypeOf<Author | null>();
    const author = new Author({ name: "dean" });
    expectTypeOf(await author.loadHasOne("profile")).toEqualTypeOf<Profile | null>();
  });

  it("Temporal attribute types: datetime → Instant | PlainDateTime, date → PlainDate, time → PlainTime", () => {
    const e = new Event({});
    expectTypeOf(e.starts_at).toEqualTypeOf<
      | import("@blazetrails/date").Temporal.Instant
      | import("@blazetrails/date").Temporal.PlainDateTime
    >();
    expectTypeOf(e.starts_on).toEqualTypeOf<import("@blazetrails/date").Temporal.PlainDate>();
    expectTypeOf(e.duration).toEqualTypeOf<import("@blazetrails/date").Temporal.PlainTime>();
  });
});

describe("undefined attribute reads", () => {
  it("reading a name the model never declared is a compile error", () => {
    const u = new User({ name: "dean" });
    // @ts-expect-error `mumbo` is not an attribute of User; Ruby's method_missing raises NoMethodError at run time, TypeScript refuses the read at build time.
    expectTypeOf(u.mumbo);

    // @ts-expect-error the write half is refused for the same reason.
    u.mumbo = 1;
  });
});
