// Array-likeness on CollectionProxy / AssociationProxy (Phase R.1/R.2) plus
// the `CollectionProxy#delete` nullify-path transaction-rollback regression.
//
// Canonical schema + models: the owner is `Author` and the collection is its
// default `has_many :posts` (posts.author_id is nullable, so `delete` takes the
// non-through nullify path). No bespoke tables.

import { describe, it, expect } from "vitest";
import { Base, association, registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Tag } from "../test-helpers/models/tag.js";
import { CpkAuthor, CpkBook } from "../test-helpers/models/cpk.js";
import { Pet } from "../test-helpers/models/pet.js";
import { Toy } from "../test-helpers/models/toy.js";
import { Owner } from "../test-helpers/models/owner.js";

// `authors`, `posts`, `cpkAuthors`, `cpkBooks`, `pets`, and `toys` are declared
// fixture sets below, so their models (`Author`, `Post`, `CpkAuthor`, `CpkBook`,
// `Pet`, `Toy`) register automatically when the set resolves — no `registerModel`
// needed, mirroring Rails' `fixtures :authors`. `Comment`, `Tagging`, `Tag`, and
// `Owner` are association targets with no fixture set of their own, so they still
// register explicitly until the autoload fallback (part b) lands.
registerModel(Comment);
registerModel(Tagging);
registerModel(Tag);
registerModel(Owner);

