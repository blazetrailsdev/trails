import { Time as RubyTime } from "@blazetrails/date";
import { describe, it, expect } from "vitest";
import { throwAbort } from "@blazetrails/activesupport";
import { Base, association, registerModel, RecordNotFound } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import "../support/canonical-model-index.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Firm } from "../test-helpers/models/company.js";
import { Ship } from "../test-helpers/models/ship.js";
import { ShipPart } from "../test-helpers/models/ship-part.js";

describe("CollectionProxy — array-likeness (Phase R.1)", () => {
  fixtures(["authors", "posts"]);

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
    expect(Array.from(proxy).length).toBe(3);
    expect(proxy.target.length).toBe(3);
  });

  it("shadows Relation#length() — use proxy.count() for async count", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    expect(typeof proxy.length).toBe("function");
    expect(await proxy.length()).toBe(3);
    expect(await proxy.count()).toBe(3);
  });

  it("refuses to coerce `length` to a number", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    await proxy.load();

    expect(() => proxy.length > 0).toThrow(/`length` is a method on a collection/);
    expect(() => `${proxy.length}`).toThrow(/`length` is a method on a collection/);
    expect(await proxy.length()).toBe(3);
  });

  it("is iterable via `for ... of`", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const titles: string[] = [];
    for (const p of proxy) titles.push(p.title);
    expect(titles.sort()).toEqual(["a", "b", "c"]);
  });

  it("supports numeric indexing (proxy[0]) — typed via the index signature", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    expect(proxy[0]).toBe(proxy.target[0]);
    expect(proxy[2]).toBe(proxy.target[2]);
    expect(proxy[99]).toBeUndefined();
  });

  it("at(index) returns the record or undefined", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    expect(proxy.at(0)).toBe(proxy.target[0]);
    expect(proxy.at(-1)).toBe(proxy.target[2]);
    expect(proxy.at(99)).toBeUndefined();
  });

  it("map / filter / forEach delegate to the target", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    expect(proxy.map((p: Post) => p.title).sort()).toEqual(["a", "b", "c"]);
    expect(
      proxy
        .filter((p: Post) => p.title !== "b")
        .map((p: Post) => p.title)
        .sort(),
    ).toEqual(["a", "c"]);
    const seen: string[] = [];
    proxy.forEach((p: Post) => seen.push(p.title));
    expect(seen.sort()).toEqual(["a", "b", "c"]);
  });

  it("some / every work", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    expect(proxy.some((p: Post) => p.title === "b")).toBe(true);
    expect(proxy.every((p: Post) => p.title.length === 1)).toBe(true);
  });

  it("delegates arbitrary Array methods to the loaded target (method_missing)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    const loaded = proxy.target.map((p: Post) => p.title);
    expect(
      (proxy.sort((a: Post, b: Post) => b.title.localeCompare(a.title)) as Post[]).map(
        (p: Post) => p.title,
      ),
    ).toEqual(["c", "b", "a"]);
    expect((proxy.reverse() as Post[]).map((p: Post) => p.title)).toEqual([...loaded].reverse());
    expect(proxy.join(",")).toBe(proxy.target.join(","));
    expect(proxy.target.map((p: Post) => p.title)).toEqual(loaded);
  });

  it("preserves Relation#includes (eager loading) — proxy.includes routes to Relation", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    const first = proxy.at(0)!;
    const rel = proxy.includes(":comments");
    expect(typeof rel?.where).toBe("function");
    expect(Array.from(proxy as Iterable<Post>).includes(first)).toBe(true);
    expect(proxy.target.includes(first)).toBe(true);
  });

  it("preserves Relation#values (query state) — proxy.values routes to Relation", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    const v = proxy.values();
    expect(typeof v).toBe("object");
    expect(Array.isArray(v)).toBe(false);
    expect([...(proxy as Iterable<Post>)].map((p) => p.title).sort()).toEqual(["a", "b", "c"]);
  });

  it("slice returns a plain array shallow copy", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const head = proxy.slice(0, 2);
    expect(head).toEqual(proxy.target.slice(0, 2));
    expect(Array.isArray(head)).toBe(true);
  });

  it("reduce composes over the target", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const concatenated = proxy.reduce((acc: string, p: Post) => acc + p.title, "");
    expect([...concatenated].sort().join("")).toBe("abc");
  });

  it("indexOf / flatMap work", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const second = proxy.at(1)!;
    expect(proxy.indexOf(second)).toBe(1);
    expect(proxy.flatMap((p: Post) => [p.title, p.title.toUpperCase()])).toEqual(
      proxy.target.flatMap((p) => [p.title, p.title.toUpperCase()]),
    );
  });

  it("array spread reads the loaded target", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const titles = [...(proxy as Iterable<Post>)].map((p) => p.title);
    expect(titles.sort()).toEqual(["a", "b", "c"]);
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
    expect(arr.map((p) => p.title).sort()).toEqual(["a", "b", "c"]);
  });

  it("await proxy hydrates `_target` so subsequent sync ops work", async () => {
    const author = await Author.create({ name: "Fresh" });
    for (const title of ["x", "y"]) {
      await Post.create({ title, body: title, author_id: author.id as number });
    }
    const proxy = association<Post>(author, "posts") as any;
    await proxy;
    expect(proxy.target.length).toBe(2);
    expect(proxy[0]).toBe(proxy.target[0]);
    expect([...proxy].map((p: Post) => p.title).sort()).toEqual(["x", "y"]);
  });

  it("array methods accept a thisArg (matches Array.prototype signatures)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const ctx = { suffix: "!" };
    const titles = proxy.map(function (this: { suffix: string }, p: Post) {
      return p.title + this.suffix;
    }, ctx);
    expect(titles.sort()).toEqual(["a!", "b!", "c!"]);
  });

  it("reduce supports the no-initial overload (Array.prototype parity)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    const concat = proxy.reduce((acc: Post, p: Post) => {
      return { ...acc, title: acc.title + p.title } as Post;
    });
    expect([...concat.title].sort().join("")).toBe("abc");
  });

  it("Array.isArray returns false on the proxy (known limitation)", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts");
    expect(Array.isArray(proxy)).toBe(false);
    expect(Array.isArray(Array.from(proxy))).toBe(true);
  });

  it("preserves PK-lookup `find(id)` — Array-style find(predicate) intentionally not added", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    const first = (author as any).posts[0];
    const found = await proxy.find(first?.id);
    expect(found?.title).toBe(first?.title);
  });

  it("toArray hydrates and caches the target — a second call returns the cached set", async () => {
    const author = await Author.create({ name: "Cached" });
    for (const title of ["a", "b"]) {
      await Post.create({ title, body: title, author_id: author.id as number });
    }
    const proxy = association<Post>(author, "posts") as any;
    const first = await proxy.toArray();
    expect(first.map((p: Post) => p.title).sort()).toEqual(["a", "b"]);

    await Post.create({ title: "c", body: "c", author_id: author.id as number });
    const second = await proxy.toArray();
    expect(second.map((p: Post) => p.title).sort()).toEqual(["a", "b"]);
    expect(second[0]).toBe(first[0]);
  });

  it("bang builders delegate to scope, leaving load_target untouched", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    const scope = proxy.scope();
    proxy.whereBang({ title: "b" });
    expect((await proxy.toArray()).map((p: Post) => p.title)).toEqual(["a", "b", "c"]);
    expect((await scope.toArray()).map((p: Post) => p.title)).toEqual(["b"]);
  });

  it("orderBang delegates to scope", async () => {
    const author = await Author.create({ name: "Ordered" });
    for (const title of ["c", "a", "b"]) {
      await Post.create({ title, body: title, author_id: author.id as number });
    }
    const proxy = association<Post>(author, "posts") as any;
    const scope = proxy.scope();
    proxy.orderBang({ title: "asc" });
    expect((await scope.toArray()).map((p: Post) => p.title)).toEqual(["a", "b", "c"]);
  });

  it("author.posts is the AssociationProxy itself (Phase R.2 reader swap)", async () => {
    const author = await authorWithPosts();
    const direct = (author as any).posts;
    const helper = association<Post>(author, "posts");
    expect(direct).toBe(helper);
  });

  it("author.posts.where(...) chains through Relation delegation", async () => {
    const author = await authorWithPosts();
    const reader = (author as any).posts;
    const filtered = await reader.where({ title: "b" });
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe("b");
  });

  it("author.posts is array-like via R.1 surface", async () => {
    const author = await authorWithPosts();
    const reader = (author as any).posts;
    expect(reader.target.length).toBe(3);
    expect(reader[0]).toBe(reader.target[0]);
    expect(reader.map((p: Post) => p.title).sort()).toEqual(["a", "b", "c"]);
    const titles: string[] = [];
    for (const p of reader as Iterable<Post>) titles.push(p.title);
    expect(titles.sort()).toEqual(["a", "b", "c"]);
  });

  it("writer `author.posts = [...]` still flows through Association#writer", async () => {
    const author = await authorWithPosts();
    const replacement = await Post.create({
      title: "z",
      body: "z",
      author_id: author.id as number,
    });
    expect(() => {
      (author as any).posts = [replacement];
    }).toThrow(TypeError);
    await association<Post>(author, "posts").replace([replacement]);
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

  it("_associationCache() returns the proxy whose target is the read accessor for loaded collections", async () => {
    const author = await authorWithPosts();
    const proxy = association<Post>(author, "posts") as any;
    expect((author as any)._associationCache("posts").target).toBe(proxy.target);
  });

  it("_associationCache() returns undefined when no proxy is loaded or seeded", async () => {
    const author = await Author.create({ name: "Dev" });
    expect((author as any)._associationCache("posts")).toBeUndefined();
  });
});

