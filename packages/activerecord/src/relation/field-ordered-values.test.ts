/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect } from "vitest";
import { Base, defineEnum } from "../index.js";

import { createSidecarTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createSidecarTestAdapter().adapter;
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
    // Rails: return spawn.none! if values.empty? — produces WHERE (1=0), no CASE.
    const sql = Post.all().inOrderOf("status", []).toSql();
    expect(sql).toContain("1=0");
    expect(sql).not.toContain("CASE");
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
    // BLOCKED: relation — Relation API gap in field-ordered-values
    // ROOT-CAUSE: relation/field-ordered-values.ts or relation.ts missing Rails parity for this query feature
    // SCOPE: ~30–100 LOC fix in relation/; affects ~10–39 tests in field-ordered-values.test.ts
    /* fixture-dependent */
  });
  it.skip("in order of with filter false", () => {
    // BLOCKED: relation — Relation API gap in field-ordered-values
    // ROOT-CAUSE: relation/field-ordered-values.ts or relation.ts missing Rails parity for this query feature
    // SCOPE: ~30–100 LOC fix in relation/; affects ~10–39 tests in field-ordered-values.test.ts
    /* fixture-dependent */
  });

  it.skip("in order of", () => {
    // BLOCKED: relation — Relation API gap in field-ordered-values
    // ROOT-CAUSE: relation/field-ordered-values.ts or relation.ts missing Rails parity for this query feature
    // SCOPE: ~30–100 LOC fix in relation/; affects ~10–39 tests in field-ordered-values.test.ts
  });
  it.skip("in order of expression", () => {
    // BLOCKED: relation — Relation API gap in field-ordered-values
    // ROOT-CAUSE: relation/field-ordered-values.ts or relation.ts missing Rails parity for this query feature
    // SCOPE: ~30–100 LOC fix in relation/; affects ~10–39 tests in field-ordered-values.test.ts
  });
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
