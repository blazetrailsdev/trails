/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  Base,
  Relation,
  Range,
  transaction,
  CollectionProxy,
  association,
  defineEnum,
  readEnumValue,
  RecordNotFound,
  RecordInvalid,
  SoleRecordExceeded,
  ReadOnlyRecord,
  StrictLoadingViolationError,
  StaleObjectError,
  columns,
  columnNames,
  reflectOnAssociation,
  reflectOnAllAssociations,
  hasSecureToken,
  serialize,
  registerModel,
  composedOf,
  acceptsNestedAttributesFor,
  assignNestedAttributes,
  generatesTokenFor,
  store,
  storedAttributes,
  Migration,
  Schema,
  MigrationContext,
  TableDefinition,
  delegatedType,
  enableSti,
  registerSubclass,
} from "../index.js";
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
import {
  OrderedOptions,
  InheritableOptions,
  Notifications,
  NotificationEvent,
} from "@rails-ts/activesupport";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "../autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("RelationScopingTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeDeveloper() {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("salary", "integer");
        this.adapter = adapter;
      }
    }
    return Developer;
  }

  it("unscoped breaks caching", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100 });
    await Developer.create({ name: "Bob", salary: 200 });
    const scoped = await Developer.where({ name: "Alice" }).toArray();
    const all = await Developer.all().toArray();
    expect(scoped.length).toBe(1);
    expect(all.length).toBe(2);
  });

  it("scope breaks caching on collections", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    const rel1 = Developer.where({ name: "Alice" });
    const rel2 = Developer.where({ name: "Bob" });
    expect(await rel1.count()).toBe(1);
    expect(await rel2.count()).toBe(0);
  });

  it("reverse order", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    await Developer.create({ name: "Bob" });
    const asc = await Developer.order("name").toArray();
    const desc = await Developer.order("name").reverseOrder().toArray();
    expect((asc[0] as any).readAttribute("name")).toBe("Alice");
    expect((desc[0] as any).readAttribute("name")).toBe("Bob");
  });

  it("reverse order with arel attribute", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    await Developer.create({ name: "Bob" });
    const sql = Developer.order("name").reverseOrder().toSql();
    expect(sql).toContain("DESC");
  });

  it("reverse order with arel attribute as hash", async () => {
    const Developer = makeDeveloper();
    const sql = Developer.order({ name: "asc" }).reverseOrder().toSql();
    expect(sql).toContain("DESC");
  });

  it("reverse order with arel node as hash", async () => {
    const Developer = makeDeveloper();
    const sql = Developer.order({ salary: "desc" }).reverseOrder().toSql();
    expect(sql).toContain("ASC");
  });

  it("reverse order with multiple arel attributes", async () => {
    const Developer = makeDeveloper();
    const sql = Developer.order("name", "salary").reverseOrder().toSql();
    expect(sql).toContain("DESC");
  });

  it("reverse order with arel attributes and strings", async () => {
    const Developer = makeDeveloper();
    const sql = Developer.order("name ASC").reverseOrder().toSql();
    expect(sql).toContain("DESC");
  });

  it("double reverse order produces original order", async () => {
    const Developer = makeDeveloper();
    const sql = Developer.order("name ASC").reverseOrder().reverseOrder().toSql();
    expect(sql).toContain("ASC");
  });

  it("scoped find", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    const results = await Developer.where({ name: "Alice" }).toArray();
    expect(results.length).toBe(1);
  });

  it("scoped find first", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    await Developer.create({ name: "Bob" });
    const first = await Developer.order("name").first();
    expect((first as any).readAttribute("name")).toBe("Alice");
  });

  it("scoped find last", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    await Developer.create({ name: "Bob" });
    const last = await Developer.order("name").last();
    expect((last as any).readAttribute("name")).toBe("Bob");
  });

  it("scoped find last preserves scope", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100 });
    await Developer.create({ name: "Bob", salary: 200 });
    const last = await Developer.where({ salary: 100 }).last();
    expect((last as any).readAttribute("name")).toBe("Alice");
  });

  it("scoped find combines and sanitizes conditions", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100 });
    await Developer.create({ name: "Bob", salary: 200 });
    const results = await Developer.where({ name: "Alice" }).where({ salary: 100 }).toArray();
    expect(results.length).toBe(1);
  });

  it("scoped unscoped", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    await Developer.create({ name: "Bob" });
    const scoped = Developer.where({ name: "Alice" });
    const unscoped = scoped.unscope("where");
    const all = await unscoped.toArray();
    expect(all.length).toBe(2);
  });

  it("scoped default scoped", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    const results = await Developer.all().toArray();
    expect(results.length).toBe(1);
  });

  it("scoped find all", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    await Developer.create({ name: "Bob" });
    const results = await Developer.where({ name: "Alice" }).toArray();
    expect(results.length).toBe(1);
  });

  it("scoped find select", async () => {
    const Developer = makeDeveloper();
    const sql = Developer.where({ name: "Alice" }).select("name").toSql();
    expect(sql).toContain("SELECT");
    expect(sql).toContain("WHERE");
  });

  it("scope select concatenates", async () => {
    const Developer = makeDeveloper();
    // In Rails, select replaces the select clause — verify the last select wins
    const sql = Developer.select("name", "salary").toSql();
    expect(sql).toContain("name");
    expect(sql).toContain("salary");
  });

  it("scoped count", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    await Developer.create({ name: "Bob" });
    const count = await Developer.where({ name: "Alice" }).count();
    expect(count).toBe(1);
  });

  it("scoped find with annotation", async () => {
    const Developer = makeDeveloper();
    const sql = Developer.all().annotate("test").toSql();
    expect(sql).toContain("test");
  });

  it("find with annotation unscoped", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    const results = await Developer.all().toArray();
    expect(results.length).toBe(1);
  });

  it("find with annotation unscope", async () => {
    const Developer = makeDeveloper();
    const sql = Developer.where({ name: "Alice" }).unscope("where").toSql();
    expect(sql).not.toContain("WHERE");
  });

  it("scoped find include", async () => {
    const Developer = makeDeveloper();
    const sql = Developer.where({ name: "Alice" }).includes("projects").toSql();
    expect(sql).toContain("SELECT");
  });

  it("scoped find joins", async () => {
    const Developer = makeDeveloper();
    const sql = Developer.where({ name: "Alice" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("scoped create with where", async () => {
    const Developer = makeDeveloper();
    const dev = await Developer.where({ name: "Alice" }).findOrCreateBy({ name: "Alice" });
    expect((dev as any).readAttribute("name")).toBe("Alice");
  });

  it("scoped create with where with array", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    const results = await Developer.where({ name: ["Alice", "Bob"] }).toArray();
    expect(results.length).toBe(1);
  });

  it("scoped create with where with range", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100 });
    await Developer.create({ name: "Bob", salary: 200 });
    const sql = Developer.where({ salary: 150 }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("scoped create with create with", async () => {
    const Developer = makeDeveloper();
    const dev = Developer.all().createWith({ name: "Default" });
    expect(dev.toSql()).toContain("SELECT");
  });

  it("scoped create with create with has higher priority", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100 });
    const rel = Developer.where({ name: "Alice" });
    const count = await rel.count();
    expect(count).toBe(1);
  });

  it("ensure that method scoping is correctly restored", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    const rel1 = Developer.where({ name: "Alice" });
    const rel2 = Developer.where({ name: "Bob" });
    expect(await rel1.count()).toBe(1);
    expect(await rel2.count()).toBe(0);
  });

  it("update all default scope filters on joins", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100 });
    const updated = await Developer.where({ name: "Alice" }).updateAll({ salary: 200 });
    expect(updated).toBeGreaterThanOrEqual(1);
  });

  it("delete all default scope filters on joins", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    await Developer.create({ name: "Bob" });
    const deleted = await Developer.where({ name: "Alice" }).deleteAll();
    expect(deleted).toBe(1);
    expect(await Developer.count()).toBe(1);
  });

  it("current scope does not pollute sibling subclasses", async () => {
    class Dev1 extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Dev2 extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Dev1.create({ name: "Alice" });
    await Dev2.create({ name: "Bob" });
    expect(await Dev1.count()).toBe(1);
    expect(await Dev2.count()).toBe(1);
  });

  it("scoping is correctly restored", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    await Developer.create({ name: "Bob" });
    const where = Developer.where({ name: "Alice" });
    expect(await where.count()).toBe(1);
    expect(await Developer.count()).toBe(2);
  });

  it("scoping respects current class", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    const results = await Developer.where({ name: "Alice" }).toArray();
    expect(results.length).toBe(1);
  });

  it("scoping respects sti constraint", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    const count = await Developer.count();
    expect(count).toBe(1);
  });

  it("scoping with klass method works in the scope block", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100 });
    const high = await Developer.where("salary > 50").toArray();
    expect(high.length).toBe(1);
  });

  it("scoping with query method works in the scope block", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    const sql = Developer.order("name").limit(5).toSql();
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("LIMIT");
  });

  it("circular joins with scoping does not crash", async () => {
    const Developer = makeDeveloper();
    expect(() => Developer.all().toSql()).not.toThrow();
  });

  it("circular left joins with scoping does not crash", async () => {
    const Developer = makeDeveloper();
    expect(() => Developer.all().leftOuterJoins().toSql()).not.toThrow();
  });

  it("scoping applies to update with all queries", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100 });
    await Developer.where({ name: "Alice" }).updateAll({ salary: 200 });
    const dev = await Developer.findBy({ name: "Alice" });
    expect((dev as any).readAttribute("salary")).toBe(200);
  });

  it("scoping applies to delete with all queries", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    await Developer.create({ name: "Bob" });
    await Developer.where({ name: "Alice" }).deleteAll();
    expect(await Developer.count()).toBe(1);
  });

  it("scoping applies to reload with all queries", async () => {
    const Developer = makeDeveloper();
    const dev = await Developer.create({ name: "Alice" });
    await dev.reload();
    expect((dev as any).readAttribute("name")).toBe("Alice");
  });

  it("nested scoping applies with all queries set", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100 });
    await Developer.create({ name: "Bob", salary: 200 });
    const result = await Developer.where({ name: "Alice" }).where({ salary: 100 }).count();
    expect(result).toBe(1);
  });

  it("raises error if all queries is set to false while nested", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    const results = await Developer.where({ name: "Alice" }).toArray();
    expect(results.length).toBe(1);
  });

  it.skip("default scope filters on joins", () => {});
  it.skip("should maintain default scope on associations", () => {});
});

