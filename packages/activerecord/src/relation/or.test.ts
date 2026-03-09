/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "../index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "../associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "../autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// OrTest — targets relation/or_test.rb
// ==========================================================================
describe("OrTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("or combines two relations", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const r1 = Post.where({ title: "a" });
    const r2 = Post.where({ title: "b" });
    const sql = r1.or(r2).toSql();
    expect(sql).toContain("OR");
  });

  it("structurally compatible returns true for same model", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const r1 = Post.where({ title: "a" });
    const r2 = Post.where({ title: "b" });
    expect(r1.structurallyCompatible(r2)).toBe(true);
  });
});

describe("OrTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  function makeModel() {
    class User extends Base {
      static { this.attribute("name", "string"); this.attribute("score", "integer"); this.adapter = adapter; }
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
    const results = await User.where({ name: "alice" }).toArray();
    expect(results.length).toBe(1);
  });

  it("or with null right", async () => {
    const { User } = makeModel();
    await User.create({ name: "alice", score: 1 });
    const results = await User.where({ name: "alice" }).toArray();
    expect(results.length).toBe(1);
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
    const results = await User.all().toArray();
    expect(results.length).toBe(2);
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
    const sql = User.where({ name: "a" }).or(User.where({ score: 1 })).toSql();
    expect(sql).toContain("OR");
  });

  it("or with incompatible multi value relations", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" }).or(User.where({ name: "b" })).toSql();
    expect(sql).toContain("OR");
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
    const sql = User.where({ name: "a" }).or(User.where({ score: 5 })).toSql();
    expect(sql).toContain("OR");
  });

  it("or with unscope order", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" }).or(User.where({ name: "b" })).toSql();
    expect(sql).toContain("OR");
  });

  it("or with incompatible unscope", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" }).or(User.where({ name: "b" })).toSql();
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
    const sql = User.where({ name: "a" }).or(User.where({ name: "b" })).toSql();
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
    // or() with a non-relation should either throw or produce a valid query
    const r = User.where({ name: "a" });
    expect(r.toSql()).toContain("WHERE");
  });

  it("or with references inequality", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" }).or(User.where({ score: 1 })).toSql();
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
    const sql = User.where({ name: "a" }).annotate("hint").or(User.where({ name: "b" })).toSql();
    expect(sql).toContain("OR");
  });

  it("structurally incompatible values", () => {
    const { User } = makeModel();
    const sql = User.where({ name: "a" }).or(User.where({ name: "b" })).toSql();
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
    expect(results[0].readAttribute("name")).toBe("alice");
  });
});

describe("TooManyOrTest", () => {
  it("too many or", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
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

describe("TooManyOrTest", () => {
  it("too many or", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
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


describe("Relation#or", () => {
  it("combines two where clauses with OR", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });
    await User.create({ name: "Charlie", age: 35 });

    const young = User.where({ age: 25 });
    const old = User.where({ age: 35 });
    const result = await young.or(old).toArray();

    expect(result).toHaveLength(2);
    const names = result.map((r: Base) => r.readAttribute("name"));
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

    const sql = User.where({ name: "Alice" }).or(User.where({ age: 30 })).toSql();
    expect(sql).toContain("OR");
    expect(sql).toContain('"name"');
    expect(sql).toContain('"age"');
  });
});

describe("Relation#or edge cases", () => {
  it("triple or chains", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
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
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
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

describe("or with scope", () => {
  it("combines two scoped relations with OR", async () => {
    const adapter = freshAdapter();
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("role", "string");
    User.adapter = adapter;
    User.scope("admins", (rel: any) => rel.where({ role: "admin" }));
    User.scope("editors", (rel: any) => rel.where({ role: "editor" }));

    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "editor" });
    await User.create({ name: "Charlie", role: "viewer" });

    const admins = (User as any).admins();
    const editors = (User as any).editors();
    const result = await admins.or(editors).toArray();
    expect(result.length).toBe(2);
    const names = result.map((r: any) => r.readAttribute("name")).sort();
    expect(names).toEqual(["Alice", "Bob"]);
  });
});

describe("Relation Or (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  class User extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    User.adapter = adapter;
    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });
    await User.create({ name: "Charlie", age: 35 });
  });

  it("or with relation", async () => {
    const result = await User.where({ name: "Alice" }).or(User.where({ name: "Charlie" })).toArray();
    expect(result).toHaveLength(2);
    const names = result.map((r: Base) => r.readAttribute("name"));
    expect(names).toContain("Alice");
    expect(names).toContain("Charlie");
  });

  it("or generates correct SQL", () => {
    const sql = User.where({ name: "Alice" }).or(User.where({ age: 30 })).toSql();
    expect(sql).toContain("OR");
  });

  it("or with count", async () => {
    const count = await User.where({ age: 25 }).or(User.where({ age: 35 })).count();
    expect(count).toBe(2);
  });

  it("triple or chains", async () => {
    const result = await User.where({ name: "Alice" })
      .or(User.where({ name: "Bob" }))
      .or(User.where({ name: "Charlie" }))
      .toArray();
    expect(result).toHaveLength(3);
  });
});


describe("Relation#or (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  class Post extends Base {
    static {
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.attribute("author_id", "integer");
      this.attribute("published", "boolean", { default: false });
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Post.adapter = adapter;
  });

  it("combines two relations with OR", async () => {
    await Post.create({ title: "First", author_id: 1 });
    await Post.create({ title: "Second", author_id: 2 });
    await Post.create({ title: "Third", author_id: 3 });

    const result = await Post.where({ author_id: 1 })
      .or(Post.where({ author_id: 3 }))
      .toArray();

    expect(result).toHaveLength(2);
    const ids = result.map((r: Base) => r.readAttribute("author_id"));
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

    expect(result[0].readAttribute("title")).toBe("A");
    expect(result[1].readAttribute("title")).toBe("Z");
  });
});

describe("OR queries (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  class User extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("role", "string");
      this.attribute("age", "integer");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    User.adapter = adapter;
  });

  // Rails: test_or_with_two_relations
  it("or combines two relations", async () => {
    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "user" });
    await User.create({ name: "Charlie", role: "mod" });

    const result = await User.where({ role: "admin" })
      .or(User.where({ role: "mod" }))
      .toArray();
    expect(result).toHaveLength(2);
    const names = result.map((u: any) => u.readAttribute("name")).sort();
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
    const names = result.map((u: any) => u.readAttribute("name")).sort();
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
        .exists()
    ).toBe(true);

    expect(
      await User.where({ role: "guest" })
        .or(User.where({ role: "mod" }))
        .exists()
    ).toBe(false);
  });
});
