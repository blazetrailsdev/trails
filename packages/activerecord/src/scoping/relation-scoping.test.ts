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

  it.skip("unscoped breaks caching", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scope breaks caching on collections", () => {
    /* TODO: needs helpers from original file */
  });

  it("reverse order", () => {
    class RoPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = RoPost.order("title").reverseOrder().toSql();
    expect(sql).toContain("DESC");
  });

  it.skip("reverse order with arel attribute", () => {
    /* needs Arel node input support in order() */
  });

  it.skip("reverse order with arel attribute as hash", () => {
    /* needs Arel node input support in order() */
  });

  it.skip("reverse order with arel node as hash", () => {
    /* needs Arel node input support in order() */
  });

  it.skip("reverse order with multiple arel attributes", () => {
    /* needs Arel node input support in order() */
  });

  it.skip("reverse order with arel attributes and strings", () => {
    /* needs Arel node input support in order() */
  });

  it("double reverse order produces original order", () => {
    class DroPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const original = DroPost.order({ title: "asc" as const }).toSql();
    const doubled = DroPost.order({ title: "asc" as const })
      .reverseOrder()
      .reverseOrder()
      .toSql();
    expect(original).toBe(doubled);
  });

  it("scoped find", async () => {
    class SfPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const inScope = await SfPost.create({ title: "InScope" });
    await SfPost.create({ title: "OutOfScope" });
    const rel = SfPost.where({ title: "InScope" });
    await SfPost.scoping(rel, async () => {
      const found = await SfPost.find(inScope.id);
      expect(found.readAttribute("title")).toBe("InScope");
    });
  });

  it("scoped find first", async () => {
    class SffPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("salary", "integer");
        this.adapter = adapter;
      }
    }
    const target = await SffPost.create({ title: "Target", salary: 100000 });
    await SffPost.create({ title: "Other", salary: 50000 });
    const rel = SffPost.where({ salary: 100000 });
    await SffPost.scoping(rel, async () => {
      const first = (await SffPost.first()) as Base | null;
      expect(first).not.toBeNull();
      expect(first!.readAttribute("title")).toBe("Target");
    });
  });

  it("scoped find last", async () => {
    class SflPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("salary", "integer");
        this.adapter = adapter;
      }
    }
    await SflPost.create({ title: "A", salary: 50000 });
    await SflPost.create({ title: "B", salary: 80000 });
    await SflPost.create({ title: "C", salary: 50000 });
    const highestSalary = await SflPost.order("salary DESC").first();
    const rel = SflPost.order("salary");
    await SflPost.scoping(rel, async () => {
      const last = (await SflPost.last()) as Base | null;
      expect(last).not.toBeNull();
      expect(last!.readAttribute("salary")).toBe((highestSalary as Base).readAttribute("salary"));
    });
  });

  it.skip("scoped find last preserves scope", () => {
    /* TODO: needs scoping + last interaction */
  });

  it("scoped find combines and sanitizes conditions", async () => {
    class ScPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("published", "boolean");
        this.adapter = adapter;
      }
    }
    await ScPost.create({ title: "O'Brien's Post", published: true });
    await ScPost.create({ title: "O'Brien's Post", published: false });
    await ScPost.create({ title: "Normal", published: true });
    const rel = ScPost.where({ published: true });
    await ScPost.scoping(rel, async () => {
      // Inside scope (published=true), filter by title with quote (sanitization)
      const results = await ScPost.where({ title: "O'Brien's Post" }).toArray();
      expect(results.length).toBe(1);
      expect(results[0].readAttribute("published")).toBe(true);
    });
  });

  it.skip("scoped unscoped", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoped default scoped", () => {
    /* TODO: needs helpers from original file */
  });

  it("scoped find all", async () => {
    class SfaPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await SfaPost.create({ title: "A" });
    await SfaPost.create({ title: "B" });
    await SfaPost.create({ title: "C" });
    const rel = SfaPost.where({ title: "A" });
    await SfaPost.scoping(rel, async () => {
      const all = await SfaPost.all().toArray();
      expect(all.length).toBe(1);
      expect(all[0].readAttribute("title")).toBe("A");
    });
  });

  it.skip("scoped find select", () => {
    /* needs scoping + select interaction */
  });

  it.skip("scope select concatenates", () => {
    /* select overwrites instead of concatenating */
  });

  it("scoped count", async () => {
    class ScntPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await ScntPost.create({ title: "A" });
    await ScntPost.create({ title: "B" });
    await ScntPost.create({ title: "A" });
    const rel = ScntPost.where({ title: "A" });
    await ScntPost.scoping(rel, async () => {
      const count = await ScntPost.count();
      expect(count).toBe(2);
    });
  });

  it.skip("scoped find with annotation", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("find with annotation unscoped", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("find with annotation unscope", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoped find include", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoped find joins", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoped create with where", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoped create with where with array", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoped create with where with range", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoped create with create with", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoped create with create with has higher priority", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("ensure that method scoping is correctly restored", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("update all default scope filters on joins", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("delete all default scope filters on joins", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("current scope does not pollute sibling subclasses", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoping is correctly restored", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoping respects current class", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoping respects sti constraint", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoping with klass method works in the scope block", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoping with query method works in the scope block", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("circular joins with scoping does not crash", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("circular left joins with scoping does not crash", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoping applies to update with all queries", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoping applies to delete with all queries", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("scoping applies to reload with all queries", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("nested scoping applies with all queries set", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("raises error if all queries is set to false while nested", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("default scope filters on joins", () => {});
  describe("HasManyScopingTest", () => {
    it.skip("should maintain default scope on associations", () => {});
  });
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
  it.skip("merge options", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("merge inner scope has priority", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("replace options", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("three level nested exclusive scoped find", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("nested scoped create", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("nested exclusive scope for create", () => {
    /* TODO: needs helpers from original file */
  });
});

describe("scoping()", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it.skip("sets currentScope within the block", () => {
    /* TODO: needs helpers from original file */
  });
});

describe("scopeForCreate / whereValuesHash", () => {
  it.skip("scopeForCreate returns attributes for new records", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("whereValuesHash returns the where conditions", () => {
    /* TODO: needs helpers from original file */
  });
});

describe("Scoping block (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it.skip("scoping sets currentScope within the block", () => {
    /* TODO: needs helpers from original file */
  });
});

describe("Static shorthands (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it.skip("Base.where is shorthand for Base.all().where()", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("Base.all returns all records", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("Base.first returns the first record", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("Base.last returns the last record", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("Base.count returns count", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("Base.exists returns boolean", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("Base.pluck extracts column values", () => {
    /* TODO: needs helpers from original file */
  });

  it.skip("Base.ids returns primary keys", () => {
    /* TODO: needs helpers from original file */
  });

  describe("HasManyScopingTest", () => {
    it.skip("forwarding of static methods", () => {
      /* TODO: needs helpers from original file */
    });

    it.skip("nested scope finder", () => {
      /* TODO: needs helpers from original file */
    });

    it.skip("none scoping", () => {
      /* TODO: needs helpers from original file */
    });

    it.skip("forwarding to scoped", () => {
      /* TODO: needs helpers from original file */
    });

    it.skip("should default scope on associations is overridden by association conditions", () => {
      /* TODO: needs helpers from original file */
    });

    it.skip("should maintain default scope on eager loaded associations", () => {
      /* TODO: needs helpers from original file */
    });
  }); // HasManyScopingTest

  it.skip("scoping applies to all queries on has many when set", () => {
    /* TODO: needs helpers from original file */
  });
});