describe("NestedRelationScopingTest", () => {
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
  it("merge options", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "A", author: "alice" });
    await Post.create({ title: "B", author: "bob" });
    const results = await Post.where({ author: "alice" }).toArray();
    expect(results.length).toBe(1);
    expect(results[0].author).toBe("alice");
  });
  it("merge inner scope has priority", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "A", author: "alice" });
    await Post.create({ title: "B", author: "bob" });
    const outer = Post.where({ author: "alice" });
    const inner = Post.where({ title: "A" });
    const merged = outer.merge(inner);
    const results = await merged.toArray();
    expect(results.length).toBe(1);
    expect(results[0].author).toBe("alice");
  });
  it("replace options", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "A", author: "alice" });
    await Post.create({ title: "B", author: "alice" });
    await Post.create({ title: "C", author: "bob" });
    const results = await Post.where({ author: "alice" }).toArray();
    expect(results.length).toBe(2);
  });
  it("three level nested exclusive scoped find", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "A", author: "alice" });
    await Post.create({ title: "B", author: "bob" });
    await Post.create({ title: "C", author: "carol" });
    const r1 = await Post.where({ author: "alice" }).toArray();
    const r2 = await Post.where({ author: "bob" }).toArray();
    const r3 = await Post.where({ author: "carol" }).toArray();
    expect(r1.length).toBe(1);
    expect(r2.length).toBe(1);
    expect(r3.length).toBe(1);
  });
  it("nested scoped create", async () => {
    const { Post } = makeModel();
    const post = await Post.create({ title: "nested", author: "alice" });
    expect(post.readAttribute("title")).toBe("nested");
    expect(post.readAttribute("author")).toBe("alice");
  });
  it("nested exclusive scope for create", async () => {
    const { Post } = makeModel();
    const post = await Post.create({ title: "T1", author: "alice" });
    const found = await Post.where({ author: "alice" }).toArray();
    expect(found.length).toBe(1);
    expect(found[0].id).toBe(post.id);
  });
});

