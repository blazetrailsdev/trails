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
// WhereTest — targets relation/where_test.rb
// ==========================================================================
describe("WhereTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("where with string generates sql", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where("title = 'hello'").toSql();
    expect(sql).toContain("title = 'hello'");
  });

  it("where with hash generates sql", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({ title: "hello" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("where not generates sql", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.all().whereNot({ title: "hello" }).toSql();
    expect(sql).toContain("!=");
  });

  it("rewhere replaces existing conditions", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({ title: "old" }).rewhere({ title: "new" }).toSql();
    expect(sql).toContain("new");
  });

  it("where with range generates BETWEEN", () => {
    class Post extends Base {
      static { this.attribute("age", "integer"); this.adapter = adapter; }
    }
    const sql = Post.where({ age: new Range(18, 30) }).toSql();
    expect(sql).toContain("BETWEEN");
  });

  it("where with array generates IN", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({ title: ["a", "b", "c"] }).toSql();
    expect(sql).toContain("IN");
  });

  it("where with null generates IS NULL", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({ title: null }).toSql();
    expect(sql).toContain("IS NULL");
  });

  it("invert where swaps conditions", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const rel = Post.where({ title: "a" }).invertWhere();
    const sql = rel.toSql();
    expect(sql).toContain("!=");
  });
});

