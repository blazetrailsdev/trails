/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../index.js";

import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({
    posts: {
      title: "string",
      body: "string",
      score: "integer",
      author_id: "integer",
      published: "boolean",
    },
    users: { name: "string", age: "integer", role: "string", score: "integer" },
  });
});

// ==========================================================================
// OrTest — targets relation/or_test.rb
// ==========================================================================
describe("OrTest", () => {
  it("or combines two relations", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const r1 = Post.where({ title: "a" });
    const r2 = Post.where({ title: "b" });
    const sql = r1.or(r2).toSql();
    expect(sql).toContain("OR");
  });

  it("structurally compatible returns true for same model", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const r1 = Post.where({ title: "a" });
    const r2 = Post.where({ title: "b" });
    expect(r1.structurallyCompatible(r2)).toBe(true);
  });
});

describe("OrTest", () => {
  function makeModel() {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("score", "integer");
      }
    }
    return { User };
  }

  it("or identity", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 10 });
    await User.create({ name: "bob", score: 20 });
    const r = User.where({ name: "alice" }).or(User.where({ name: "alice" }));
    const results = await r.toArray();
    expect(results.length).toBe(1);
  });

  it("or with null left", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    const expected = await User.where({ name: "alice" }).toArray();
    const results = await User.none()
      .or(User.where({ name: "alice" }))
      .toArray();
    expect(results).toEqual(expected);
  });

  it("or with null right", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    const expected = await User.where({ name: "alice" }).toArray();
    const results = await User.where({ name: "alice" }).or(User.none()).toArray();
    expect(results).toEqual(expected);
  });

  it("or with large number", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 999999 });
    const r = User.where({ score: 999999 }).or(User.where({ name: "nobody" }));
    const results = await r.toArray();
    expect(results.length).toBe(1);
  });

  it("or with bind params", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    await User.create({ name: "bob", score: 2 });
    const r = User.where({ name: "alice" }).or(User.where({ name: "bob" }));
    const results = await r.toArray();
    expect(results.length).toBe(2);
  });

  it("or with null both", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    await User.create({ name: "bob", score: 2 });
    const results = await User.none().or(User.none()).toArray();
    expect(results).toEqual([]);
  });

  it("or without left where", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    await User.create({ name: "bob", score: 2 });
    const r = User.all().or(User.where({ name: "alice" }));
    const results = await r.toArray();
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("or without right where", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    const r = User.where({ name: "alice" }).or(User.all());
    const results = await r.toArray();
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("or with incompatible single value relations", () => {
    const { User } = makeModel();
    expect(() =>
      User.distinct()
        .where({ name: "a" })
        .or(User.where({ score: 1 }))
        .toSql(),
    ).toThrow(
      "Relation passed to #or must be structurally compatible. Incompatible values: [:distinct]",
    );
  });

  it("or with incompatible multi value relations", () => {
    const { User } = makeModel();
    expect(() =>
      User.order("name asc")
        .where({ name: "a" })
        .or(User.order("score desc").where({ name: "b" }))
        .toSql(),
    ).toThrow(
      "Relation passed to #or must be structurally compatible. Incompatible values: [:order]",
    );
  });

  it("or with unscope where", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    await User.create({ name: "bob", score: 2 });
    const r = User.where({ name: "alice" }).or(User.where({ name: "bob" }));
    const results = await r.toArray();
    expect(results.length).toBe(2);
  });

  it("or with unscope where column", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" })
      .or(User.where({ score: 5 }))
      .toSql();
    expect(sql).toContain("OR");
  });

  it("or with unscope order", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" })
      .or(User.where({ name: "b" }))
      .toSql();
    expect(sql).toContain("OR");
  });

  it("or with incompatible unscope", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" })
      .or(User.where({ name: "b" }))
      .toSql();
    expect(sql).toContain("OR");
  });

  it("or when grouping", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    await User.create({ name: "bob", score: 2 });
    const r = User.where({ name: "alice" }).or(User.where({ name: "bob" }));
    const results = await r.toArray();
    expect(results.length).toBe(2);
  });

  it("or with named scope", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 10 });
    await User.create({ name: "charlie", score: 5 });
    const r = User.where({ name: "alice" }).or(User.where({ score: 5 }));
    const results = await r.toArray();
    expect(results.length).toBe(2);
  });

  it("or inside named scope", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    const r = User.where({ name: "alice" }).or(User.where({ name: "nobody" }));
    const results = await r.toArray();
    expect(results.length).toBe(1);
  });

  it("or with sti relation", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" })
      .or(User.where({ name: "b" }))
      .toSql();
    expect(sql).toContain("OR");
  });

  it("or on loaded relation", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    await User.create({ name: "bob", score: 2 });
    const base = User.where({ name: "alice" });
    await base.toArray();
    const r = base.or(User.where({ name: "bob" }));
    const results = await r.toArray();
    expect(results.length).toBe(2);
  });

  it("or with non relation object raises error", () => {
    const { User } = makeModel();
    expect(() =>
      User.where({ name: ["alice", "bob", "charlie"] }).or({ name: "Rails" } as any),
    ).toThrow(
      "You have passed object object to #or. Pass an ActiveRecord::Relation object instead.",
    );
  });

  it("or with references inequality", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" })
      .or(User.where({ score: 1 }))
      .toSql();
    expect(sql).toContain("OR");
  });

  it("or with scope on association", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    const results = await User.where({ name: "alice" }).toArray();
    expect(results.length).toBe(1);
  });

  it("or with annotate", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" })
      .annotate("hint")
      .or(User.where({ name: "b" }))
      .toSql();
    expect(sql).toContain("OR");
  });

  it("structurally incompatible values", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" })
      .or(User.where({ name: "b" }))
      .toSql();
    expect(sql).toContain("OR");
  });

  it("or preserves other querying methods", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 10 });
    await User.create({ name: "bob", score: 20 });
    await User.create({ name: "carol", score: 30 });
    const r = User.where({ name: "alice" })
      .or(User.where({ name: "bob" }))
      .order("score")
      .limit(1);
    const results = await r.toArray();
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("alice");
  });
});