describe("CollectionProxy — array-likeness (Phase R.1)", () => {
  fixtures(["authors", "posts"]);

  // A fresh author owns only the posts we create here, so the loaded `posts`
  // collection is the deterministic ["a", "b", "c"] set the assertions expect.
  async function authorWithPosts(): Promise<Author> {
    const author = await Author.create({ name: "Dev" });
    for (const title of ["a", "b", "c"]) {
      await Post.create({ title, body: title, author_id: author.id as number });
    }
    const proxy = association<Post>(author, "posts");
    await proxy.load();
    return author;
  }

  it("exposes `length` against the loaded target", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    // With CP extending Relation, `proxy.length` is now the inherited
    // async `Relation#length()`. For a sync count over the loaded target
    // reach for `Array.from(proxy).length` or `proxy.target.length`.
    expect(Array.from(proxy).length).toBe(3);
    expect(proxy.target.length).toBe(3);
  });

  it("shadows Relation#length() — use proxy.count() for async count", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    expect(typeof proxy.length).toBe("function");
    expect(await proxy.length()).toBe(3);
    // `proxy.count()` still works too (association-specific path).
    expect(await proxy.count()).toBe(3);
  });

  it("is iterable via `for ... of`", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const titles: string[] = [];
    for (const p of proxy) titles.push(p.title);
    expect(titles).toEqual(["a", "b", "c"]);
  });

  it("supports numeric indexing (proxy[0]) — typed via the index signature", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    // No `as any` needed — AssociationProxy declares
    // `[index: number]: T | undefined` (the runtime support comes from
    // `wrapCollectionProxy`'s `get` trap). Out-of-range returns undefined.
    expect(proxy[0]?.title).toBe("a");
    expect(proxy[2]?.title).toBe("c");
    expect(proxy[99]).toBeUndefined();
  });

  it("at(index) returns the record or undefined", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    expect(proxy.at(0)?.title).toBe("a");
    expect(proxy.at(-1)?.title).toBe("c");
    expect(proxy.at(99)).toBeUndefined();
  });

  it("map / filter / forEach delegate to the target", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    expect(proxy.map((p) => p.title)).toEqual(["a", "b", "c"]);
    expect(proxy.filter((p) => p.title !== "b").map((p) => p.title)).toEqual(["a", "c"]);
    const seen: string[] = [];
    proxy.forEach((p) => seen.push(p.title));
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("some / every work", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    expect(proxy.some((p) => p.title === "b")).toBe(true);
    expect(proxy.every((p) => p.title.length === 1)).toBe(true);
  });

  it("delegates arbitrary Array methods to the loaded target (method_missing)", async () => {
    // Mirrors Rails' CollectionProxy/Relation `delegate ... to: :records`
    // (delegation.rb): Array methods not on the curated proxy surface route
    // through the loaded records — e.g. `sort`, `reverse`, `join`.
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    expect(
      (proxy.sort((a: Post, b: Post) => b.title.localeCompare(a.title)) as Post[]).map(
        (p: Post) => p.title,
      ),
    ).toEqual(["c", "b", "a"]);
    expect((proxy.reverse() as Post[]).map((p: Post) => p.title)).toEqual(["c", "b", "a"]);
    expect(proxy.join(",")).toBe(proxy.target.join(","));
    // Non-mutating: Ruby's `sort`/`reverse`, not `sort!`/`reverse!` — the
    // loaded target order is untouched.
    expect(proxy.target.map((p: Post) => p.title)).toEqual(["a", "b", "c"]);
  });

  it("preserves Relation#includes (eager loading) — proxy.includes routes to Relation", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    const first = proxy.at(0)!;
    // CollectionProxy intentionally does NOT define an Array-style
    // includes — that would shadow Relation#includes(...associations).
    // proxy.includes(...) falls through to Relation and builds an
    // eager-loading Relation. Membership is via Array.from(proxy).
    const rel = proxy.includes("comments");
    expect(typeof rel?.where).toBe("function"); // it's a Relation, not a boolean
    expect(Array.from(proxy as Iterable<Post>).includes(first)).toBe(true);
    expect(proxy.target.includes(first)).toBe(true);
  });

  it("preserves Relation#values (query state) — proxy.values routes to Relation", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    // CollectionProxy intentionally does NOT define an Array-style
    // values() — that would shadow Relation#values which returns the
    // query-state Record<string, unknown>. Iteration is via
    // [Symbol.iterator] / spread / Array.from.
    const v = proxy.values();
    expect(typeof v).toBe("object");
    expect(Array.isArray(v)).toBe(false); // confirms it's not the array iterator
    expect([...(proxy as Iterable<Post>)].map((p) => p.title)).toEqual(["a", "b", "c"]);
  });

  it("slice returns a plain array shallow copy", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const head = proxy.slice(0, 2);
    expect(head.map((p) => p.title)).toEqual(["a", "b"]);
    expect(Array.isArray(head)).toBe(true);
  });

  it("reduce composes over the target", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const concatenated = proxy.reduce((acc, p) => acc + p.title, "");
    expect(concatenated).toBe("abc");
  });

  it("indexOf / flatMap work", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const second = proxy.at(1)!;
    expect(proxy.indexOf(second)).toBe(1);
    expect(proxy.flatMap((p) => [p.title, p.title.toUpperCase()])).toEqual([
      "a",
      "A",
      "b",
      "B",
      "c",
      "C",
    ]);
  });

  it("array spread reads the loaded target", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const titles = [...proxy].map((p) => p.title);
    expect(titles).toEqual(["a", "b", "c"]);
  });

  it("Array.from reads the loaded target", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    expect(Array.from(proxy).length).toBe(3);
  });

  it("await still resolves to the loaded array (thenable preserved)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const arr = await proxy;
    expect(arr.map((p) => p.title)).toEqual(["a", "b", "c"]);
  });

  it("await proxy hydrates `_target` so subsequent sync ops work", async () => {
    // Build an author/post pair WITHOUT pre-loading via authorWithPosts (which
    // calls .load()). `await proxy` alone should be enough to make
    // `proxy.target`, `proxy[0]`, iteration all work afterwards.
    const author = await Author.create({ name: "Fresh" });
    for (const title of ["x", "y"]) {
      await Post.create({ title, body: title, author_id: author.id as number });
    }
    const proxy = association<Post>(author, "posts") as any;
    await proxy;
    expect(proxy.target.length).toBe(2);
    expect(proxy[0]?.title).toBe("x");
    expect([...proxy].map((p: Post) => p.title)).toEqual(["x", "y"]);
  });

  it("keys / entries work (values intentionally not added)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    expect([...proxy.keys()]).toEqual([0, 1, 2]);
    expect([...proxy.entries()].map(([i, p]) => `${i}:${p.title}`)).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("array methods accept a thisArg (matches Array.prototype signatures)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const ctx = { suffix: "!" };
    const titles = proxy.map(function (this: { suffix: string }, p) {
      return p.title + this.suffix;
    }, ctx);
    expect(titles).toEqual(["a!", "b!", "c!"]);
  });

  it("reduce supports the no-initial overload (Array.prototype parity)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    // Without an initial value, accumulator type is the element type (T).
    const concat = proxy.reduce((acc, p) => {
      return { ...acc, title: acc.title + p.title } as Post;
    });
    expect(concat.title).toBe("abc");
  });

  it("Array.isArray returns false on the proxy (known limitation)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    // `Array.isArray` checks an internal slot that proxies cannot fake.
    // Consumers of the post-R.2 reader who branch on Array.isArray must
    // reach for the loaded target via `await` or `Array.from(...)`.
    expect(Array.isArray(proxy)).toBe(false);
    expect(Array.isArray(Array.from(proxy))).toBe(true);
  });

  it("preserves PK-lookup `find(id)` — Array-style find(predicate) intentionally not added", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    // CollectionProxy already defines `async find(id): Promise<T | T[]>`
    // (the Rails-style PK lookup form), and that's what `proxy.find(...)`
    // resolves to. We intentionally do NOT add an Array-style
    // `find(predicate)` overload — it would shadow the PK lookup.
    // For Array semantics use `Array.from(proxy).find(p => ...)`.
    const found = await proxy.find((author as any).posts[0]?.id);
    expect(found?.title).toBe("a");
  });

  it("toArray honors direct bang-mutation of inherited Relation state", async () => {
    // In-place bang mutations on CP (cp.whereBang/orderBang/limitBang)
    // change the inherited Relation state. `toArray()` routes through
    // `loadHasMany` with a scope-override executor so the query honors the
    // mutations, bypassing the association cache.
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    proxy.whereBang({ title: "b" });
    const results = await proxy.toArray();
    expect(results.map((p: Post) => p.title)).toEqual(["b"]);
  });

  it("await proxy (load) honors direct bang-mutation of inherited Relation state", async () => {
    // `await proxy` calls load(), which uses the same unified _execLoad() path
    // as toArray(). When the proxy state has been mutated (whereBang/orderBang),
    // the scope-override executor is passed to loadHasMany so the mutated
    // scope is executed directly rather than falling back to the association cache.
    const author = await Author.create({ name: "Diverged" });
    for (const title of ["x", "y", "z"]) {
      await Post.create({ title, body: title, author_id: author.id as number });
    }
    const proxy = association<Post>(author, "posts") as any;
    proxy.whereBang({ title: "y" });
    const results = await proxy;
    expect(results.map((p: Post) => p.title)).toEqual(["y"]);
  });

  it("orderBang mutation respected in the unified load path", async () => {
    // Verify that non-where mutations (orderBang) also route through the
    // scope-override executor and produce correctly ordered results.
    const author = await Author.create({ name: "Ordered" });
    for (const title of ["c", "a", "b"]) {
      await Post.create({ title, body: title, author_id: author.id as number });
    }
    const proxy = association<Post>(author, "posts") as any;
    proxy.orderBang({ title: "asc" });
    const results = await proxy.toArray();
    expect(results.map((p: Post) => p.title)).toEqual(["a", "b", "c"]);
  });

  // ── Phase R.2 — collection reader returns the AssociationProxy ─────

  it("author.posts is the AssociationProxy itself (Phase R.2 reader swap)", async () => {
    const author = await authorWithPosts();
    // After Phase R.2, the collection reader returns the AssociationProxy
    // directly — no `association(author, "posts")` indirection needed.
    // Same identity as what `association()` returns.
    const direct = (author as any).posts;
    const helper = association<Post>(author, "posts");
    expect(direct).toBe(helper);
  });

  it("author.posts.where(...) chains through Relation delegation", async () => {
    const author = await authorWithPosts();
    const reader = (author as any).posts;
    // Chainable through the JS Proxy `get` trap → Relation delegation.
    const filtered = await reader.where({ title: "b" });
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe("b");
  });

  it("author.posts is array-like via R.1 surface", async () => {
    const author = await authorWithPosts();
    const reader = (author as any).posts;
    expect(reader.target.length).toBe(3);
    expect(reader[0]?.title).toBe("a");
    expect(reader.map((p: Post) => p.title)).toEqual(["a", "b", "c"]);
    const titles: string[] = [];
    for (const p of reader as Iterable<Post>) titles.push(p.title);
    expect(titles).toEqual(["a", "b", "c"]);
  });

  it("writer `author.posts = [...]` still flows through Association#writer", async () => {
    // R.2 only swapped the reader; the writer (defineWriters) is
    // untouched and still routes through `this.association(name).writer(value)`.
    const author = await authorWithPosts();
    const replacement = await Post.create({
      title: "z",
      body: "z",
      author_id: author.id as number,
    });
    (author as any).posts = [replacement];
    // The proxy returned by the reader reflects the new target.
    const reader = (author as any).posts;
    expect(reader.target.length).toBe(1);
    expect(reader[0]?.title).toBe("z");
  });

  it("clear() invalidates the cached _associationIds (Batch 158 / B32)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const instance = (
      author as unknown as { _associationInstances: Map<string, unknown> }
    )._associationInstances.get("posts") as { _associationIds: unknown[] | null };
    instance._associationIds = [1, 2, 3];
    await proxy.clear();
    expect(instance._associationIds).toBeNull();
  });

  it("destroyAll() invalidates the cached _associationIds (Batch 158 / B32)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const instance = (
      author as unknown as { _associationInstances: Map<string, unknown> }
    )._associationInstances.get("posts") as { _associationIds: unknown[] | null };
    instance._associationIds = [1, 2, 3];
    await proxy.destroyAll();
    expect(instance._associationIds).toBeNull();
  });

  // RFC 0006 S1 — proxy-backed read API + the `_associationCache` accessor.
  it("readTargets() returns the loaded target array (single source of truth)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    expect(proxy.readTargets()).toBe(proxy.target);
    expect(proxy.readTargets().map((p: Post) => p.title)).toEqual(["a", "b", "c"]);
  });

  it("targetsByPrimaryKey() keys loaded targets by primary key", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    const byKey = proxy.targetsByPrimaryKey() as Map<string, Post>;
    expect(byKey.size).toBe(3);
    for (const post of proxy.target as Post[]) {
      expect(byKey.get(String(post.id))).toBe(post);
    }
  });

  it("targetsByPrimaryKey() skips targets with an unassigned key", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    (proxy.target as Post[]).push(new Post({ title: "unsaved", body: "unsaved" }));
    expect((proxy.targetsByPrimaryKey() as Map<string, Post>).size).toBe(3);
  });

  it("_associationCache() returns the proxy whose target is the read accessor for loaded collections", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    expect((author as any)._associationCache("posts").target).toBe(proxy.readTargets());
  });

  it("_associationCache() returns undefined when no proxy is loaded or seeded", async () => {
    const author = await Author.create({ name: "Dev" });
    expect((author as any)._associationCache("posts")).toBeUndefined();
  });
});