describe("CollectionProxy#delete — nullify transaction rollback", () => {
  fixtures(["authors", "posts"]);

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

    const reloaded = await Post.find(post.id as number);
    expect((reloaded as any).author_id).toBe(Number(author.id));
  });

  it("does not open a transaction for new-record-only deletes", async () => {
    const author = await Author.create({ name: "Owner" });
    const proxy = association<Post>(author, "posts") as any;
    const built = proxy.build({ title: "p", body: "p" });
    expect(built.isNewRecord()).toBe(true);

    // Spy on the real DB boundary: `CollectionProxy#transaction` delegates to
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

    expect(opened).toBe(false);
    expect(proxy.target.length).toBe(0);
  });
});

describe("CollectionProxy#delete / #destroy — nil return on empty or abort", () => {
  fixtures(["authors", "posts"]);

  class AuthorWithAbortingBeforeRemove extends Base {
    static {
      this.tableName = "authors";
      this.hasMany("posts", {
        className: "Post",
        foreignKey: "author_id",
        beforeRemove: () => throwAbort(),
      });
    }
  }
  registerModel("AuthorWithAbortingBeforeRemove", AuthorWithAbortingBeforeRemove);

  it("returns nil when delete is called with no records", async () => {
    const author = await Author.create({ name: "Owner" });
    const proxy = association<Post>(author, "posts");
    expect(await proxy.delete()).toBeUndefined();
  });

  it("returns nil when destroy is called with no records", async () => {
    const author = await Author.create({ name: "Owner" });
    const proxy = association<Post>(author, "posts");
    expect(await proxy.destroy()).toBeUndefined();
  });

  it("returns [] (not nil) when delete is called with an explicit empty array", async () => {
    const author = await Author.create({ name: "Owner" });
    const proxy = association<Post>(author, "posts");
    expect(await (proxy.delete as (...r: unknown[]) => Promise<Base[] | undefined>)([])).toEqual(
      [],
    );
  });

  it("returns nil when a before_remove callback aborts delete", async () => {
    const author = await AuthorWithAbortingBeforeRemove.create({ name: "Owner" });
    const post = await Post.create({ title: "p", body: "p", author_id: author.id as number });
    const proxy = association<Post>(author, "posts");
    await proxy.load();

    expect(await proxy.delete(post)).toBeUndefined();
    const reloaded = await Post.find(post.id as number);
    expect((reloaded as any).author_id).toBe(Number(author.id));
  });
});