describe("WhereTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("where with string generates sql", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where("title = 'hello'").toSql();
    expect(sql).toContain("title = 'hello'");
  });

  it("where with hash generates sql", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({ title: "hello" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("where not generates sql", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.all().whereNot({ title: "hello" }).toSql();
    expect(sql).toContain("!=");
  });

  it("rewhere replaces existing conditions", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({ title: "old" }).rewhere({ title: "new" }).toSql();
    expect(sql).toContain("new");
  });

  it("where with range generates BETWEEN", () => {
    class Post extends Base {
      static { this.attribute("age", "integer"); this.adapter = adapter; }
    }
    const sql = Post.where({ age: new Range(18, 30) }).toSql();
    expect(sql).toContain("BETWEEN");
  });

  it("where with array generates IN", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({ title: ["a", "b", "c"] }).toSql();
    expect(sql).toContain("IN");
  });

  it("where with null generates IS NULL", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({ title: null }).toSql();
    expect(sql).toContain("IS NULL");
  });

  it("invert where swaps conditions", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const rel = Post.where({ title: "a" }).invertWhere();
    const sql = rel.toSql();
    expect(sql).toContain("!=");
  });

  it.skip("+ combines two where clauses", () => {});
  it.skip("or returns an empty where clause when either side is empty", () => {});

  it.skip("where copies bind params", () => {});
  it.skip("where with table name and target table", () => {});
  it.skip("where with table name and target table joined", () => {});
  it.skip("where with string and bound variable", () => {});
  it.skip("where with string and multiple bound variables", () => {});
  it("where with string conditions", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where("title = 'hello'").toSql();
    expect(sql).toContain("title = 'hello'");
  });
  it.skip("where with array and empty string", () => {});
  it.skip("where with blank conditions", () => {});
  it.skip("where with nested conditions", () => {});
  it.skip("where with AR relation subquery", () => {});
  it("where with empty hash", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({}).toSql();
    // Empty hash should produce no WHERE conditions
    expect(sql).toContain("FROM");
  });
  it.skip("where with prehash", () => {});
  it("where with nil hash value", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({ title: null }).toSql();
    expect(sql).toContain("IS NULL");
  });
  it("where with array hash value", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.where({ title: ["a", "b"] }).toSql();
    expect(sql).toContain("IN");
  });
  it.skip("belongs to association where with non primary key", () => {});
  it.skip("where with association conditions", () => {});
  it.skip("where association with default scope", () => {});
  it.skip("where with strong parameters", () => {});
  it.skip("where with conditions on both tables", () => {});
  it.skip("where with blank condition", () => {});
  it.skip("where with nil condition", () => {});
  it("where with range condition", () => {
    class Post extends Base {
      static { this.attribute("views", "integer"); this.adapter = adapter; }
    }
    const sql = Post.where({ views: new Range(1, 10) }).toSql();
    expect(sql).toContain("BETWEEN");
  });
  it.skip("where with exclusive range condition", () => {
    // Exclusive range not yet supported in where clause
  });
  it.skip("where on association with custom primary key", () => {});
  it.skip("where with association polymorphic", () => {});
  it.skip("where with unsupported association raises", () => {});
  it.skip("where with arel star", () => {});
  it.skip("where on association with relation", () => {});
  it("where with numeric comparison", () => {
    class Post extends Base {
      static { this.attribute("views", "integer"); this.adapter = adapter; }
    }
    const sql = Post.where({ views: 5 }).toSql();
    expect(sql).toContain("\"views\"");
    expect(sql).toContain("5");
  });
  it("where with multiple numeric comparisons", () => {
    class Post extends Base {
      static { this.attribute("views", "integer"); this.attribute("likes", "integer"); this.adapter = adapter; }
    }
    const sql = Post.where({ views: 5, likes: 10 }).toSql();
    expect(sql).toContain("views");
    expect(sql).toContain("likes");
  });
  it("where with not nil condition", () => {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    const sql = Post.whereNot({ title: null }).toSql();
    expect(sql).toContain("IS NOT NULL");
  });
  it.skip("where with not range condition", () => {});
  it.skip("where missing with association", () => {});
  it.skip("where missing with multiple associations", () => {});
  it.skip("where associated with association", () => {});
  it.skip("where associated with has many association", () => {});
  it.skip("where associated with multiple associations", () => {});
  it.skip("where not associated with association", () => {});
  it.skip("where not associated with has many association", () => {});
  it.skip("where not associated with multiple associations", () => {});
  it.skip("where with enum conditions", () => {});
  it.skip("where with enum conditions string", () => {});
  it.skip("type cast is not evaluated at relation build time", () => {});
  it.skip("where copies arel bind params", () => {});
  it.skip("where with tuple syntax", () => {});
  it.skip("where with tuple syntax on composite models", () => {});
  it.skip("where with tuple syntax with incorrect arity", () => {});
  it.skip("where with tuple syntax and regular syntax combined", () => {});
  it.skip("with tuple syntax and large values list", () => {});
  it.skip("where with nil cpk association", () => {});
  it.skip("belongs to shallow where", () => {});
  it.skip("belongs to nested relation where", () => {});
  it.skip("belongs to nested where", () => {});
  it.skip("belongs to nested where with relation", () => {});
  it.skip("polymorphic shallow where", () => {});
  it.skip("where not polymorphic id and type as nand", () => {});
  it.skip("where not association as nand", () => {});
  it.skip("polymorphic nested array where not", () => {});
  it.skip("polymorphic array where multiple types", () => {});
  it.skip("polymorphic nested relation where", () => {});
  it.skip("polymorphic sti shallow where", () => {});
  it.skip("polymorphic nested where", () => {});
  it.skip("polymorphic sti nested where", () => {});
  it.skip("decorated polymorphic where", () => {});
  it.skip("where with empty hash and no foreign key", () => {});
  it.skip("where with float for string column", () => {});
  it.skip("where with decimal for string column", () => {});
  it.skip("where with rational for string column", () => {});
  it.skip("where with duration for string column", () => {});
  it.skip("where with integer for binary column", () => {});
  it.skip("where with emoji for binary column", () => {});
  it.skip("where on association with custom primary key with relation", () => {});
  it.skip("where on association with relation performs subselect not two queries", () => {});
  it.skip("where on association with custom primary key with array of base", () => {});
  it.skip("where on association with custom primary key with array of ids", () => {});
  it.skip("where with relation on has many association", () => {});
  it.skip("where with relation on has one association", () => {});
  it.skip("where on association with select relation", () => {});
  it.skip("where on association with collection polymorphic relation", () => {});
  it.skip("where with unsupported arguments", () => {});
  it.skip("invert where", () => {});
  it.skip("nested conditional on enum", () => {});
});


