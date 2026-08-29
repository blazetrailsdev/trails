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
  declare name: string;
  declare email: string;
  declare admin: boolean;

  static {
    this.attribute("name", "string");
    this.attribute("email", "string");
    this.attribute("admin", "boolean", { default: false });
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

class Tag extends Base {
  declare name: string;
  static {
    this.attribute("name", "string");
  }
}

class Author extends Base {
  declare name: string;

  declare comments: AssociationProxy<Comment>;

  declare tags: AssociationProxy<Tag>;

  declare profile: Profile | null;

  declare loadHasOne: (name: "profile") => Promise<Profile | null>;

  static {
    this.attribute("name", "string");
    this.hasMany("comments");
    this.hasAndBelongsToMany("tags");
    this.hasOne("profile");
  }
}

class Profile extends Base {
  declare bio: string;
  declare author_id: number;

  declare author: Author | null;

  static {
    this.attribute("bio", "string");
    this.attribute("author_id", "integer");
    this.belongsTo("author");
  }
}

class Post extends Base {
  declare title: string;
  declare published: boolean;

  declare static published: () => Relation<Post>;
  declare static recent: (sinceDays: number) => Relation<Post>;

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
  declare status: string;

  declare isLow: () => boolean;
  declare isHigh: () => boolean;
  declare lowBang: () => Promise<true | undefined>;
  declare highBang: () => Promise<true | undefined>;
  declare static low: () => Relation<Task>;
  declare static high: () => Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 });
  }
}

class Article extends Base {
  declare status: string;

  declare isDraft: () => boolean;
  declare isPublished: () => boolean;
  declare draft: () => void;
  declare published: () => void;
  declare draftBang: () => Promise<void>;
  declare publishedBang: () => Promise<void>;
  declare static draft: () => Relation<Article>;
  declare static published: () => Relation<Article>;
  declare static notDraft: () => Relation<Article>;
  declare static notPublished: () => Relation<Article>;

  static {
    this.attribute("status", "integer");
    defineEnum(this, "status", { draft: 0, published: 1 });
  }
}

export function _defineEnumOptionsTypecheck(): void {
  defineEnum(
    Article,
    "status",
    { draft: 0, published: 1 },
    {
      prefix: true,
      suffix: "state",
      scopes: false,
      instanceMethods: false,
      validate: true,
      default: "draft",
    },
  );
}

import { Temporal } from "@blazetrails/date";
class Event extends Base {
  declare starts_at: Temporal.Instant | Temporal.PlainDateTime;
  declare starts_on: Temporal.PlainDate;
  declare duration: Temporal.PlainTime;

  static {
    this.attribute("starts_at", "datetime");
    this.attribute("starts_on", "date");
    this.attribute("duration", "time");
  }
}

class BigRecord extends Base {
  declare score: bigint;
  declare smallId: bigint;

  static {
    this.attribute("score", "big_integer");
    this.attribute("smallId", "big_integer");
  }
}