describe("CollectionProxy#delete / #destroy through has_many :through — nil on empty, records on abort", () => {
  fixtures(["posts", "tags"]);

  class PostWithAbortingTagRemove extends Base {
    static {
      this.tableName = "posts";
      this.hasMany("taggings", { as: "taggable" });
      this.hasMany("tags", { through: "taggings", beforeRemove: () => throwAbort() });
    }
  }
  registerModel("PostWithAbortingTagRemove", PostWithAbortingTagRemove);

  it("returns nil when a through delete is called with no records", async () => {
    const post = await Post.create({ title: "p", body: "p" });
    const proxy = association<Tag>(post, "tags");
    expect(await proxy.delete()).toBeUndefined();
  });

  it("returns [] (not nil) when a through delete is called with an explicit empty array", async () => {
    const post = await Post.create({ title: "p", body: "p" });
    const proxy = association<Tag>(post, "tags");
    expect(await (proxy.delete as (...r: unknown[]) => Promise<Base[] | undefined>)([])).toEqual(
      [],
    );
  });

  it("returns the records (not nil) when a before_remove aborts a through delete, leaving the join row", async () => {
    const post = await PostWithAbortingTagRemove.create({ title: "p", body: "p" });
    const tag = await Tag.create({ name: "t" });
    await Tagging.create({
      taggable_id: post.id as number,
      taggable_type: "PostWithAbortingTagRemove",
      tag_id: tag.id as number,
    });
    const proxy = association<Tag>(post, "tags");
    await proxy.load();

    const result = await proxy.delete(tag);
    expect(result).toHaveLength(1);
    expect((result as Tag[])[0]).toBe(tag);
    const count = await Tagging.where({ taggable_id: post.id as number }).count();
    expect(count).toBe(1);
    expect(proxy.target).toHaveLength(1);
    expect(proxy.target[0].id).toBe(tag.id);
  });

  it("coerces a bare id but raises on an id nested in an array for a through delete", async () => {
    const post = await Post.create({ title: "p", body: "p" });
    const tag = await Tag.create({ name: "t" });
    await Tagging.create({
      taggable_id: post.id as number,
      taggable_type: "Post",
      tag_id: tag.id as number,
    });
    const proxy = association<Tag>(post, "tags");
    await proxy.load();

    await expect((proxy.delete as (...r: unknown[]) => Promise<unknown>)([tag.id])).rejects.toThrow(
      /Tag.*expected/,
    );
    expect(await Tagging.where({ taggable_id: post.id as number }).count()).toBe(1);

    const removed = await proxy.delete(tag.id as number);
    expect(removed).toBeDefined();
    expect(await Tagging.where({ taggable_id: post.id as number }).count()).toBe(0);
  });
});

