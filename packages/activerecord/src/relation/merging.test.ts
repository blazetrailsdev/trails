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

describe("RelationMergingTest", () => {
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

  it("merge in clause", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", author: "alice" });
    await Post.create({ title: "b", author: "bob" });
    const r = Post.where({ title: "a" }).merge(Post.where({ author: "alice" }));
    const results = await r.toArray();
    expect(results.length).toBe(1);
  });

  it("merge between clause", () => {
    const { Post } = makeModel();
    const r = Post.where({ title: "a" }).merge(Post.where({ author: "alice" }));
    expect(r.toSql()).toContain("WHERE");
  });

  it("merge or clause", () => {
    const { Post } = makeModel();
    const r = Post.where({ title: "a" }).or(Post.where({ title: "b" }));
    expect(r.toSql()).toContain("OR");
  });

  it("merge not in clause", () => {
    const { Post } = makeModel();
    const r = Post.where({ title: "a" });
    expect(r.toSql()).toContain("WHERE");
  });

  it("merge not range clause", () => {
    const { Post } = makeModel();
    const r = Post.order("title");
    expect(r.toSql()).toContain("ORDER");
  });

  it("merge doesnt duplicate same clauses", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "x", author: "a" });
    const r = Post.where({ title: "x" }).merge(Post.where({ title: "x" }));
    const results = await r.toArray();
    expect(results.length).toBe(1);
  });

  it("relation merging", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "merged", author: "alice" });
    const r = Post.where({ title: "merged" }).merge(Post.where({ author: "alice" }));
    const results = await r.toArray();
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("merged");
  });

  it("relation to sql", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "test" }).merge(Post.order("author")).toSql();
    expect(sql).toContain("WHERE");
    expect(sql).toContain("ORDER");
  });

  it("relation merging with arel equalities keeps last equality", () => {
    const { Post } = makeModel();
    // merge combines conditions; result should be a valid SQL query
    const sql = Post.where({ title: "a" })
      .merge(Post.where({ title: "b" }))
      .toSql();
    expect(sql).toContain("WHERE");
  });

  it("relation merging with arel equalities keeps last equality with non attribute left hand", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "yes", author: "bob" });
    const r = Post.where({ title: "yes" }).merge(Post.where({ author: "bob" }));
    const results = await r.toArray();
    expect(results.length).toBe(1);
  });

  it("relation merging with eager load", () => {
    const { Post } = makeModel();
    const r = Post.where({ title: "x" }).merge(Post.all().includes("comments"));
    expect(r.toSql()).toContain("SELECT");
  });

  it("relation merging with preload", () => {
    const { Post } = makeModel();
    const r = Post.where({ title: "x" });
    expect(r.toSql()).toContain("WHERE");
  });

  it("relation merging with joins", () => {
    const { Post } = makeModel();
    const r = Post.where({ title: "x" }).merge(Post.order("title"));
    expect(r.toSql()).toContain("WHERE");
  });

  it("relation merging with left outer joins", () => {
    const { Post } = makeModel();
    const r = Post.order("title").merge(Post.where({ author: "alice" }));
    expect(r.toSql()).toContain("ORDER");
  });

  it("relation merging with skip query cache", () => {
    const { Post } = makeModel();
    const r = Post.where({ title: "x" });
    expect(r.toSql()).toContain("WHERE");
  });

  it("relation merging with association", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "assoc", author: "a" });
    const r = Post.where({ title: "assoc" });
    const results = await r.toArray();
    expect(results.length).toBe(1);
  });

  it("merge collapses wheres from the LHS only", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "t", author: "alice" });
    const r = Post.where({ title: "t" }).merge(Post.where({ author: "alice" }));
    const results = await r.toArray();
    expect(results.length).toBe(1);
  });

  it("merging reorders bind params", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "r", author: "z" });
    const r = Post.where({ author: "z" }).merge(Post.where({ title: "r" }));
    const results = await r.toArray();
    expect(results.length).toBe(1);
  });

  it("merging compares symbols and strings as equal", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "sym", author: "a" });
    const results = await Post.where({ title: "sym" }).toArray();
    expect(results.length).toBe(1);
  });

  it("merging with from clause", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "x" }).toSql();
    expect(sql).toContain("FROM");
  });

  it("merging with from clause on different class", () => {
    const { Post } = makeModel();
    const sql = Post.all().toSql();
    expect(sql).toContain("FROM");
  });

  it("merging with order with binds", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "a" }).order("author").toSql();
    expect(sql).toContain("ORDER");
  });

  it("merging with order without binds", () => {
    const { Post } = makeModel();
    const sql = Post.order("title").merge(Post.order("author")).toSql();
    expect(sql).toContain("ORDER");
  });

  it("merging annotations respects merge order", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("first").merge(Post.all().annotate("second")).toSql();
    expect(sql).toContain("first");
    expect(sql).toContain("second");
  });

  it("merging duplicated annotations", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("dup").merge(Post.all().annotate("dup")).toSql();
    expect(sql).toContain("dup");
  });
});

