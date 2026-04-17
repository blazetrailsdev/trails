/**
 * DX (virtualized form): the SAME patterns as `declare-patterns.test-d.ts`,
 * but authored with ZERO `declare` lines and ZERO association-target
 * imports. `trails-tsc` injects the declares and `import type { ... }`
 * lines at compile time, so the authored source stays Rails-fidelity —
 * a pure static block with `this.attribute(...)` / `this.hasMany(...)`
 * etc., matching `class Post < ApplicationRecord; has_many :comments; end`.
 *
 * Run with `pnpm test:types:virtualized` (which invokes `trails-tsc
 * --noEmit` against this directory). Plain `tsc` would fail against
 * these files — that's by design; the declares only exist after
 * virtualization.
 */

import { describe, it, expectTypeOf } from "vitest";
import {
  Base,
  CollectionProxy,
  AssociationProxy,
  Relation,
  association,
  defineEnum,
} from "@blazetrails/activerecord";
// `Comment` is intentionally NOT imported here — it lives in
// `comment.ts` and is referenced as the `Author.hasMany("comments")`
// target. `trails-tsc`'s auto-import pass must inject
// `import type { Comment } from "./comment.js"` so BOTH the injected
// `declare comments: AssociationProxy<Comment>` on Author AND the
// `expectTypeOf(...)<AssociationProxy<Comment>>()` assertions below
// resolve. If the auto-import pass regresses, this file fails CI.

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
    this.scope("published", (rel: Relation<Post>) => rel.where({ published: true }));
    this.scope("recent", (rel: Relation<Post>, sinceDays: number) => {
      void sinceDays;
      return rel.where({});
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

describe("virtualized patterns — trails-tsc injects declares + auto-imports", () => {
  it("attributes resolve to their declared type", () => {
    const u = new User({ name: "dean", email: "d@example.com", admin: false });
    expectTypeOf(u.name).toBeString();
    expectTypeOf(u.email).toBeString();
    expectTypeOf(u.admin).toBeBoolean();
  });

  it("hasMany resolves to AssociationProxy<Target>", async () => {
    const author = new Author({ name: "dean" });
    expectTypeOf(author.comments).toEqualTypeOf<AssociationProxy<Comment>>();
    expectTypeOf(await author.comments).toEqualTypeOf<Comment[]>();
    expectTypeOf(author.comments.length).toBeNumber();
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

  it("Base.enum produces predicates, bang setters, and class scopes", () => {
    const t = new Task({ status: 0 });
    expectTypeOf(t.isLow()).toBeBoolean();
    expectTypeOf(t.lowBang()).toMatchTypeOf<Task>();
    expectTypeOf(Task.low()).toMatchTypeOf<Relation<Task>>();
  });

  it("defineEnum adds plain setters, async bangs, and not* scopes", async () => {
    const a = new Article({ status: 0 });
    expectTypeOf(a.draft).toEqualTypeOf<() => void>();
    expectTypeOf(a.draftBang).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(await a.draftBang()).toBeVoid();
    expectTypeOf(Article.notDraft()).toMatchTypeOf<Relation<Article>>();
  });

  it("loadBelongsTo / loadHasOne overloads narrow by association name", async () => {
    const profile = new Profile({ bio: "hi", author_id: 1 });
    expectTypeOf(await profile.loadBelongsTo("author")).toEqualTypeOf<Author | null>();
    const author = new Author({ name: "dean" });
    expectTypeOf(await author.loadHasOne("profile")).toEqualTypeOf<Profile | null>();
  });
});