describe("CollectionProxy — mutated finder requery on stale new-owner seed", () => {
  fixtures(["authors", "posts"]);

  it("resolves the persisted FK on first/last/take/find_nth after save", async () => {
    const author = new Author({ name: "New Owner" });
    const rel = (association<Post>(author, "posts") as any)
      .where({ title: "match" })
      .order({ id: "asc" });

    await author.save();
    const authorId = author.id as number;
    const first = await Post.create({ title: "match", body: "1", author_id: authorId });
    const last = await Post.create({ title: "match", body: "2", author_id: authorId });
    await Post.create({ title: "other", body: "3", author_id: authorId });

    expect((await rel.first()).id).toBe(first.id);
    expect((await rel.last()).id).toBe(last.id);
    expect((await rel.take()).title).toBe("match");
    expect((await rel.second()).id).toBe(last.id);
  });

  it("resolves the persisted FK when the proxy itself is mutated while new", async () => {
    const author = new Author({ name: "New Owner Two" });
    const proxy = association<Post>(author, "posts") as any;
    proxy.whereBang({ title: "keep" });

    await author.save();
    const authorId = author.id as number;
    const kept = await Post.create({ title: "keep", body: "1", author_id: authorId });
    await Post.create({ title: "drop", body: "2", author_id: authorId });

    expect((await proxy.first()).id).toBe(kept.id);
  });

  it("resolves the persisted FK on count/exists/pluck/pick/find after save", async () => {
    const author = new Author({ name: "New Owner Three" });
    const rel = (association<Post>(author, "posts") as any).where({ title: "match" });

    await author.save();
    const authorId = author.id as number;
    const match = await Post.create({ title: "match", body: "1", author_id: authorId });
    await Post.create({ title: "other", body: "2", author_id: authorId });

    expect(await rel.count()).toBe(1);
    expect(await rel.exists()).toBe(true);
    expect(await rel.pluck("title")).toEqual(["match"]);
    expect(await rel.pick("title")).toBe("match");
    expect((await rel.find(match.id)).id).toBe(match.id);
  });

  it("resolves the persisted FK on updateAll/updateCounters after save", async () => {
    const author = new Author({ name: "New Owner Four" });
    const rel = (association<Post>(author, "posts") as any).where({ title: "match" });

    await author.save();
    const authorId = author.id as number;
    const match = await Post.create({ title: "match", body: "1", author_id: authorId });
    const other = await Post.create({ title: "other", body: "2", author_id: authorId });

    expect(await rel.updateCounters({ tags_count: 1 })).toBe(1);
    expect((await Post.find(match.id)).tags_count).toBe(1);
    expect((await Post.find(other.id)).tags_count).toBe(0);

    expect(await rel.updateAll({ body: "updated" })).toBe(1);
    expect((await Post.find(match.id)).body).toBe("updated");
    expect((await Post.find(other.id)).body).toBe("2");
  });

  it("resolves the persisted FK on deleteAll after save", async () => {
    const author = new Author({ name: "New Owner Five" });
    const rel = (association<Post>(author, "posts") as any).where({ title: "match" });

    await author.save();
    const authorId = author.id as number;
    await Post.create({ title: "match", body: "1", author_id: authorId });
    const other = await Post.create({ title: "other", body: "2", author_id: authorId });

    expect(await rel.deleteAll()).toBe(1);
    expect(await Post.where({ author_id: authorId }).pluck("id")).toEqual([other.id]);
  });

  it("resolves the persisted FK on touchAll after save", async () => {
    const ship = new Ship({ name: "New Owner Six" });
    const rel = (association<ShipPart>(ship, "parts") as any).where({ name: "mast" });

    await ship.save();
    const shipId = ship.id as number;
    const stale = "2000-01-01T00:00:00Z";
    const mast = await ShipPart.create({ name: "mast", ship_id: shipId, updated_at: stale });
    const sail = await ShipPart.create({ name: "sail", ship_id: shipId, updated_at: stale });

    expect(await rel.touchAll()).toBe(1);
    expect((await ShipPart.find(mast.id)).updated_at).not.toEqual(RubyTime.utc(2000, 1, 1));
    expect((await ShipPart.find(sail.id)).updated_at).toEqual(RubyTime.utc(2000, 1, 1));
  });
});

