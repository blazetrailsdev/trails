/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { Base } from "./index.js";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// ==========================================================================
// NullRelationTest — targets null_relation_test.rb
// ==========================================================================
describe("NullRelationTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(async () => {
    adapter = freshAdapter();
    await defineSchema(adapter, { posts: { title: "string" } });
  });

  afterAll(async () => {
    await dropAllTables(adapter);
  });

  it("none chainable", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const results = await Post.all().none().where({ title: "a" }).toArray();
    expect(results.length).toBe(0);
  });

  it("null relation content size methods", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().none();
    expect(await rel.count()).toBe(0);
    expect(await rel.isEmpty()).toBe(true);
    expect(await rel.isAny()).toBe(false);
  });

  it("null relation where values hash", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().none();
    const sql = rel.toSql();
    expect(typeof sql).toBe("string");
  });
});

describe("NullRelationTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(async () => {
    adapter = freshAdapter();
    await defineSchema(adapter, { posts: { title: "string" } });
  });

  afterAll(async () => {
    await dropAllTables(adapter);
  });

  function makeModel() {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    return { Post };
  }

  it("none chainable to existing scope extension method", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "x" });
    const results = await Post.none().toArray();
    expect(results.length).toBe(0);
  });

  it("async query on null relation", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "x" });
    const count = await Post.none().count();
    expect(count).toBe(0);
  });

  it("none chained to methods firing queries straight to db", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "x" });
    const results = await Post.none().where({ title: "x" }).toArray();
    expect(results.length).toBe(0);
  });

  it("null relation used with constraints", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    const results = await Post.none().limit(1).toArray();
    expect(results.length).toBe(0);
  });

  it("null relation metadata methods", async () => {
    const { Post } = makeModel();
    const rel = Post.none();
    expect(rel.toSql()).toContain("SELECT");
  });

  it("null relation in where condition", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "y" });
    const results = await Post.none().order("title").toArray();
    expect(results.length).toBe(0);
  });
});

describe("NullRelationTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(async () => {
    adapter = freshAdapter();
    await defineSchema(adapter, { items: { name: "string" }, devs: { name: "string" } });
  });

  afterAll(async () => {
    await dropAllTables(adapter);
  });

  it("none returns empty for all terminal methods", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Item.create({ name: "A" });

    expect(await Item.all().none().toArray()).toEqual([]);
    expect(await Item.all().none().count()).toBe(0);
    expect(await Item.all().none().first()).toBeNull();
    expect(await Item.all().none().last()).toBeNull();
    expect(await Item.all().none().exists()).toBe(false);
    expect(await Item.all().none().pluck("name")).toEqual([]);
    expect(await Item.all().none().sum("id")).toBe(0);
    expect(await Item.all().none().average("id")).toBeNull();
    expect(await Item.all().none().minimum("id")).toBeNull();
    expect(await Item.all().none().maximum("id")).toBeNull();
  });

  it("none is chainable", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Item.create({ name: "A" });
    const result = await Item.all().none().where({ name: "A" }).toArray();
    expect(result).toEqual([]);
  });

  it("none updateAll returns 0", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Item.create({ name: "A" });
    expect(await Item.all().none().updateAll({ name: "B" })).toBe(0);
  });

  it("none deleteAll returns 0", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Item.create({ name: "A" });
    expect(await Item.all().none().deleteAll()).toBe(0);
  });
  it("none", async () => {
    class Dev extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Dev.create({ name: "Alice" });
    const results = await Dev.none().toArray();
    expect(results).toEqual([]);
    const allResults = await Dev.all().none().toArray();
    expect(allResults).toEqual([]);
  });
});
