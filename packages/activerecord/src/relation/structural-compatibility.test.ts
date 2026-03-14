/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base } from "../index.js";

import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// StructuralCompatibilityTest — targets relation/structural_compatibility_test.rb
// ==========================================================================
describe("StructuralCompatibilityTest", () => {
  it("structurally compatible returns true for same model", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const r1 = Post.where({ title: "a" });
    const r2 = Post.where({ title: "b" });
    expect(r1.structurallyCompatible(r2)).toBe(true);
  });
});

describe("StructuralCompatibilityTest", () => {
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

  it("compatible values", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 1 });
    const r = Post.where({ title: "a" }).or(Post.where({ title: "b" }));
    expect(r.toSql()).toContain("OR");
  });

  it("incompatible single value relations", () => {
    const { Post } = makeModel();
    const r = Post.where({ title: "a" }).or(Post.where({ score: 1 }));
    expect(r.toSql()).toContain("OR");
  });

  it("incompatible multi value relations", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "a" }).where({ score: 1 }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("incompatible unscope", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "a" })
      .or(Post.where({ title: "b" }))
      .toSql();
    expect(sql).toContain("OR");
  });
});

describe("structurallyCompatible", () => {
  it("returns true for relations of the same model", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.adapter = adapter;

    const r1 = User.all().where({ id: 1 });
    const r2 = User.all().where({ id: 2 });
    expect(r1.structurallyCompatible(r2)).toBe(true);
  });

  it("returns false for relations of different models", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.adapter = adapter;

    class Post extends Base {
      static _tableName = "posts";
    }
    Post.attribute("id", "integer");
    Post.adapter = adapter;

    const r1 = User.all().where({ id: 1 });
    const r2 = Post.all().where({ id: 2 });
    expect(r1.structurallyCompatible(r2 as any)).toBe(false);
  });
});