describe("CollectionProxy — mutation terminals invoked on the proxy itself on stale new-owner seed", () => {
  fixtures(["authors", "posts"]);

  it("resolves the persisted FK on updateAll/updateCounters invoked on the proxy after save", async () => {
    const author = new Author({ name: "Proxy Mutation One" });
    const posts = association<Post>(author, "posts") as any;

    await author.save();
    const authorId = author.id as number;
    const mine = await Post.create({ title: "mine", body: "1", author_id: authorId });
    const otherAuthor = await Author.create({ name: "Someone Else" });
    const theirs = await Post.create({ title: "theirs", body: "2", author_id: otherAuthor.id });

    expect(await posts.updateCounters({ tags_count: 1 })).toBe(1);
    expect((await Post.find(mine.id)).tags_count).toBe(1);
    expect((await Post.find(theirs.id)).tags_count).toBe(0);

    expect(await posts.updateAll({ body: "updated" })).toBe(1);
    expect((await Post.find(mine.id)).body).toBe("updated");
    expect((await Post.find(theirs.id)).body).toBe("2");
  });

  it("resolves the persisted FK on the diverged deleteAll branch invoked on the proxy after save", async () => {
    const author = new Author({ name: "Proxy Mutation Two" });
    const posts = association<Post>(author, "posts") as any;
    posts.whereBang({ title: "drop" });

    await author.save();
    const authorId = author.id as number;
    const dropped = await Post.create({ title: "drop", body: "1", author_id: authorId });
    const kept = await Post.create({ title: "keep", body: "2", author_id: authorId });
    const otherAuthor = await Author.create({ name: "Someone Else Two" });
    const theirs = await Post.create({ title: "drop", body: "3", author_id: otherAuthor.id });

    expect(await posts.deleteAll()).toBe(2);
    expect(await Post.where({ author_id: authorId }).pluck("id")).toEqual([]);
    expect((await Post.find(dropped.id)).author_id).toBeNull();
    expect((await Post.find(kept.id)).author_id).toBeNull();
    expect((await Post.find(theirs.id)).author_id).toBe(otherAuthor.id);
  });

  it("resolves the persisted FK on updateAll read again after save", async () => {
    const author = new Author({ name: "Proxy Mutation Four" });
    (association<Post>(author, "posts") as any).whereBang({ title: "mine" });

    await author.save();
    const authorId = author.id as number;
    const mine = await Post.create({ title: "mine", body: "1", author_id: authorId });
    const otherAuthor = await Author.create({ name: "Someone Else Three" });
    const theirs = await Post.create({ title: "mine", body: "2", author_id: otherAuthor.id });

    const posts = association<Post>(author, "posts") as any;
    expect(await posts.updateAll({ body: "updated" })).toBe(1);
    expect((await Post.find(mine.id)).body).toBe("updated");
    expect((await Post.find(theirs.id)).body).toBe("2");
  });

  it("counts against the persisted FK when read again after save", async () => {
    const author = new Author({ name: "Proxy Mutation Five" });
    expect(await (association<Post>(author, "posts") as any).count()).toBe(0);

    await author.save();
    const authorId = author.id as number;
    await Post.create({ title: "mine", body: "1", author_id: authorId });
    const otherAuthor = await Author.create({ name: "Someone Else Four" });
    await Post.create({ title: "theirs", body: "2", author_id: otherAuthor.id });

    const posts = association<Post>(author, "posts") as any;
    expect(await posts.count()).toBe(1);
    expect(await posts.size()).toBe(1);
  });

  it("resolves the persisted FK on touchAll invoked on the proxy after save", async () => {
    const ship = new Ship({ name: "Proxy Mutation Three" });
    const parts = association<ShipPart>(ship, "parts") as any;

    await ship.save();
    const shipId = ship.id as number;
    const stale = "2000-01-01T00:00:00Z";
    const mast = await ShipPart.create({ name: "mast", ship_id: shipId, updated_at: stale });

    expect(await parts.touchAll()).toBe(1);
    expect((await ShipPart.find(mast.id)).updated_at).not.toEqual(RubyTime.utc(2000, 1, 1));
  });
});