// Regression: `CollectionProxy#delete` non-through nullify path wraps the Rails
// remove_records sequence (before_remove → update_all nullify → in-memory target
// removal → after_remove) in a transaction when persisted records exist, matching
// CollectionAssociation#delete_or_destroy (collection_association.rb:385-397). A
// raising after_remove must therefore roll back the DB nullify. New-record-only
// deletes run outside any transaction. No Rails test covers this delete/nullify +
// transaction case (test_transaction_when_deleting_persisted/_new_record cover
// `destroy`), so these use descriptive trails-only names.
describe("CollectionProxy#delete — nullify transaction rollback", () => {
  fixtures(["authors", "posts"]);

  // Author subclass on the canonical `authors` table whose has_many :posts
  // carries an after_remove that raises — the only deviation from the default
  // Author#posts association under test.
  class AuthorWithRaisingAfterRemove extends Base {
    static {
      this.tableName = "authors";
      this.hasMany("posts", {
        className: "Post",
        foreignKey: "author_id",
        afterRemove: () => {
          throw new Error("after_remove boom");
        },
      });
    }
  }
  registerModel("AuthorWithRaisingAfterRemove", AuthorWithRaisingAfterRemove);

  it("rolls back the nullify update_all when after_remove raises", async () => {
    const author = await AuthorWithRaisingAfterRemove.create({ name: "Owner" });
    const post = await Post.create({ title: "p", body: "p", author_id: author.id as number });
    const proxy = association<Post>(author, "posts");
    await proxy.load();

    await expect(proxy.delete(post)).rejects.toThrow("after_remove boom");

    // The transaction wrapping remove_records rolled the nullify back, so the
    // child FK is still set in the DB.
    const reloaded = await Post.find(post.id as number);
    expect((reloaded as any).author_id).toBe(Number(author.id));
  });

  it("does not open a transaction for new-record-only deletes", async () => {
    const author = await Author.create({ name: "Owner" });
    const proxy = association<Post>(author, "posts") as any;
    const built = proxy.build({ title: "p", body: "p" });
    expect(built.isNewRecord()).toBe(true);

    // Spy on the real DB boundary: `CollectionProxy#transaction` delegates to
    // `reflection.klass.transaction` (collection_association.rb:395 wraps
    // remove_records in `transaction { ... }` where `transaction` is the
    // reflection class method), so `Post.transaction` is what `deleteOrDestroy`
    // opens when persisted records exist. Restored in `finally` because it is
    // shared static state on the canonical model.
    let opened = false;
    const realTransaction = (Post as any).transaction.bind(Post);
    (Post as any).transaction = (fn: any, options: any) => {
      opened = true;
      return realTransaction(fn, options);
    };
    try {
      await proxy.delete(built);
    } finally {
      (Post as any).transaction = realTransaction;
    }

    // Rails delete_or_destroy only wraps remove_records when persisted records
    // exist; a new-record-only delete runs outside any transaction.
    expect(opened).toBe(false);
    expect(proxy.target.length).toBe(0);
  });
});