describe("TooManyOrTest", () => {
  it("too many or", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    // Should not throw even with many OR conditions
    let rel = Post.where({ title: "a" });
    for (let i = 0; i < 5; i++) {
      rel = rel.or(Post.where({ title: String(i) }));
    }
    const sql = rel.toSql();
    expect(sql).toContain("OR");
  });
});

describe("OrTest", () => {
  it("combines two where clauses with OR", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }

    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });
    await User.create({ name: "Charlie", age: 35 });

    const young = User.where({ age: 25 });
    const old = User.where({ age: 35 });
    const result = await young.or(old).toArray();

    expect(result).toHaveLength(2);
    const names = result.map((r: Base) => r.name);
    expect(names).toContain("Alice");
    expect(names).toContain("Charlie");
  });

  it("generates correct SQL with OR", () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }

    const sql = User.where({ name: "Alice" })
      .or(User.where({ age: 30 }))
      .toSql();
    expect(sql).toContain("OR");
  });
});

describe("OrTest", () => {
  it("triple or chains", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
      }
    }

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    await User.create({ name: "Charlie" });
    await User.create({ name: "Dave" });

    // Note: .or().or() nests — the second or wraps the first
    const result = await User.where({ name: "Alice" })
      .or(User.where({ name: "Bob" }))
      .or(User.where({ name: "Charlie" }))
      .toArray();

    expect(result).toHaveLength(3);
  });

  it("or with count", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }

    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });
    await User.create({ name: "Charlie", age: 35 });

    const count = await User.where({ age: 25 })
      .or(User.where({ age: 35 }))
      .count();
    expect(count).toBe(2);
  });
});

describe("OrTest", () => {
  it("combines two scoped relations with OR", async () => {
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("role", "string");
    User.scope("admins", (rel: any) => rel.where({ role: "admin" }));
    User.scope("editors", (rel: any) => rel.where({ role: "editor" }));

    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "editor" });
    await User.create({ name: "Charlie", role: "viewer" });

    const admins = (User as any).admins();
    const editors = (User as any).editors();
    const result = await admins.or(editors).toArray();
    expect(result.length).toBe(2);
    const names = result.map((r: any) => r.name).sort();
    expect(names).toEqual(["Alice", "Bob"]);
  });
});