describe("declare patterns — typing runtime-attached members", () => {
  it("attributes: `declare name: string` exposes the typed field", () => {
    const u = new User({ name: "dean", email: "d@example.com", admin: false });
    expectTypeOf(u.name).toBeString();
    expectTypeOf(u.email).toBeString();
    expectTypeOf(u.admin).toBeBoolean();
  });

  it("big_integer attribute: `declare score: bigint` exposes bigint field", () => {
    const r = new BigRecord({ score: 2n ** 62n });
    expectTypeOf(r.score).toEqualTypeOf<bigint>();
    expectTypeOf(r.smallId).toEqualTypeOf<bigint>();
    expectTypeOf<bigint>().toMatchTypeOf<import("@blazetrails/activerecord").PrimaryKeyScalar>();
  });

  it("hasMany accessor: `declare comments: AssociationProxy<Comment>` (chainable + awaitable + array-shaped)", async () => {
    const author = new Author({ name: "dean" });
    expectTypeOf(author.comments).toEqualTypeOf<AssociationProxy<Comment>>();
    expectTypeOf(await author.comments).toEqualTypeOf<Comment[]>();
    expectTypeOf(author.comments.target.length).toBeNumber();
    expectTypeOf(author.comments[0]).toEqualTypeOf<Comment | undefined>();
  });

  it("full CollectionProxy API via `association(record, name)` helper", async () => {
    const author = new Author({ name: "dean" });
    const proxy = association<Comment>(author, "comments");
    expectTypeOf(proxy).toMatchTypeOf<CollectionProxy<Comment>>();
    expectTypeOf(await proxy.first()).toEqualTypeOf<Comment | null>();
    expectTypeOf(await proxy.toArray()).toEqualTypeOf<Comment[]>();
  });

  it("hasAndBelongsToMany accessor: `declare tags: AssociationProxy<Tag>` (same shape as hasMany)", async () => {
    const author = new Author({ name: "dean" });
    expectTypeOf(author.tags).toEqualTypeOf<AssociationProxy<Tag>>();
  });

  it("belongsTo accessor: `declare author: Author | null` (synchronous reader)", () => {
    const profile = new Profile({ bio: "hi", author_id: 1 });
    expectTypeOf(profile.author).toEqualTypeOf<Author | null>();
  });

  it("hasOne accessor: `declare profile: Profile | null`", () => {
    const author = new Author({ name: "dean" });
    expectTypeOf(author.profile).toEqualTypeOf<Profile | null>();
  });

  it("named scope (static): `declare static published: () => Relation<Post>`", () => {
    expectTypeOf(Post.published).toEqualTypeOf<() => Relation<Post>>();
    expectTypeOf(Post.published()).toMatchTypeOf<Relation<Post>>();
    expectTypeOf(Post.recent).toEqualTypeOf<(sinceDays: number) => Relation<Post>>();
  });

  it("enum predicate: `declare isLow: () => boolean`", () => {
    const t = new Task({ status: 0 });
    expectTypeOf(t.isLow).toEqualTypeOf<() => boolean>();
    expectTypeOf(t.isLow()).toBeBoolean();
  });

  it("Base.enum bang: `declare lowBang: () => Promise<true | undefined>` (persisting, via update!)", () => {
    const t = new Task({ status: 0 });
    expectTypeOf(t.lowBang()).toEqualTypeOf<Promise<true | undefined>>();
  });

  it("Base.enum class scopes: `declare static low: () => Relation<Task>`", () => {
    expectTypeOf(Task.low).toEqualTypeOf<() => Relation<Task>>();
    expectTypeOf(Task.low()).toMatchTypeOf<Relation<Task>>();
  });

  it("defineEnum adds plain setters + async bangs + not* scopes", async () => {
    const a = new Article({ status: 0 });
    expectTypeOf(a.draft).toEqualTypeOf<() => void>();
    expectTypeOf(a.draftBang).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(await a.draftBang()).toBeVoid();
    expectTypeOf(Article.notDraft()).toMatchTypeOf<Relation<Article>>();
  });

  it("without a declare, instance members fall through to `unknown`; static members don't exist at all", () => {
    class Plain extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("posts");
        this.scope("active", function (this: Relation<Plain>) {
          return this;
        });
      }
    }
    const p = new Plain({ name: "x" });
    expectTypeOf(p.name).toBeUnknown();
    expectTypeOf(p.posts).toBeUnknown();
    type HasActive = "active" extends keyof typeof Plain ? true : false;
    expectTypeOf<HasActive>().toEqualTypeOf<false>();
  });

  it("Temporal attribute types: datetime → Instant | PlainDateTime, date → PlainDate, time → PlainTime", () => {
    const e = new Event({});
    expectTypeOf(e.starts_at).toEqualTypeOf<Temporal.Instant | Temporal.PlainDateTime>();
    expectTypeOf(e.starts_on).toEqualTypeOf<Temporal.PlainDate>();
    expectTypeOf(e.duration).toEqualTypeOf<Temporal.PlainTime>();
  });
});