// RFC 0006 S1 — targetsByPrimaryKey() across non-default primary keys. The
// token routes through `record.id` → `_getId` → `_readAttribute(primaryKey)`,
// so a custom single-column PK and a composite PK must key correctly, and a
// composite new record (an `id` array with null parts) must be skipped.
// Canonical models: `CpkAuthor has_many :books` (CpkBook PK `[author_id, id]`)
// for the composite case, and `Pet has_many :toys` (Toy PK `toy_id`) for the
// custom single-column case. No bespoke tables.
describe("CollectionProxy#targetsByPrimaryKey — non-default primary keys", () => {
  fixtures(["cpkAuthors", "cpkBooks", "pets", "toys"]);

  it("keys loaded targets by their composite primary key", async () => {
    const owner = await CpkAuthor.create({ name: "o" });
    await CpkBook.create({ author_id: owner.id as number, id: 7, title: "a" });
    await CpkBook.create({ author_id: owner.id as number, id: 9, title: "b" });
    const proxy = association<CpkBook>(owner, "books") as any;
    await proxy.load();
    const byKey = proxy.targetsByPrimaryKey() as Map<string, CpkBook>;
    expect(byKey.size).toBe(2);
    // Distinct composite keys never collide, and every loaded book is a value.
    expect(new Set(byKey.values())).toEqual(new Set(proxy.target as CpkBook[]));
  });

  it("keys loaded targets by a custom single-column primary key", async () => {
    const owner = await Pet.create({ name: "o" });
    const first = await Toy.create({ name: "aaa", pet_id: owner.id as number });
    const second = await Toy.create({ name: "bbb", pet_id: owner.id as number });
    const proxy = association<Toy>(owner, "toys") as any;
    await proxy.load();
    const byKey = proxy.targetsByPrimaryKey() as Map<string, Toy>;
    expect(byKey.size).toBe(2);
    expect(byKey.get(String(first.id))?.id).toBe(first.id);
    expect(byKey.get(String(second.id))?.id).toBe(second.id);
  });

  it("skips a composite new record whose key parts are unassigned", async () => {
    const owner = await CpkAuthor.create({ name: "o" });
    await CpkBook.create({ author_id: owner.id as number, id: 7, title: "a" });
    const proxy = association<CpkBook>(owner, "books") as any;
    await proxy.load();
    // `id` unassigned → null part in the composite key array.
    (proxy.target as CpkBook[]).push(new CpkBook({ author_id: owner.id as number }));
    expect((proxy.targetsByPrimaryKey() as Map<string, CpkBook>).size).toBe(1);
  });
});