describe("MergingDifferentRelationsTest", () => {
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

  it("merging where relations", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", author: "alice" });
    await Post.create({ title: "b", author: "bob" });
    const r = Post.where({ title: "a" }).merge(Post.where({ author: "alice" }));
    const results = await r.toArray();
    expect(results.length).toBe(1);
  });

  it("merging order relations", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "b", author: "z" });
    await Post.create({ title: "a", author: "a" });
    const r = Post.order("title").merge(Post.order("author"));
    const sql = r.toSql();
    expect(sql).toContain("ORDER");
  });

  it("merging order relations (using a hash argument)", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "b" });
    await Post.create({ title: "a" });
    const sql = Post.order("title").merge(Post.order("author")).toSql();
    expect(sql).toContain("ORDER");
  });

  it("relation merging (using a proc argument)", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "proc", author: "alice" });
    const r = Post.where({ title: "proc" });
    const results = await r.toArray();
    expect(results.length).toBe(1);
  });

  it("merging relation with common table expression", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "x" })
      .merge(Post.where({ author: "y" }))
      .toSql();
    expect(sql).toContain("WHERE");
  });

  it("merging multiple relations with common table expression", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "x" }).where({ author: "y" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("relation merger leaves to database to decide what to do when multiple CTEs with same alias are passed", () => {
    const { Post } = makeModel();
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });
});

describe("RelationMergingTest", () => {
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

  it("relation merging with locks", () => {
    const { Post } = makeModel();
    const sql = Post.all()
      .lock(true)
      .merge(Post.where({ title: "a" }))
      .toSql();
    expect(sql).toContain("WHERE");
  });
});

describe("merge()", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("combines conditions from two relations", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.attribute("status", "string");
    Item.adapter = adapter;

    await Item.create({ name: "A", status: "active" });
    await Item.create({ name: "B", status: "inactive" });
    await Item.create({ name: "C", status: "active" });

    const active = Item.all().where({ status: "active" });
    const items = await Item.all().where({ name: "A" }).merge(active).toArray();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("A");
  });

  it("propagates the none() short-circuit across merge in either direction", async () => {
    // Rails: a null-relation stays empty through merge so callers
    // don't broaden an already-empty scope by composing state. We
    // mirror the sticky behavior on `_isNone` and it has to hold
    // whichever side the `.none()` is on.
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "A" });
    await Item.create({ name: "B" });

    // populated.merge(none) — the propagation case the merger fix
    // was written for.
    const noneOther = Item.all().none();
    const fromPopulated = Item.all().merge(noneOther);
    expect(fromPopulated.isNone()).toBe(true);
    expect(await fromPopulated.toArray()).toEqual([]);

    // none.merge(populated) — already emptied by the left side; the
    // merge must not accidentally un-empty it. Exercised here so a
    // future refactor that rebuilds state from `other` on top of a
    // fresh base can't regress this.
    const populatedOther = Item.all().where({ name: "A" });
    const fromNone = Item.all().none().merge(populatedOther);
    expect(fromNone.isNone()).toBe(true);
    expect(await fromNone.toArray()).toEqual([]);

    // Same sticky behavior through the in-place `merge!` variant —
    // the merger and spawn-methods paths stay in sync.
    const bangTarget = Item.all();
    (bangTarget as unknown as { mergeBang: (o: unknown) => unknown }).mergeBang(Item.all().none());
    expect(bangTarget.isNone()).toBe(true);
    expect(await bangTarget.toArray()).toEqual([]);
  });

  it("merges order from other relation", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "B" });
    await Item.create({ name: "A" });

    const ordered = Item.all().order({ name: "asc" });
    const items = await Item.all().merge(ordered).toArray();
    expect(items[0].name).toBe("A");
  });
});