describe("CollectionProxy — a none-scoped association on a persisted owner", () => {
  const { tags } = fixtures(["tags", "taggings"]);

  it("still counts zero through the association scope", async () => {
    const tag = await Tag.find(tags("general").id);
    const nullTaggings = association(tag as any, "nullTaggings") as any;
    expect(tag.isNewRecord()).toBe(false);
    expect(await nullTaggings.count()).toBe(0);
    expect(await nullTaggings.size()).toBe(0);
  });
});

describe("CollectionProxy#find — in-memory not-found message fidelity", () => {
  const { companies } = fixtures(["companies"]);

  it("emits the pluralized aggregate message for a missing id in a loaded inverse_of collection", async () => {
    const firm = await Firm.find(companies("first_firm").id);
    const proxy = association<Base>(firm, "clientsOfFirm");
    const clients = await proxy.load();
    expect(clients.length).toBeGreaterThan(0);
    const realId = clients[0].id as number;

    try {
      await proxy.find([realId, 999999]);
      expect.fail("should have thrown");
    } catch (e) {
      const err = e as RecordNotFound;
      expect(err).toBeInstanceOf(RecordNotFound);
      const ph = `(\\?|\\$\\d+)`;
      expect(err.message).toMatch(
        new RegExp(
          `^Couldn't find all Clients with 'id': \\(${realId}, 999999\\) ` +
            `\\[WHERE .companies.\\..type. ` +
            `IN \\(${ph}, ${ph}, ${ph}, ${ph}\\) ` +
            `AND .companies.\\..client_of. = ${ph}\\] ` +
            `\\(found 1 results, but was looking for 2\\)\\.$`,
        ),
      );
    }
  });
});