// RFC 0023-surfaced-deviations: a CollectionProxy's relation clauses are seeded
// ONCE at construction. When the owner is a NEW record then, its FK is
// unresolvable and the seed collapses to the `1=0` NullRelation. A relation
// spawned off that stale seed (`owner.things.where(...)`) — or the proxy itself
// once a bang has diverged it — must pick up the persisted FK once the owner is
// saved, mirroring Rails' CollectionProxy delegating every query to the live
// `association.scope`.
describe("CollectionProxy — mutated finder requery on stale new-owner seed", () => {
  fixtures(["authors", "posts"]);

  it("resolves the persisted FK on first/last/take/find_nth after save", async () => {
    // Owner is a NEW record when the mutated relation is spawned, so its seed
    // is the `1=0` NullRelation.
    const author = new Author({ name: "New Owner" });
    const rel = (association<Post>(author, "posts") as any)
      .where({ title: "match" })
      .order({ id: "asc" });

    await author.save();
    const authorId = author.id as number;
    const first = await Post.create({ title: "match", body: "1", author_id: authorId });
    const last = await Post.create({ title: "match", body: "2", author_id: authorId });
    // A non-matching sibling proves the mutation (`where(title:)`) is still
    // applied on top of the rebuilt scope, not dropped.
    await Post.create({ title: "other", body: "3", author_id: authorId });

    expect((await rel.first()).id).toBe(first.id);
    expect((await rel.last()).id).toBe(last.id);
    expect((await rel.take()).title).toBe("match");
    expect((await rel.second()).id).toBe(last.id);
  });

  it("resolves the persisted FK when the proxy itself is mutated while new", async () => {
    const author = new Author({ name: "New Owner Two" });
    const proxy = association<Post>(author, "posts") as any;
    // Diverge the proxy in place (sets `_cpMutated`) while the owner is still a
    // new record, so its base is the stale `1=0` seed.
    proxy.whereBang({ title: "keep" });

    await author.save();
    const authorId = author.id as number;
    const kept = await Post.create({ title: "keep", body: "1", author_id: authorId });
    await Post.create({ title: "drop", body: "2", author_id: authorId });

    expect((await proxy.first()).id).toBe(kept.id);
  });
});