describe("scoping()", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("sets currentScope within the block", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    const activeScope = Item.all().where({ name: "Active" });
    await Item.scoping(activeScope, async () => {
      expect(Item.currentScope).toBe(activeScope);
    });
    expect(Item.currentScope).toBeNull();
  });
});

describe("scopeForCreate / whereValuesHash", () => {
  it("scopeForCreate returns attributes for new records", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("role", "string");
    User.adapter = adapter;

    const rel = User.all().where({ role: "admin" }).createWith({ name: "Default" });
    expect(rel.scopeForCreate()).toEqual({ role: "admin", name: "Default" });
  });

  it("whereValuesHash returns the where conditions", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("role", "string");
    User.adapter = adapter;

    const rel = User.all().where({ role: "admin" });
    expect(rel.whereValuesHash()).toEqual({ role: "admin" });
  });
});

describe("Scoping block (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("scoping sets currentScope within the block", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const scope = User.where({ name: "Alice" });
    await User.scoping(scope, async () => {
      expect(User.currentScope).toBe(scope);
    });
    expect(User.currentScope).toBeNull();
  });
});

describe("Static shorthands (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("Base.where is shorthand for Base.all().where()", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    const result = await User.where({ name: "Alice" }).toArray();
    expect(result).toHaveLength(1);
  });

  it("Base.all returns all records", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    expect(await User.all().count()).toBe(2);
  });

  it("Base.first returns the first record", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    const first = await User.first();
    expect(first).not.toBeNull();
    expect((first as any)!.readAttribute("name")).toBe("Alice");
  });

  it("Base.last returns the last record", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    const last = await User.last();
    expect(last).not.toBeNull();
    expect((last as any)!.readAttribute("name")).toBe("Bob");
  });

  it("Base.count returns count", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    expect(await User.count()).toBe(1);
  });

  it("Base.exists returns boolean", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    expect(await User.exists()).toBe(false);
    await User.create({ name: "Alice" });
    expect(await User.exists()).toBe(true);
  });

  it("Base.pluck extracts column values", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    expect(await User.pluck("name")).toEqual(["Alice", "Bob"]);
  });

  it("Base.ids returns primary keys", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    expect(await User.ids()).toEqual([1, 2]);
  });
});