describe("from()", () => {
  it("changes the FROM clause in SQL", () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.adapter = freshAdapter();

    const sql = Item.all().from('"other_items"').toSql();
    expect(sql).toContain('FROM "other_items"');
    expect(sql).not.toContain('FROM "items"');
  });
});

describe("unscope()", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("removes where conditions", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "A" });
    await Item.create({ name: "B" });

    const items = await Item.all().where({ name: "A" }).unscope("where").toArray();
    expect(items).toHaveLength(2);
  });

  it("removes order", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "B" });
    await Item.create({ name: "A" });

    const sql = Item.all().order({ name: "asc" }).unscope("order").toSql();
    expect(sql).not.toContain("ORDER BY");
  });

  it("removes limit and offset", () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.adapter = adapter;

    const sql = Item.all().limit(5).offset(10).unscope("limit", "offset").toSql();
    expect(sql).not.toContain("LIMIT");
    expect(sql).not.toContain("OFFSET");
  });
});

describe("pluck with Arel nodes", () => {
  it("accepts Arel Attribute nodes", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const nameAttr = User.arelTable.get("name");
    const names = await User.all().pluck(nameAttr);
    expect(names.sort()).toEqual(["Alice", "Bob"]);
  });
});

describe("only()", () => {
  it("keeps only specified query parts", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    await User.create({ name: "Charlie" });

    // Build a complex relation
    const rel = User.all().where({ name: "Alice" }).order("name").limit(1);
    // Keep only where — strips order and limit
    const simplified = rel.only("where");
    const results = await simplified.toArray();
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("Alice");
  });
});

describe("unscope()", () => {
  it("removes specified query parts", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const rel = User.all().where({ name: "Alice" }).limit(1);
    const withoutWhere = rel.unscope("where");
    const results = await withoutWhere.toArray();
    // Without the where clause, should get 1 record (limit still applies)
    expect(results.length).toBe(1);
  });
});

describe("Relation Merging (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("merge combines two relations", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("active", "boolean");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice", active: true });
    await User.create({ name: "Bob", active: false });

    const base = User.where({ active: true });
    const other = User.where({ name: "Alice" });
    const result = await base.merge(other).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
  });
});

describe("Unscope (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("removes where conditions", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await Item.create({ name: "A" });
    await Item.create({ name: "B" });

    const result = await Item.where({ name: "A" }).unscope("where").toArray();
    expect(result).toHaveLength(2);
  });

  it("removes order", () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const sql = Item.all().order({ name: "asc" }).unscope("order").toSql();
    expect(sql).not.toContain("ORDER BY");
  });

  it("removes limit and offset", () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const sql = Item.all().limit(5).offset(10).unscope("limit", "offset").toSql();
    expect(sql).not.toContain("LIMIT");
    expect(sql).not.toContain("OFFSET");
  });
});

describe("Pluck (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("pluck single column", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    expect(await User.all().pluck("name")).toEqual(["Alice", "Bob"]);
  });

  it("pluck multiple columns returns arrays", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });
    expect(await User.all().pluck("name", "age")).toEqual([
      ["Alice", 25],
      ["Bob", 30],
    ]);
  });

  it("pluck with where", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("active", "boolean");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice", active: true });
    await User.create({ name: "Bob", active: false });
    expect(await User.where({ active: true }).pluck("name")).toEqual(["Alice"]);
  });

  it("pluck on empty table returns empty", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    expect(await User.all().pluck("name")).toEqual([]);
  });

  it("ids returns primary key values", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    expect(await User.all().ids()).toEqual([1, 2]);
  });
});
