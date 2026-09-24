import { describe, it, expectTypeOf } from "vitest";
import {
  Base,
  CollectionProxy,
  AssociationProxy,
  Relation,
  collectionProxyFor,
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
    this.attribute("overloaded_float", "float");
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
    const proxy = collectionProxyFor<Comment>(author, "comments");
    expectTypeOf(proxy).toMatchTypeOf<CollectionProxy<Comment>>();
    expectTypeOf(await proxy.first()).toEqualTypeOf<Comment | null>();
    expectTypeOf(await proxy.toArray()).toEqualTypeOf<Comment[]>();
  });

  it("hasAndBelongsToMany mirrors hasMany shape", () => {
    const author = new Author({ name: "dean" });
    expectTypeOf(author.tags).toEqualTypeOf<AssociationProxy<Tag>>();
  });

  it("belongsTo reader resolves to Target | null | Promise<Target | null>, writer takes Target | null", async () => {
    const profile = new Profile({ bio: "hi", author_id: 1 });
    expectTypeOf(profile.author).toEqualTypeOf<Author | null | Promise<Author | null>>();
    expectTypeOf(await profile.author).toEqualTypeOf<Author | null>();
    // @ts-expect-error an unloaded read may be a Promise, so it must be awaited
    void profile.author!.id;
    profile.author = null;
    // @ts-expect-error the writer takes a record, not a Promise
    profile.author = Promise.resolve(null);
  });

  it("hasOne reader resolves to Target | null | Promise<Target | null>, writer takes Target | null", async () => {
    const author = new Author({ name: "dean" });
    expectTypeOf(author.profile).toEqualTypeOf<Profile | null | Promise<Profile | null>>();
    expectTypeOf(await author.profile).toEqualTypeOf<Profile | null>();
    // @ts-expect-error an unloaded read may be a Promise, so it must be awaited
    void author.profile!.id;
    author.profile = null;
    // @ts-expect-error the writer takes a record, not a Promise
    author.profile = Promise.resolve(null);
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

  it("Temporal attribute types: datetime → Instant | PlainDateTime, date → PlainDate, time → Instant | TimeWithZone", () => {
    const e = new Event({});
    expectTypeOf(e.starts_at).toEqualTypeOf<
      | import("@blazetrails/date").Temporal.Instant
      | import("@blazetrails/date").Temporal.PlainDateTime
    >();
    expectTypeOf(e.starts_on).toEqualTypeOf<import("@blazetrails/date").Temporal.PlainDate>();
    expectTypeOf(e.duration).toEqualTypeOf<
      | import("@blazetrails/date").Temporal.Instant
      | import("@blazetrails/activesupport").TimeWithZone
    >();
  });
});

describe("generated attribute accessors", () => {
  it("the reader returns the cast value while the writer takes the raw one", () => {
    const e = new Event({});
    e.starts_at = "2008-01-01 00:00:00";
    expectTypeOf(e.starts_at).toEqualTypeOf<
      | import("@blazetrails/date").Temporal.Instant
      | import("@blazetrails/date").Temporal.PlainDateTime
    >();

    e.overloaded_float = "1.1";
    expectTypeOf(e.overloaded_float).toBeNumber();
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