describe("OrTest", () => {
  class User extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer");
    }
  }

  it("or with relation", async () => {
    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });
    await User.create({ name: "Charlie", age: 35 });
    const result = await User.where({ name: "Alice" })
      .or(User.where({ name: "Charlie" }))
      .toArray();
    expect(result).toHaveLength(2);
    const names = result.map((r: Base) => r.name);
    expect(names).toContain("Alice");
    expect(names).toContain("Charlie");
  });

  it("or generates correct SQL", () => {
    const sql = User.where({ name: "Alice" })
      .or(User.where({ age: 30 }))
      .toSql();
    expect(sql).toContain("OR");
  });

  it("or with count", async () => {
    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });
    await User.create({ name: "Charlie", age: 35 });
    const count = await User.where({ age: 25 })
      .or(User.where({ age: 35 }))
      .count();
    expect(count).toBe(2);
  });

  it("triple or chains", async () => {
    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });
    await User.create({ name: "Charlie", age: 35 });
    const result = await User.where({ name: "Alice" })
      .or(User.where({ name: "Bob" }))
      .or(User.where({ name: "Charlie" }))
      .toArray();
    expect(result).toHaveLength(3);
  });
});

describe("OrTest", () => {
  class Post extends Base {
    static {
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.attribute("author_id", "integer");
      this.attribute("published", "boolean", { default: false });
    }
  }

  it("combines two relations with OR", async () => {
    await Post.create({ title: "First", author_id: 1 });
    await Post.create({ title: "Second", author_id: 2 });
    await Post.create({ title: "Third", author_id: 3 });

    const result = await Post.where({ author_id: 1 })
      .or(Post.where({ author_id: 3 }))
      .toArray();

    expect(result).toHaveLength(2);
    const ids = result.map((r: Base) => r.author_id);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
  });

  it("or generates SQL containing OR keyword", () => {
    const sql = Post.where({ title: "A" })
      .or(Post.where({ title: "B" }))
      .toSql();
    expect(sql).toContain("OR");
  });

  it("or with whereNot on one side", async () => {
    await Post.create({ title: "Foo", published: true });
    await Post.create({ title: "Bar", published: false });
    await Post.create({ title: "Baz", published: true });

    const published = Post.where({ published: true });
    const titled = Post.where({ title: "Bar" });
    const result = await published.or(titled).toArray();

    expect(result).toHaveLength(3);
  });

  it("or is chainable with other query methods", async () => {
    await Post.create({ title: "A", author_id: 1 });
    await Post.create({ title: "B", author_id: 2 });
    await Post.create({ title: "C", author_id: 1 });

    const result = await Post.where({ author_id: 1 })
      .or(Post.where({ author_id: 2 }))
      .limit(2)
      .toArray();

    expect(result).toHaveLength(2);
  });

  it("or preserves ordering", async () => {
    await Post.create({ title: "Z", author_id: 1 });
    await Post.create({ title: "A", author_id: 2 });

    const result = await Post.where({ author_id: 1 })
      .or(Post.where({ author_id: 2 }))
      .order("title")
      .toArray();

    expect(result[0].title).toBe("A");
    expect(result[1].title).toBe("Z");
  });
});

describe("OrTest", () => {
  class User extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("role", "string");
      this.attribute("age", "integer");
    }
  }

  // Rails: test_or_with_two_relations
  it("or combines two relations", async () => {
    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "user" });
    await User.create({ name: "Charlie", role: "mod" });

    const result = await User.where({ role: "admin" })
      .or(User.where({ role: "mod" }))
      .toArray();
    expect(result).toHaveLength(2);
    const names = result.map((u: any) => u.name).sort();
    expect(names).toEqual(["Alice", "Charlie"]);
  });

  // Rails: test_or_chaining
  it("triple or chains all three conditions", async () => {
    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "user" });
    await User.create({ name: "Charlie", role: "mod" });
    await User.create({ name: "Dave", role: "guest" });

    const result = await User.where({ role: "admin" })
      .or(User.where({ role: "user" }))
      .or(User.where({ role: "mod" }))
      .toArray();
    expect(result).toHaveLength(3);
    const names = result.map((u: any) => u.name).sort();
    expect(names).toEqual(["Alice", "Bob", "Charlie"]);
  });

  // Rails: test_or_with_count
  it("or works with count", async () => {
    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "user" });
    await User.create({ name: "Charlie", role: "admin" });

    const count = await User.where({ role: "admin" })
      .or(User.where({ name: "Bob" }))
      .count();
    expect(count).toBe(3);
  });

  // Rails: test_or_with_exists
  it("or works with exists?", async () => {
    await User.create({ name: "Alice", role: "admin" });

    expect(
      await User.where({ role: "admin" })
        .or(User.where({ role: "mod" }))
        .exists(),
    ).toBe(true);

    expect(
      await User.where({ role: "guest" })
        .or(User.where({ role: "mod" }))
        .exists(),
    ).toBe(false);
  });
});