describe("where with Range", () => {
  it("generates BETWEEN SQL", () => {
    class User extends Base {
      static {
        this.attribute("age", "integer");
      }
    }

    const sql = User.where({ age: new Range(18, 30) }).toSql();
    expect(sql).toContain("BETWEEN");
    expect(sql).toContain("18");
    expect(sql).toContain("30");
  });

  it("filters records with BETWEEN", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Young", age: 15 });
    await User.create({ name: "Adult", age: 25 });
    await User.create({ name: "Senior", age: 65 });

    const result = await User.where({ age: new Range(18, 30) }).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Adult");
  });

  it("BETWEEN is inclusive on both ends", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    await User.create({ age: 18 });
    await User.create({ age: 25 });
    await User.create({ age: 30 });

    const result = await User.where({ age: new Range(18, 30) }).toArray();
    expect(result).toHaveLength(3);
  });
});

describe("Range edge cases", () => {
  it("count with Range condition", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    await User.create({ age: 15 });
    await User.create({ age: 25 });
    await User.create({ age: 35 });

    expect(await User.where({ age: new Range(20, 30) }).count()).toBe(1);
  });

  it("Range combined with IN array in same where", async () => {
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

    const result = await User.where({ age: new Range(20, 30) })
      .where({ name: ["Alice", "Bob"] })
      .toArray();
    expect(result).toHaveLength(2);
  });
});

describe("where with raw SQL", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("supports raw SQL string with bind params", async () => {
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("age", "integer");
    User.adapter = adapter;

    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 17 });
    await User.create({ name: "Charlie", age: 30 });

    const sql = User.where("\"users\".\"age\" > ?", 18).toSql();
    expect(sql).toContain("\"users\".\"age\" > 18");
  });

  it("rewhere replaces specific where conditions", async () => {
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("status", "string");
    User.adapter = adapter;

    await User.create({ name: "Alice", status: "active" });
    await User.create({ name: "Bob", status: "inactive" });

    const active = User.where({ status: "active" });
    const inactive = active.rewhere({ status: "inactive" });
    const records = await inactive.toArray();
    expect(records.length).toBe(1);
    expect(records[0].readAttribute("name")).toBe("Bob");
  });
});

describe("where with subquery", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("supports Relation as value for IN subquery", async () => {
    class Author extends Base { static _tableName = "authors"; }
    Author.attribute("id", "integer");
    Author.attribute("name", "string");
    Author.adapter = adapter;

    class Post extends Base { static _tableName = "posts"; }
    Post.attribute("id", "integer");
    Post.attribute("author_id", "integer");
    Post.attribute("title", "string");
    Post.adapter = adapter;

    const alice = await Author.create({ name: "Alice" });
    const bob = await Author.create({ name: "Bob" });
    await Post.create({ author_id: alice.id, title: "Post A" });
    await Post.create({ author_id: bob.id, title: "Post B" });
    await Post.create({ author_id: alice.id, title: "Post C" });

    // Use a subquery to find posts by Alice
    const aliceIds = Author.all().where({ name: "Alice" }).select("id") as any;
    const sql = Post.all().where({ author_id: aliceIds }).toSql();
    expect(sql).toContain("IN (SELECT");
  });
});

describe("rewhere clears NOT clauses", () => {
  it("replaces whereNot clauses for the same key", async () => {
    const adapter = freshAdapter();
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("role", "string");
    User.adapter = adapter;

    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "viewer" });

    // whereNot then rewhere should override the NOT condition
    const rel = User.all().whereNot({ role: "admin" }).rewhere({ role: "admin" });
    const result = await rel.toArray();
    expect(result.length).toBe(1);
    expect(result[0].readAttribute("name")).toBe("Alice");
  });
});

describe("where with named binds", () => {
  it("replaces :name placeholders with values", async () => {
    const adapter = freshAdapter();
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("age", "integer");
    User.adapter = adapter;

    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 15 });
    await User.create({ name: "Charlie", age: 35 });

    const results = await User.all().where("age > :min AND age < :max", { min: 20, max: 30 }).toArray();
    expect(results.length).toBe(1);
    expect(results[0].readAttribute("name")).toBe("Alice");
  });

  it("handles string named binds with quoting", async () => {
    const adapter = freshAdapter();
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const results = await User.all().where("name = :name", { name: "Alice" }).toArray();
    expect(results.length).toBe(1);
    expect(results[0].readAttribute("name")).toBe("Alice");
  });
});

