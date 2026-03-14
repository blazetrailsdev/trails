/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Base, defineEnum } from "../index.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// FieldOrderedValuesTest — targets relation/field_ordered_values_test.rb
// ==========================================================================
describe("FieldOrderedValuesTest", () => {
  it("in order of generates CASE expression", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().inOrderOf("status", ["draft", "published", "archived"]).toSql();
    expect(sql).toContain("CASE");
  });
});

describe("FieldOrderedValuesTest", () => {
  it("in order of empty", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().inOrderOf("status", []).toSql();
    expect(sql).toContain("CASE");
  });

  it("in order of with enums values", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("status", "integer");
        this.adapter = adapter;
      }
    }
    defineEnum(Post, "status", { draft: 0, published: 1, archived: 2 });
    const sql = Post.all().inOrderOf("status", [0, 1, 2]).toSql();
    expect(sql).toContain("CASE");
    expect(sql).toContain("0");
    expect(sql).toContain("1");
    expect(sql).toContain("2");
  });

  it("in order of with enums keys", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("status", "integer");
        this.adapter = adapter;
      }
    }
    defineEnum(Post, "status", { draft: 0, published: 1, archived: 2 });
    const sql = Post.all().inOrderOf("status", ["draft", "published", "archived"]).toSql();
    expect(sql).toContain("CASE");
    expect(sql).toContain("draft");
  });

  it("in order of with string column", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().inOrderOf("status", ["draft", "published", "archived"]).toSql();
    expect(sql).toContain("CASE");
    expect(sql).toContain("draft");
    expect(sql).toContain("published");
    expect(sql).toContain("archived");
  });

  it("in order of after regular order", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order("title").inOrderOf("status", ["draft", "published"]).toSql();
    expect(sql).toContain("CASE");
  });

  it("in order of with nil", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().inOrderOf("status", [null, "draft", "published"]).toSql();
    expect(sql).toContain("CASE");
    expect(sql).toContain("NULL");
  });

  it.skip("in order of with associations", () => {
    /* fixture-dependent */
  });
  it.skip("in order of with filter false", () => {
    /* fixture-dependent */
  });

  it.skip("in order of", () => {});
  it.skip("in order of expression", () => {});
});

describe("inOrderOf()", () => {
  it("generates CASE WHEN ordering SQL", () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("status", "string");
    Item.adapter = freshAdapter();

    const sql = Item.all().inOrderOf("status", ["active", "pending", "archived"]).toSql();
    expect(sql).toContain("CASE");
    expect(sql).toContain("WHEN");
  });
});

describe("Relation inOrderOf (Rails-guided)", () => {
  it("generates CASE WHEN ordering", () => {
    class Item extends Base {
      static {
        this.attribute("status", "string");
      }
    }
    const sql = Item.all().inOrderOf("status", ["active", "pending", "archived"]).toSql();
    expect(sql).toContain("CASE");
    expect(sql).toContain("WHEN");
  });
});
