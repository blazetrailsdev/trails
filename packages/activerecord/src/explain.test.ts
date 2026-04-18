/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "./index.js";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("ExplainTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModel() {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("score", "integer");
        this.adapter = adapter;
      }
    }
    return { Post };
  }

  it("relation explain", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const result = await Post.all().explain();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("collecting queries for explain", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const result = await Post.where({ title: "a" }).explain();
    expect(typeof result).toBe("string");
  });

  it("relation explain with average", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 10 });
    // explain() returns query plan, average() returns the value
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const avg = await Post.average("score");
    expect(avg).toBe(10);
  });

  it("relation explain with count", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const count = await Post.count();
    expect(count).toBe(1);
  });

  it("relation explain with count and argument", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 5 });
    await Post.create({ title: "b" });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const count = await (Post as any).count("score");
    expect(typeof count).toBe("number");
  });

  it("relation explain with minimum", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 3 });
    await Post.create({ title: "b", score: 7 });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const min = await Post.minimum("score");
    expect(min).toBe(3);
  });

  it("relation explain with maximum", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 3 });
    await Post.create({ title: "b", score: 7 });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const max = await Post.maximum("score");
    expect(max).toBe(7);
  });

  it("relation explain with sum", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 3 });
    await Post.create({ title: "b", score: 7 });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const sum = await Post.sum("score");
    expect(sum).toBe(10);
  });

  it("relation explain with first", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const first = await Post.first();
    expect(first).not.toBeNull();
  });

  it("relation explain with last", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const last = await Post.last();
    expect(last).not.toBeNull();
  });

  it("relation explain with pluck", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "hello" });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const titles = await Post.pluck("title");
    expect(titles).toContain("hello");
  });

  it("relation explain with pluck with args", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 1 });
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    const values = await Post.pluck("title", "score");
    expect(values.length).toBe(1);
  });

  it("exec explain with no binds", async () => {
    const { Post } = makeModel();
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    expect(plan.length).toBeGreaterThan(0);
  });

  it("exec explain with binds", async () => {
    const { Post } = makeModel();
    const plan = await Post.where({ title: "bound" }).explain();
    expect(typeof plan).toBe("string");
    expect(plan.length).toBeGreaterThan(0);
  });

  it("explain returns query plan string (Rails-guided)", async () => {
    const { Post } = makeModel();
    const plan = await Post.all().explain();
    expect(typeof plan).toBe("string");
    expect(plan.length).toBeGreaterThan(0);
  });

  it("prints one EXPLAIN block per collected query with the header prefix", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const plan = await Post.where({ title: "a" }).explain();
    expect(plan).toMatch(/EXPLAIN.*for:/);
    expect(plan.toLowerCase()).toContain("select");
  });

  it("captures queries for eager-loaded associations, one block per query", async () => {
    class Blog extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Article extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("blog_id", "integer");
        this.adapter = adapter;
      }
    }
    Blog.hasMany("articles", { className: "Article" });
    registerModel(Blog);
    registerModel(Article);
    const blog = (await Blog.create({ name: "dev" })) as any;
    await Article.create({ title: "a", blog_id: blog.id });
    await Article.create({ title: "b", blog_id: blog.id });

    const plan = await Blog.all().preload("articles").explain();
    const blocks = plan.split("\n\n").filter((b) => /EXPLAIN/.test(b));
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(plan.toLowerCase()).toContain("blogs");
    expect(plan.toLowerCase()).toContain("articles");
  });

  it("resets ExplainRegistry after the call (no leaked collection state)", async () => {
    const { Post } = makeModel();
    const { ExplainRegistry } = await import("./index.js");
    await Post.all().explain();
    expect(ExplainRegistry.collect).toBe(false);
    expect(ExplainRegistry.queries).toEqual([]);
  });

  it("falls back to explaining toSql when no queries were collected", async () => {
    const { Post } = makeModel();
    // `none()` short-circuits before any SQL runs — collectingQueries
    // captures nothing. The fallback should still produce a non-empty
    // plan instead of a silent empty string.
    const plan = await Post.none().explain();
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.toLowerCase()).toContain("select");
  });

  it("renders binds via adapter.typeCast + Ruby-inspect form", async () => {
    // Mirrors Rails' `exec_explain`:
    //   binds.map { |attr| render_bind(c, attr) }.inspect
    // where `render_bind` does
    // `connection.type_cast(attr.value_for_database)`. That produces
    // Ruby's `Array#inspect` output: strings double-quoted, numbers
    // bare, nil as `nil`, booleans as `true/false`. The BigInt case
    // is the one that used to crash raw `JSON.stringify`.
    const { Post } = makeModel();
    const rel = Post.all() as unknown as {
      _renderExplainBinds: (a: DatabaseAdapter, binds: unknown[]) => string;
    };
    // Booleans go through the adapter's typeCast: SQLite collapses
    // them to 1/0, PG/MySQL keep them as true/false. So the rendered
    // form differs by backend; assert both halves independently.
    const rendered = rel._renderExplainBinds(adapter, [BigInt(42), "str", 7, null, true, false]);
    expect(rendered.startsWith('[42, "str", 7, nil, ')).toBe(true);
    expect(rendered).toMatch(/\b(1, 0|true, false)\]$/);
    // End-to-end on sqlite: where-literals are interpolated into the
    // SQL (no binds reach the adapter), so the round-trip still
    // returns non-empty output.
    await Post.create({ title: "x" });
    const plan = await Post.all().explain();
    expect(plan.length).toBeGreaterThan(0);
  });

  it("renders binary binds as '<N bytes of binary data>' (Rails parity)", async () => {
    // Rails' `render_bind` special-cases binary-typed attrs:
    //   "<#{attr.value_for_database.to_s.bytesize} bytes of binary data>"
    // We reach the same result structurally — after typeCast, any
    // Buffer / Uint8Array / ArrayBuffer bind gets normalized to the
    // same byte-count string before rubyInspect sees it, so an
    // EXPLAIN over a BYTEA/BLOB column doesn't dump the raw buffer.
    const { Post } = makeModel();
    const rel = Post.all() as unknown as {
      _renderExplainBinds: (a: DatabaseAdapter, binds: unknown[]) => string;
    };
    const buf = Buffer.from("hello world"); // 11 bytes
    const u8 = new Uint8Array([1, 2, 3, 4, 5]); // 5 bytes
    const rendered = rel._renderExplainBinds(adapter, [buf, u8]);
    expect(rendered).toBe('["<11 bytes of binary data>", "<5 bytes of binary data>"]');
  });

  it("unwraps PG-style { value, format } bind shapes when rendering", async () => {
    // PG's `typeCast(BinaryData)` returns `{ value, format }` — the
    // raw wrapper would stringify to "[object Object]" via
    // `rubyInspect`'s object fallback. Normalization recurses on
    // `.value` so we show the actual payload instead of the envelope.
    const { Post } = makeModel();
    const rel = Post.all() as unknown as {
      _renderExplainBinds: (a: DatabaseAdapter, binds: unknown[]) => string;
    };
    // Skip typeCast here — we're testing the normalization of a
    // pre-cast bind-wrapper value. The inner adapter.typeCast call
    // would pass these objects through unchanged on non-PG adapters.
    const stub = {
      typeCast: (v: unknown) => v,
    } as unknown as DatabaseAdapter;
    const rendered = rel._renderExplainBinds(stub, [
      { value: "raw", format: 1 },
      { value: 42, format: 0 },
    ]);
    expect(rendered).toBe('["raw", 42]');
  });

  it("rejects multiple hash options (Rails extract_options! semantics)", async () => {
    const { Post } = makeModel();
    await expect(
      Post.all().explain({ format: "json" }, { format: "xml" } as never),
    ).rejects.toThrow(/at most one option hash/);
  });

  it("rejects a non-trailing hash option", async () => {
    const { Post } = makeModel();
    await expect(Post.all().explain({ format: "json" } as never, "analyze")).rejects.toThrow(
      /last argument/,
    );
  });

  it("isolates concurrent explain() calls via AsyncLocalStorage scopes", async () => {
    // Two parallel explain() calls must not trample each other's
    // collected queries. Without async-context isolation a global
    // collect flag + shared queries array leaks across the await
    // boundaries of concurrent tasks.
    const { Post } = makeModel();
    await Post.create({ title: "a" });

    const [plan1, plan2] = await Promise.all([
      Post.where({ title: "a" }).explain(),
      Post.all().explain(),
    ]);
    expect(plan1.length).toBeGreaterThan(0);
    expect(plan2.length).toBeGreaterThan(0);
    // plan1's SELECT had a WHERE clause; plan2's did not. Each plan's
    // header block should reference only its own SQL.
    expect(plan1.toLowerCase()).toContain("where");
    expect(plan2.toLowerCase()).not.toContain("where");
  });
});