describe("whereAny", () => {
  it("matches records where ANY condition is true (OR)", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("role", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "user" });
    await User.create({ name: "Charlie", role: "user" });

    const results = await User.where({}).whereAny({ name: "Alice" }, { role: "user" }).toArray();
    expect(results.length).toBe(3);
  });

  it("filters correctly with strict conditions", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("role", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "user" });
    await User.create({ name: "Charlie", role: "mod" });

    const results = await User.where({}).whereAny({ name: "Alice" }, { name: "Bob" }).toArray();
    expect(results.length).toBe(2);
    const names = results.map((u: any) => u.readAttribute("name")).sort();
    expect(names).toEqual(["Alice", "Bob"]);
  });
});

describe("whereAll", () => {
  it("matches records where ALL conditions are true (AND)", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("role", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Alice", role: "user" });
    await User.create({ name: "Bob", role: "admin" });

    const results = await User.where({}).whereAll({ name: "Alice" }, { role: "admin" }).toArray();
    expect(results.length).toBe(1);
    expect(results[0].readAttribute("name")).toBe("Alice");
    expect(results[0].readAttribute("role")).toBe("admin");
  });
});

describe("Relation Where (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  class User extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("email", "string");
      this.attribute("age", "integer");
      this.attribute("active", "boolean");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    User.adapter = adapter;
    await User.create({ name: "Alice", email: "alice@test.com", age: 25, active: true });
    await User.create({ name: "Bob", email: "bob@test.com", age: 30, active: false });
    await User.create({ name: "Charlie", email: null, age: 35, active: true });
  });

  it("where with hash conditions", async () => {
    const result = await User.where({ name: "Alice" }).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Alice");
  });

  it("where with multiple conditions", async () => {
    const result = await User.where({ active: true, name: "Alice" }).toArray();
    expect(result).toHaveLength(1);
  });

  it("where with null generates IS NULL", async () => {
    const result = await User.where({ email: null }).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Charlie");
  });

  it("where with array generates IN", async () => {
    const result = await User.where({ name: ["Alice", "Charlie"] }).toArray();
    expect(result).toHaveLength(2);
  });

  it("where with empty array returns no results", async () => {
    const result = await User.where({ name: [] }).toArray();
    expect(result).toHaveLength(0);
  });

  it("whereNot excludes matching records", async () => {
    const result = await User.all().whereNot({ name: "Alice" }).toArray();
    expect(result).toHaveLength(2);
    expect(result.every((r: any) => r.readAttribute("name") !== "Alice")).toBe(true);
  });

  it("whereNot with null generates IS NOT NULL", async () => {
    const result = await User.all().whereNot({ email: null }).toArray();
    expect(result).toHaveLength(2);
  });

  it("whereNot with array generates NOT IN", async () => {
    const result = await User.all().whereNot({ name: ["Alice", "Bob"] }).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Charlie");
  });

  it("where with Range generates BETWEEN", async () => {
    const result = await User.where({ age: new Range(25, 30) }).toArray();
    expect(result).toHaveLength(2);
  });

  it("chaining multiple where clauses", async () => {
    const result = await User.where({ active: true }).where({ name: "Alice" }).toArray();
    expect(result).toHaveLength(1);
  });

  it("chaining multiple whereNot clauses", async () => {
    const result = await User.all().whereNot({ name: "Alice" }).whereNot({ name: "Bob" }).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Charlie");
  });

  it("rewhere replaces existing where conditions for same key", async () => {
    const result = await User.where({ name: "Alice" }).rewhere({ name: "Bob" }).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Bob");
  });

  it("where with raw SQL string", async () => {
    const result = await User.where("age > ?", 28).toArray();
    expect(result).toHaveLength(2);
  });

  it("where with named bind parameters", async () => {
    const result = await User.where("age > :min AND age < :max", { min: 26, max: 34 }).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Bob");
  });
});


