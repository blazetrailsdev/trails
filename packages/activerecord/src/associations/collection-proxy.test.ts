// Phase R.1: array-likeness on CollectionProxy / AssociationProxy.
//
// These tests exercise the additive surface that makes an
// AssociationProxy a drop-in for the Base[] reader collection
// associations return today. No reader change yet — these methods
// just exist on the proxy returned by `association(record, name)`.

import { describe, it, expect, beforeEach } from "vitest";
import { Base, association, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

describe("CollectionProxy — array-likeness (Phase R.1)", () => {
  let adapter: DatabaseAdapter;

  class ApBlog extends Base {
    declare name: string;
    declare apPosts: ApPost[];

    static {
      this.attribute("name", "string");
    }
  }

  class ApPost extends Base {
    declare apBlogId: number | null;
    declare title: string;

    static {
      this.attribute("title", "string");
      this.attribute("ap_blog_id", "integer");
    }
  }

  // hasMany must be set up after both classes exist so the inflection
  // can find ApPost in the model registry.
  ApBlog.hasMany("apPosts", { className: "ApPost" });

  beforeEach(() => {
    adapter = createTestAdapter();
    ApBlog.adapter = adapter;
    ApPost.adapter = adapter;
    registerModel(ApBlog);
    registerModel(ApPost);
  });

  async function blogWithPosts(): Promise<ApBlog> {
    const blog = new ApBlog({ name: "Dev" });
    await blog.save();
    for (const title of ["a", "b", "c"]) {
      const p = new ApPost({ title, ap_blog_id: blog.id as number });
      await p.save();
    }
    const proxy = association<ApPost>(blog, "apPosts");
    await proxy.load();
    return blog;
  }

  it("exposes `length` against the loaded target", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    expect(proxy.length).toBe(3);
  });

  it("shadows Relation#length() — use proxy.count() for async count", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts") as any;
    // `proxy.length` is now a sync number (mirrors Array / Rails).
    expect(typeof proxy.length).toBe("number");
    // For Relation's async count semantics, reach for .count() which still
    // routes through to Relation via AssociationProxy delegation.
    expect(typeof proxy.count).toBe("function");
    expect(await proxy.count()).toBe(3);
  });

  it("is iterable via `for ... of`", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    const titles: string[] = [];
    for (const p of proxy) titles.push(p.title);
    expect(titles).toEqual(["a", "b", "c"]);
  });

  it("supports numeric indexing (proxy[0]) — typed via the index signature", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    // No `as any` needed — AssociationProxy declares
    // `[index: number]: T | undefined` (the runtime support comes from
    // `wrapCollectionProxy`'s `get` trap). Out-of-range returns undefined.
    expect(proxy[0]?.title).toBe("a");
    expect(proxy[2]?.title).toBe("c");
    expect(proxy[99]).toBeUndefined();
  });

  it("at(index) returns the record or undefined", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    expect(proxy.at(0)?.title).toBe("a");
    expect(proxy.at(-1)?.title).toBe("c");
    expect(proxy.at(99)).toBeUndefined();
  });

  it("map / filter / forEach delegate to the target", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    expect(proxy.map((p) => p.title)).toEqual(["a", "b", "c"]);
    expect(proxy.filter((p) => p.title !== "b").map((p) => p.title)).toEqual(["a", "c"]);
    const seen: string[] = [];
    proxy.forEach((p) => seen.push(p.title));
    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("some / every work", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    expect(proxy.some((p) => p.title === "b")).toBe(true);
    expect(proxy.every((p) => p.title.length === 1)).toBe(true);
  });

  it("preserves Relation#includes (eager loading) — proxy.includes routes to Relation", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts") as any;
    const first = proxy.at(0)!;
    // CollectionProxy intentionally does NOT define an Array-style
    // includes — that would shadow Relation#includes(...associations).
    // proxy.includes(...) falls through to Relation and builds an
    // eager-loading Relation. Membership is via Array.from(proxy).
    const rel = proxy.includes("apPosts");
    expect(typeof rel?.where).toBe("function"); // it's a Relation, not a boolean
    expect(Array.from(proxy as Iterable<ApPost>).includes(first)).toBe(true);
    expect(proxy.target.includes(first)).toBe(true);
  });

  it("preserves Relation#values (query state) — proxy.values routes to Relation", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts") as any;
    // CollectionProxy intentionally does NOT define an Array-style
    // values() — that would shadow Relation#values which returns the
    // query-state Record<string, unknown>. Iteration is via
    // [Symbol.iterator] / spread / Array.from.
    const v = proxy.values();
    expect(typeof v).toBe("object");
    expect(Array.isArray(v)).toBe(false); // confirms it's not the array iterator
    expect([...(proxy as Iterable<ApPost>)].map((p) => p.title)).toEqual(["a", "b", "c"]);
  });

  it("slice returns a plain array shallow copy", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    const head = proxy.slice(0, 2);
    expect(head.map((p) => p.title)).toEqual(["a", "b"]);
    expect(Array.isArray(head)).toBe(true);
  });

  it("reduce composes over the target", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    const concatenated = proxy.reduce((acc, p) => acc + p.title, "");
    expect(concatenated).toBe("abc");
  });

  it("indexOf / flatMap work", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
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
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    const titles = [...proxy].map((p) => p.title);
    expect(titles).toEqual(["a", "b", "c"]);
  });

  it("Array.from reads the loaded target", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    expect(Array.from(proxy).length).toBe(3);
  });

  it("await still resolves to the loaded array (thenable preserved)", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    const arr = await proxy;
    expect(arr.map((p) => p.title)).toEqual(["a", "b", "c"]);
  });

  it("await proxy hydrates `_target` so subsequent sync ops work", async () => {
    // Build a blog/post pair WITHOUT pre-loading via blogWithPosts (which
    // calls .load()). `await proxy` alone should be enough to make
    // `proxy.length`, `proxy[0]`, iteration all work afterwards.
    const blog = new ApBlog({ name: "Fresh" });
    await blog.save();
    for (const title of ["x", "y"]) {
      const p = new ApPost({ title, ap_blog_id: blog.id as number });
      await p.save();
    }
    const proxy = association<ApPost>(blog, "apPosts") as any;
    await proxy;
    expect(proxy.length).toBe(2);
    expect(proxy[0]?.title).toBe("x");
    expect([...proxy].map((p: ApPost) => p.title)).toEqual(["x", "y"]);
  });

  it("keys / entries work (values intentionally not added)", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    expect([...proxy.keys()]).toEqual([0, 1, 2]);
    expect([...proxy.entries()].map(([i, p]) => `${i}:${p.title}`)).toEqual(["0:a", "1:b", "2:c"]);
  });

  it("array methods accept a thisArg (matches Array.prototype signatures)", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    const ctx = { suffix: "!" };
    const titles = proxy.map(function (this: { suffix: string }, p) {
      return p.title + this.suffix;
    }, ctx);
    expect(titles).toEqual(["a!", "b!", "c!"]);
  });

  it("reduce supports the no-initial overload (Array.prototype parity)", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    // Without an initial value, accumulator type is the element type (T).
    // Use `_loaded` as a sentinel to grab the first record then concatenate.
    const concat = proxy.reduce((acc, p) => {
      // ts-ignore the lie: we're concatenating titles for a string demo
      return { ...acc, title: (acc as ApPost).title + p.title } as ApPost;
    });
    expect(concat.title).toBe("abc");
  });

  it("Array.isArray returns false on the proxy (known limitation)", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts");
    // `Array.isArray` checks an internal slot that proxies cannot fake.
    // Consumers of the post-R.2 reader who branch on Array.isArray must
    // reach for the loaded target via `await` or `Array.from(...)`.
    expect(Array.isArray(proxy)).toBe(false);
    expect(Array.isArray(Array.from(proxy))).toBe(true);
  });

  it("preserves PK-lookup `find(id)` — Array-style find(predicate) intentionally not added", async () => {
    const blog = await blogWithPosts();
    const proxy = association<ApPost>(blog, "apPosts") as any;
    // CollectionProxy already defines `async find(id): Promise<T | T[]>`
    // (the Rails-style PK lookup form), and that's what `proxy.find(...)`
    // resolves to. We intentionally do NOT add an Array-style
    // `find(predicate)` overload — it would shadow the PK lookup.
    // For Array semantics use `Array.from(proxy).find(p => ...)`.
    const found = await proxy.find(blog.apPosts[0]?.id);
    expect(found?.title).toBe("a");
  });

  // ── Phase R.2 — collection reader returns the AssociationProxy ─────

  it("blog.apPosts is the AssociationProxy itself (Phase R.2 reader swap)", async () => {
    const blog = await blogWithPosts();
    // After Phase R.2, the collection reader returns the AssociationProxy
    // directly — no `association(blog, "apPosts")` indirection needed.
    // Same identity as what `association()` returns.
    const direct = (blog as any).apPosts;
    const helper = association<ApPost>(blog, "apPosts");
    expect(direct).toBe(helper);
  });

  it("blog.apPosts.where(...) chains through Relation delegation", async () => {
    const blog = await blogWithPosts();
    const reader = (blog as any).apPosts;
    // Chainable through the JS Proxy `get` trap → Relation delegation.
    const filtered = await reader.where({ title: "b" });
    expect(filtered.length).toBe(1);
    expect(filtered[0].title).toBe("b");
  });

  it("blog.apPosts is array-like via R.1 surface", async () => {
    const blog = await blogWithPosts();
    const reader = (blog as any).apPosts;
    expect(reader.length).toBe(3);
    expect(reader[0]?.title).toBe("a");
    expect(reader.map((p: ApPost) => p.title)).toEqual(["a", "b", "c"]);
    const titles: string[] = [];
    for (const p of reader as Iterable<ApPost>) titles.push(p.title);
    expect(titles).toEqual(["a", "b", "c"]);
  });

  it("writer `blog.apPosts = [...]` still flows through Association#writer", async () => {
    // R.2 only swapped the reader; the writer (defineWriters) is
    // untouched and still routes through `this.association(name).writer(value)`.
    const blog = await blogWithPosts();
    const replacement = new ApPost({ title: "z", ap_blog_id: blog.id as number });
    await replacement.save();
    (blog as any).apPosts = [replacement];
    // The proxy returned by the reader reflects the new target.
    const reader = (blog as any).apPosts;
    expect(reader.length).toBe(1);
    expect(reader[0]?.title).toBe("z");
  });
});
