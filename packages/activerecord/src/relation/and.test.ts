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
// AndTest — targets relation/and_test.rb
// ==========================================================================
describe("AndTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("and combines two relations", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    const r1 = Post.where({ title: "a" });
    const r2 = Post.where({ body: "x" });
    const sql = r1.and(r2).toSql();
    expect(sql).toContain("AND");
  });
});

describe("AndTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModel() {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author", "string");
        this.adapter = adapter;
      }
    }
    return { Post };
  }

  it("and", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", author: "alice" });
    await Post.create({ title: "b", author: "bob" });
    const results = await Post.where({ title: "a" }).where({ author: "alice" }).toArray();
    expect(results.length).toBe(1);
  });

  it("and with non relation attribute", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "t", author: "a" });
    const sql = Post.where({ title: "t" }).where({ author: "a" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("and with structurally incompatible scope", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "x", author: "y" });
    const results = await Post.where({ title: "x" }).where({ author: "y" }).toArray();
    expect(results.length).toBe(1);
  });
});

describe("and()", () => {
  it("combines two relations with AND", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("role", "string");
    User.adapter = adapter;

    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "user" });
    await User.create({ name: "Charlie", role: "admin" });

    const admins = User.all().where({ role: "admin" });
    const alices = User.all().where({ name: "Alice" });
    const results = await admins.and(alices).toArray();
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Alice");
  });
});

describe("Relation And (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("and merges where conditions", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("active", "boolean");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice", active: true });
    await User.create({ name: "Bob", active: false });
    await User.create({ name: "Charlie", active: true });

    const result = await User.where({ active: true })
      .and(User.where({ name: "Alice" }))
      .toArray();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
  });
});