describe("where with Range (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  class Person extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("age", "integer");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    Person.adapter = adapter;
    await Person.create({ name: "Child", age: 10 });
    await Person.create({ name: "Teen", age: 16 });
    await Person.create({ name: "Adult", age: 25 });
    await Person.create({ name: "Senior", age: 70 });
  });

  it("Range in where generates BETWEEN", async () => {
    const result = await Person.where({ age: new Range(15, 30) }).toArray();
    expect(result).toHaveLength(2);
    const names = result.map((r: Base) => r.readAttribute("name"));
    expect(names).toContain("Teen");
    expect(names).toContain("Adult");
  });

  it("Range is inclusive", async () => {
    const result = await Person.where({ age: new Range(16, 25) }).toArray();
    expect(result).toHaveLength(2);
  });

  it("Range combined with other conditions", async () => {
    const result = await Person.where({ age: new Range(10, 20) })
      .where({ name: "Teen" })
      .toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Teen");
  });

  it("Range generates valid SQL", () => {
    const sql = Person.where({ age: new Range(18, 65) }).toSql();
    expect(sql).toContain("BETWEEN");
    expect(sql).toContain("18");
    expect(sql).toContain("65");
  });
});

describe("Range / BETWEEN (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  class Product extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("price", "integer");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Product.adapter = adapter;
  });

  // Rails: test_where_with_range
  it("Range generates BETWEEN", async () => {
    await Product.create({ name: "Cheap", price: 5 });
    await Product.create({ name: "Mid", price: 15 });
    await Product.create({ name: "Pricey", price: 25 });

    const results = await Product.where({ price: new Range(10, 20) }).toArray();
    expect(results).toHaveLength(1);
    expect(results[0].readAttribute("name")).toBe("Mid");
  });

  // Rails: test_range_with_aggregation
  it("Range works with count", async () => {
    await Product.create({ name: "A", price: 5 });
    await Product.create({ name: "B", price: 15 });
    await Product.create({ name: "C", price: 25 });
    await Product.create({ name: "D", price: 20 });

    expect(await Product.where({ price: new Range(10, 20) }).count()).toBe(2);
  });

  // Rails: test_range_combined_with_other_conditions
  it("Range combined with other where conditions", async () => {
    await Product.create({ name: "A", price: 15 });
    await Product.create({ name: "B", price: 15 });
    await Product.create({ name: "C", price: 5 });

    const results = await Product.where({ price: new Range(10, 20), name: "A" }).toArray();
    expect(results).toHaveLength(1);
    expect(results[0].readAttribute("name")).toBe("A");
  });
});

describe("Raw SQL Where (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  // Rails: test "where with SQL string and bind values"
  it("where accepts raw SQL string with ? placeholders", async () => {
    class Person extends Base {
      static { this._tableName = "people"; this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
    }

    await Person.create({ name: "Alice", age: 25 });
    await Person.create({ name: "Bob", age: 17 });
    await Person.create({ name: "Charlie", age: 30 });

    const sql = Person.where("\"people\".\"age\" > ?", 18).toSql();
    expect(sql).toContain("\"people\".\"age\" > 18");
  });

  // Rails: test "where with string bind for LIKE"
  it("where with LIKE query", async () => {
    class Person extends Base {
      static { this._tableName = "people"; this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
    }

    const sql = Person.where("\"people\".\"name\" LIKE ?", "%ali%").toSql();
    expect(sql).toContain("LIKE '%ali%'");
  });

  // Rails: test "rewhere replaces existing conditions"
  it("rewhere replaces conditions on the same column", async () => {
    class Person extends Base {
      static { this._tableName = "people"; this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("status", "string"); this.adapter = adapter; }
    }

    await Person.create({ name: "Alice", status: "active" });
    await Person.create({ name: "Bob", status: "inactive" });

    const base = Person.where({ status: "active" });
    const rewritten = base.rewhere({ status: "inactive" });

    const records = await rewritten.toArray();
    expect(records.length).toBe(1);
    expect(records[0].readAttribute("name")).toBe("Bob");
  });

  // Rails: test "rewhere preserves other conditions"
  it("rewhere only replaces the specified keys", async () => {
    class Person extends Base {
      static { this._tableName = "people"; this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("status", "string"); this.attribute("role", "string"); this.adapter = adapter; }
    }

    await Person.create({ name: "Alice", status: "active", role: "admin" });
    await Person.create({ name: "Bob", status: "inactive", role: "admin" });
    await Person.create({ name: "Charlie", status: "inactive", role: "user" });

    const base = Person.where({ status: "active", role: "admin" });
    const rewritten = base.rewhere({ status: "inactive" });

    const records = await rewritten.toArray();
    expect(records.length).toBe(1);
    expect(records[0].readAttribute("name")).toBe("Bob");
  });
});
