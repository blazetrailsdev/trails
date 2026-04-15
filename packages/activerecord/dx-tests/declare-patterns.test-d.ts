/**
 * DX: the `declare` patterns for typing runtime-attached members.
 *
 * Several things in ActiveRecord are attached to a class/instance at runtime
 * (via `this.attribute`, `this.hasMany`, `this.scope`, `this.enum`, ...)
 * and so aren't visible to the TypeScript type system by default. Use a
 * `declare` field on the class body to pin the static type. This file is
 * the canonical reference for every supported pattern.
 */

import { describe, it, expectTypeOf } from "vitest";
import {
  Base,
  CollectionProxy,
  Relation,
  association,
  defineEnum,
} from "@blazetrails/activerecord";

// --- Attribute typing: `this.attribute("name", "string")` + `declare name: string` ---
// (Don't redeclare `id` — Base defines it as an accessor; narrow at the use
// site with `user.id as number` instead.)
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

// --- Association typing ---

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

  // hasMany → synchronous reader returning the loaded target array
  // (the same shape as Rails' `author.comments` once loaded). Use
  // `association(author, "comments")` to get the full CollectionProxy
  // API (async load/first/create/push/etc).
  declare comments: Comment[];

  // hasAndBelongsToMany → same shape as hasMany (array reader)
  declare tags: Tag[];

  // hasOne → Profile | null (synchronous reader; returns the record directly)
  declare profile: Profile | null;

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

  // belongsTo → Author | null (synchronous reader)
  declare author: Author | null;

  static {
    this.attribute("bio", "string");
    this.attribute("author_id", "integer");
    this.belongsTo("author");
  }
}

// --- Named scope typing: `this.scope("published", fn)` + `declare static published: ...` ---
class Post extends Base {
  declare title: string;
  declare published: boolean;

  // Class-level scope returns the scoped Relation.
  declare static published: () => Relation<Post>;
  declare static recent: (sinceDays: number) => Relation<Post>;

  static {
    this.attribute("title", "string");
    this.attribute("published", "boolean");
    this.scope("published", (rel: Relation<Post>) => rel.where({ published: true }));
    this.scope("recent", (rel: Relation<Post>, sinceDays: number) => {
      void sinceDays;
      return rel.where({});
    });
  }
}

// --- Enum typing (Base.enum form): `this.enum("status", {...})` generates
// a predicate and an in-memory bang setter per value, plus a class-level
// scope per value.
class Task extends Base {
  declare status: string;

  // record.isLow() / record.isHigh() — boolean predicates
  declare isLow: () => boolean;
  declare isHigh: () => boolean;
  // record.lowBang() / record.highBang() — in-memory setters, return this.
  // Not async, does not persist. Use `record.updateColumn("status", "low")`
  // if you want a persisting one-liner.
  declare lowBang: () => this;
  declare highBang: () => this;
  // Class-level enum scopes: Task.low() / Task.high()
  declare static low: () => Relation<Task>;
  declare static high: () => Relation<Task>;

  static {
    this.attribute("status", "integer");
    this.enum("status", { low: 0, high: 1 });
  }
}

// --- Enum typing (defineEnum form): richer surface with async persisting
// bang setters, plain in-memory setters, and `not*` scopes.
// Unlike Base.enum, defineEnum does NOT override the attribute accessor —
// `record.status` still returns the underlying integer. Use `readEnumValue`
// (exported from `@blazetrails/activerecord`) when you want the string label.
class Article extends Base {
  declare status: number; // integer column — defineEnum leaves the accessor alone

  // Predicates (same as Base.enum)
  declare isDraft: () => boolean;
  declare isPublished: () => boolean;
  // Plain in-memory setters (defineEnum only) — return void
  declare draft: () => void;
  declare published: () => void;
  // Async bang setters (defineEnum only). Sets the attribute in memory; if
  // the record is already persisted, also calls `updateColumn(...)` — which
  // bypasses validations and callbacks. For a new record, it's in-memory only.
  declare draftBang: () => Promise<void>;
  declare publishedBang: () => Promise<void>;
  // Class scopes (positive + negative, defineEnum only for `not*`)
  declare static draft: () => Relation<Article>;
  declare static published: () => Relation<Article>;
  declare static notDraft: () => Relation<Article>;
  declare static notPublished: () => Relation<Article>;

  static {
    this.attribute("status", "integer");
    defineEnum(this, "status", { draft: 0, published: 1 });
  }
}

describe("declare patterns — typing runtime-attached members", () => {
  it("attributes: `declare name: string` exposes the typed field", () => {
    const u = new User({ name: "dean", email: "d@example.com", admin: false });
    expectTypeOf(u.name).toBeString();
    expectTypeOf(u.email).toBeString();
    expectTypeOf(u.admin).toBeBoolean();
  });

  it("hasMany accessor: `declare comments: Comment[]` (synchronous reader)", async () => {
    const author = new Author({ name: "dean" });
    expectTypeOf(author.comments).toEqualTypeOf<Comment[]>();
  });

  it("full CollectionProxy API via `association(record, name)` helper", async () => {
    const author = new Author({ name: "dean" });
    const proxy = association<Comment>(author, "comments");
    expectTypeOf(proxy).toMatchTypeOf<CollectionProxy<Comment>>();
    expectTypeOf(await proxy.first()).toEqualTypeOf<Comment | null>();
    expectTypeOf(await proxy.toArray()).toEqualTypeOf<Comment[]>();
  });

  it("hasAndBelongsToMany accessor: `declare tags: Tag[]` (same shape as hasMany)", async () => {
    const author = new Author({ name: "dean" });
    expectTypeOf(author.tags).toEqualTypeOf<Tag[]>();
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

  it("Base.enum bang setter: `declare lowBang: () => this` (in-memory, returns self)", () => {
    const t = new Task({ status: 0 });
    expectTypeOf(t.lowBang()).toMatchTypeOf<Task>();
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
        this.scope("active", (rel: Relation<Plain>) => rel);
      }
    }
    const p = new Plain({ name: "x" });
    // Instance members type-check via Model's `[key: string]: unknown`
    // index signature, but resolve to `unknown`.
    expectTypeOf(p.name).toBeUnknown();
    expectTypeOf(p.posts).toBeUnknown();
    // Static members have no index signature — without `declare static`,
    // they don't exist on the class type. Assert that:
    type HasActive = "active" extends keyof typeof Plain ? true : false;
    expectTypeOf<HasActive>().toEqualTypeOf<false>();
  });
});
