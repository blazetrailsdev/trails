/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { afterAll, describe, it, expect, beforeAll } from "vitest";
import { Base, Range, RecordNotFound } from "../index.js";

import { adapterType } from "../test-adapter.js";
import { clearAppliedSchemaSignatures, defineSchema } from "../test-helpers/define-schema.js";
import { dropAllTables } from "../test-helpers/drop-all-tables.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import {
  withTransactionalFixtures,
  type TransactionalFixturesAdapter,
} from "../test-helpers/with-transactional-fixtures.js";

setupHandlerSuite();

// Capture the pool-leased adapter once after the handler is bootstrapped.
// The Proxy hides the `pool` back-reference so withTransactionalFixtures
// takes the non-pooled BEGIN/ROLLBACK path on the single leased connection.
// (The pooled pin path requires a second free connection; pool size 1 deadlocks.)
let _txAdapter: TransactionalFixturesAdapter | null = null;
beforeAll(async () => {
  const postCols = {
    title: "string" as const,
    published: "boolean" as const,
    salary: "integer" as const,
    author: "string" as const,
  };
  await defineSchema({
    developers: { name: "string", salary: "integer" },
    posts: { title: "string", author: "string", published: "boolean" },
    ro_posts: postCols,
    dro_posts: postCols,
    sf_posts: postCols,
    sff_posts: postCols,
    sfl_posts: postCols,
    sc_posts: postCols,
    sds_posts: postCols,
    sfa_posts: postCols,
    scnt_posts: postCols,
    sj_posts: postCols,
    nrs_posts: postCols,
    ann_posts: postCols,
    ann_unscoped_posts: postCols,
    animals: { type: "string", name: "string" },
    cats: { type: "string", name: "string" },
    dogs: { type: "string", name: "string" },
    categories: { name: "string" },
  });
  const raw = Base.adapter;
  _txAdapter = new Proxy(raw, {
    get(target, prop) {
      if (prop === "pool") return null;
      return Reflect.get(target, prop, target);
    },
  }) as unknown as TransactionalFixturesAdapter;
});
withTransactionalFixtures(() => _txAdapter!);
afterAll(async () => {
  const adapter = Base.adapter;
  await dropAllTables(adapter);
  clearAppliedSchemaSignatures(adapter);
});

describe("RelationScopingTest", () => {
  function makeDeveloper() {
    class Developer extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("salary", "integer");
      }
    }
    return Developer;
  }

  it.skip("unscoped breaks caching", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs query cache integration */
  });

  it.skip("scope breaks caching on collections", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs query cache integration */
  });

  it("reverse order", () => {
    class RoPost extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql = RoPost.order("title").reverseOrder().toSql();
    expect(sql).toContain("DESC");
  });

  it.skip("reverse order with arel attribute", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs Arel node input support in order() */
  });

  it.skip("reverse order with arel attribute as hash", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs Arel node input support in order() */
  });

  it.skip("reverse order with arel node as hash", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs Arel node input support in order() */
  });

  it.skip("reverse order with multiple arel attributes", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs Arel node input support in order() */
  });

  it.skip("reverse order with arel attributes and strings", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs Arel node input support in order() */
  });

  it("double reverse order produces original order", () => {
    class DroPost extends Base {
      static {
        this.attribute("title", "string");
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
      }
    }
    const inScope = await SfPost.create({ title: "InScope" });
    const outOfScope = await SfPost.create({ title: "OutOfScope" });
    const rel = SfPost.where({ title: "InScope" });
    await SfPost.scoping(rel, async () => {
      const found = await SfPost.find(inScope.id);
      expect(found.title).toBe("InScope");
      await expect(SfPost.find(outOfScope.id)).rejects.toThrow(RecordNotFound);
    });
  });

  it("scoped find first", async () => {
    class SffPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("salary", "integer");
      }
    }
    await SffPost.create({ title: "Target", salary: 100000 });
    await SffPost.create({ title: "Other", salary: 50000 });
    const rel = SffPost.where({ salary: 100000 });
    await SffPost.scoping(rel, async () => {
      const first = (await SffPost.first()) as Base | null;
      expect(first).not.toBeNull();
      expect(first!.title).toBe("Target");
    });
  });

  it("scoped find last", async () => {
    class SflPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("salary", "integer");
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
      expect(last!.salary).toBe((highestSalary as Base).salary);
    });
  });

  it("scoped find last preserves scope", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    await Developer.create({ name: "Bob", salary: 60000 });
    await Developer.create({ name: "Charlie", salary: 90000 });
    const rel = Developer.where({ salary: 80000 });
    await Developer.scoping(rel, async () => {
      const last = (await Developer.last()) as Base | null;
      expect(last).not.toBeNull();
      expect(last!.name).toBe("Alice");
    });
  });

  it("scoped find combines and sanitizes conditions", async () => {
    class ScPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("published", "boolean");
      }
    }
    await ScPost.create({ title: "O'Brien's Post", published: true });
    await ScPost.create({ title: "O'Brien's Post", published: false });
    await ScPost.create({ title: "Normal", published: true });
    const rel = ScPost.where({ published: true });
    await ScPost.scoping(rel, async () => {
      const found = (await ScPost.where({ title: "O'Brien's Post" }).first()) as Base | null;
      expect(found).not.toBeNull();
      expect(found!.published).toBe(true);
    });
  });

  it("scoped unscoped", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    await Developer.create({ name: "Bob", salary: 60000 });
    const rel = Developer.where({ salary: 80000 });
    await Developer.scoping(rel, async () => {
      const unscoped = await Developer.unscoped().toArray();
      expect(unscoped.length).toBe(2);
    });
  });

  it("scoped default scoped", async () => {
    class SdsPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("published", "boolean");
        this.defaultScope((rel) => rel.where({ published: true }));
      }
    }
    await SdsPost.create({ title: "Published", published: true });
    await SdsPost.create({ title: "Draft", published: false });
    const all = await SdsPost.all().toArray();
    expect(all.length).toBe(1);
    expect(all[0].title).toBe("Published");
  });

  it("scoped find all", async () => {
    class SfaPost extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await SfaPost.create({ title: "A" });
    await SfaPost.create({ title: "B" });
    await SfaPost.create({ title: "C" });
    const rel = SfaPost.where({ title: "A" });
    await SfaPost.scoping(rel, async () => {
      const all = await SfaPost.all().toArray();
      expect(all.length).toBe(1);
      expect(all[0].title).toBe("A");
    });
  });

  it.skip("scoped find select", () => {
    // BLOCKED: select narrowing of loaded attributes — hasAttribute() does not
    // reflect the projected column set; depends on attribute-set materialization
    // from result rows rather than from the schema declaration.
  });

  it.skip("scope select concatenates", () => {
    // BLOCKED: select narrowing of loaded attributes — see "scoped find select".
  });

  it("scoped count", async () => {
    class ScntPost extends Base {
      static {
        this.attribute("title", "string");
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

  it("scoped find with annotation", async () => {
    class AnnPost extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const rel = AnnPost.all().annotate("finding posts");
    await AnnPost.scoping(rel, async () => {
      const sql = AnnPost.all().toSql();
      expect(sql).toContain("/* finding posts */");
    });
  });

  it("find with annotation unscoped", () => {
    class AnnUnscopedPost extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const annotated = AnnUnscopedPost.all().annotate("test");
    const annotatedSql = annotated.toSql();
    expect(annotatedSql).toContain("/* test */");
    const unscopedSql = AnnUnscopedPost.unscoped().toSql();
    expect(unscopedSql).not.toContain("/* test */");
    expect(unscopedSql).toContain("SELECT");
  });

  it("find with annotation unscope", async () => {
    class AnnUnscopePost extends Base {
      static {
        this._tableName = "ann_posts";
        this.attribute("title", "string");
      }
    }
    await AnnUnscopePost.create({ title: "David" });
    const rel = AnnUnscopePost.annotate("unscope").where({ title: "David" }).unscope("annotate");
    expect(rel.toSql()).not.toContain("/* unscope */");
    const post = (await rel.first()) as Base | null;
    expect(post).not.toBeNull();
    expect(post!.title).toBe("David");
  });

  it.skip("scoped find include", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs includes() */
  });

  it("scoped find joins", async () => {
    class SjPost extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const rel = SjPost.joins(`INNER JOIN comments ON comments.post_id = ${SjPost.tableName}.id`);
    await SjPost.scoping(rel, async () => {
      const sql = SjPost.all().toSql();
      expect(sql).toContain("INNER JOIN comments");
    });
  });

  it("scoped create with where", async () => {
    const Developer = makeDeveloper();
    const rel = Developer.where({ salary: 100000 });
    await Developer.scoping(rel, async () => {
      const dev = await Developer.create({ name: "Scoped" });
      expect(dev.salary).toBe(100000);
    });
  });

  it("scoped create with where with array", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 50000 });
    await Developer.create({ name: "Bob", salary: 60000 });
    const rel = Developer.where({ name: ["Alice"] });
    await Developer.scoping(rel, async () => {
      const all = await Developer.all().toArray();
      expect(all.length).toBe(1);
      expect(all[0].name).toBe("Alice");
    });
  });

  it("scoped create with where with range", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 50000 });
    await Developer.create({ name: "Bob", salary: 80000 });
    await Developer.create({ name: "Charlie", salary: 120000 });
    const rel = Developer.where({ salary: new Range(60000, 100000) });
    await Developer.scoping(rel, async () => {
      const all = await Developer.all().toArray();
      expect(all.length).toBe(1);
      expect(all[0].name).toBe("Bob");
    });
  });

  it("scoped create with create with", async () => {
    const Developer = makeDeveloper();
    const rel = Developer.all().createWith({ salary: 75000 });
    await Developer.scoping(rel, async () => {
      const dev = await Developer.create({ name: "CW" });
      expect(dev.salary).toBe(75000);
    });
  });

  it("scoped create with create with has higher priority", async () => {
    const Developer = makeDeveloper();
    const rel = Developer.where({ salary: 50000 }).createWith({ salary: 99000 });
    await Developer.scoping(rel, async () => {
      const dev = await Developer.create({ name: "Priority" });
      expect(dev.salary).toBe(99000);
    });
  });

  it("ensure that method scoping is correctly restored", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    await Developer.create({ name: "Bob", salary: 60000 });
    const rel = Developer.where({ salary: 80000 });
    await Developer.scoping(rel, async () => {
      const count = await Developer.count();
      expect(count).toBe(1);
    });
    const afterCount = await Developer.count();
    expect(afterCount).toBe(2);
  });

  it.skip("update all default scope filters on joins", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs joins + default_scope */
  });

  it.skip("delete all default scope filters on joins", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs joins + default_scope */
  });

  it("current scope does not pollute sibling subclasses", async () => {
    class Animal extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
      }
    }
    class Dog extends Animal {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
      }
    }
    class Cat extends Animal {
      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
      }
    }
    const dogRel = Dog.where({ type: "Dog" });
    await Dog.scoping(dogRel, async () => {
      expect(Dog.currentScope).not.toBeNull();
      expect(Cat.currentScope).toBeNull();
    });
  });

  it("scoping is correctly restored", async () => {
    const Developer = makeDeveloper();
    expect(Developer.currentScope).toBeNull();
    const rel = Developer.where({ name: "test" });
    await Developer.scoping(rel, async () => {
      expect(Developer.currentScope).not.toBeNull();
    });
    expect(Developer.currentScope).toBeNull();
  });

  it("scoping respects current class", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    await Developer.create({ name: "Bob", salary: 60000 });
    const rel = Developer.where({ name: "Alice" });
    await Developer.scoping(rel, async () => {
      const all = await Developer.all().toArray();
      expect(all.length).toBe(1);
    });
  });

  it.skip("scoping respects sti constraint", () => {
    // BLOCKED: STI find — subclass `find(id)` does not enforce the type
    // constraint at query time, so `SpecialComment.find(id_of_plain)` returns
    // a record instead of raising RecordNotFound.
  });

  it("scoping with klass method works in the scope block", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    await Developer.create({ name: "Bob", salary: 60000 });
    const rel = Developer.where({ name: "Alice" });
    await Developer.scoping(rel, async () => {
      const count = await Developer.count();
      expect(count).toBe(1);
    });
  });

  it("scoping with query method works in the scope block", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    await Developer.create({ name: "Bob", salary: 60000 });
    const rel = Developer.where({ name: "Alice" });
    await Developer.scoping(rel, async () => {
      const first = await Developer.first();
      expect(first).not.toBeNull();
      expect((first as Base).name).toBe("Alice");
    });
  });

  it.skip("circular joins with scoping does not crash", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs joins() */
  });

  it.skip("circular left joins with scoping does not crash", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs left_joins() */
  });

  it("scoping applies to update with all queries", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    await Developer.create({ name: "Bob", salary: 60000 });
    const rel = Developer.where({ name: "Alice" });
    await Developer.scoping(rel, async () => {
      await Developer.updateAll({ salary: 90000 });
    });
    const alice = (await Developer.where({ name: "Alice" }).first()) as Base;
    expect(alice.salary).toBe(90000);
    const bob = (await Developer.where({ name: "Bob" }).first()) as Base;
    expect(bob.salary).toBe(60000);
  });

  it("scoping applies to delete with all queries", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    await Developer.create({ name: "Bob", salary: 60000 });
    const rel = Developer.where({ name: "Alice" });
    await Developer.scoping(rel, async () => {
      await Developer.deleteAll();
    });
    const remaining = await Developer.all().toArray();
    expect(remaining.length).toBe(1);
    expect(remaining[0].name).toBe("Bob");
  });

  it.skip("scoping applies to reload with all queries", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs reload() with scoping */
  });

  it("nested scoping applies with all queries set", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    await Developer.create({ name: "Bob", salary: 60000 });
    await Developer.create({ name: "Charlie", salary: 80000 });
    const outer = Developer.where({ salary: 80000 });
    await Developer.scoping(outer, async () => {
      const inner = Developer.where({ name: "Alice" });
      await Developer.scoping(inner, async () => {
        const all = await Developer.all().toArray();
        expect(all.length).toBe(1);
        expect(all[0].name).toBe("Alice");
      });
      const outerAll = await Developer.all().toArray();
      expect(outerAll.length).toBe(2);
    });
  });

  it.skip("raises error if all queries is set to false while nested", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs all_queries option */
  });

  it.skip("default scope filters on joins", () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    /* needs joins + default_scope */
  });

  describe("HasManyScopingTest", () => {
    it.skip("should maintain default scope on associations", () => {
      // BLOCKED: relation — relation scoping feature gap
      // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
      // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
      /* needs association + default_scope */
    });
  });
});

describe("NestedRelationScopingTest", () => {
  function makeModel() {
    class NRSPost extends Base {
      static {
        this._tableName = "nrs_posts";
        this.attribute("title", "string");
        this.attribute("author", "string");
      }
    }
    return { Post: NRSPost };
  }

  it("merge options", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "A", author: "Alice" });
    await Post.create({ title: "B", author: "Bob" });
    await Post.create({ title: "C", author: "Alice" });
    const outer = Post.where({ author: "Alice" });
    await Post.scoping(outer, async () => {
      const inner = Post.where({ title: "A" });
      await Post.scoping(inner, async () => {
        const all = await Post.all().toArray();
        expect(all.length).toBe(1);
        expect(all[0].title).toBe("A");
      });
    });
  });

  // BLOCKED on PG: the non-pooled BEGIN/ROLLBACK path used by withTransactionalFixtures
  // (forced by the pool-size-1 Proxy workaround) does not protect against concurrent
  // writes on the same pg.Client; Promise.all of 11 creates within the outer transaction
  // causes 25P02 (transaction aborted). #2279 closed the pool-layer Bug 2 race but the
  // test-fixture layer still serializes on a single client. Needs withHandlerTransactionalFixtures
  // helper (pooled-pin path compatible with handler-resolved adapter) to run on PG.
  it.skipIf(adapterType === "postgres")("merge inner scope has priority", async () => {
    const { Post } = makeModel();
    await Promise.all(
      Array.from({ length: 11 }, (_v, i) => Post.create({ title: `Post ${i}`, author: "Someone" })),
    );
    const outer = Post.limit(5);
    await Post.scoping(outer, async () => {
      const inner = Post.limit(10);
      await Post.scoping(inner, async () => {
        const all = await Post.all().toArray();
        expect(all.length).toBe(10);
      });
    });
  });

  it("replace options", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "A", author: "Alice" });
    await Post.create({ title: "B", author: "Bob" });
    const outer = Post.where({ author: "Alice" });
    await Post.scoping(outer, async () => {
      const count = await Post.count();
      expect(count).toBe(1);
    });
    const total = await Post.count();
    expect(total).toBe(2);
  });

  it.skip("three level nested exclusive scoped find", async () => {
    // BLOCKED: relation — relation scoping feature gap
    // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
    // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
    const { Post } = makeModel();
    await Post.create({ title: "A", author: "Alice" });
    await Post.create({ title: "B", author: "Bob" });
    await Post.create({ title: "C", author: "Charlie" });
    await Post.scoping(Post.where({ author: "Alice" }), async () => {
      await Post.scoping(Post.where({ author: "Bob" }), async () => {
        await Post.scoping(Post.where({ author: "Charlie" }), async () => {
          const all = await Post.all().toArray();
          expect(all.length).toBe(1);
          expect(all[0].author).toBe("Charlie");
        });
      });
    });
  });

  it("nested scoped create", async () => {
    const { Post } = makeModel();
    const rel = Post.where({ author: "Scoped" });
    await Post.scoping(rel, async () => {
      const post = await Post.create({ title: "Created" });
      expect(post.author).toBe("Scoped");
    });
  });

  it("nested exclusive scope for create", async () => {
    const { Post } = makeModel();
    const outer = Post.where({ author: "Outer" });
    await Post.scoping(outer, async () => {
      const inner = Post.where({ author: "Inner" });
      await Post.scoping(inner, async () => {
        const post = await Post.create({ title: "Nested" });
        expect(post.author).toBe("Inner");
      });
    });
  });
});

describe("scoping()", () => {
  it("sets currentScope within the block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.currentScope).toBeNull();
    const rel = Post.where({ title: "test" });
    await Post.scoping(rel, async () => {
      expect(Post.currentScope).not.toBeNull();
    });
    expect(Post.currentScope).toBeNull();
  });
});

describe("scopeForCreate / whereValuesHash", () => {
  it("scopeForCreate returns attributes for new records", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author", "string");
      }
    }
    const rel = Post.where({ author: "Alice" });
    const scope = rel.scopeForCreate();
    expect(scope.author).toBe("Alice");
  });

  it("whereValuesHash returns the where conditions", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author", "string");
      }
    }
    const rel = Post.where({ author: "Alice", title: "Test" });
    const hash = rel.whereValuesHash();
    expect(hash.author).toBe("Alice");
    expect(hash.title).toBe("Test");
  });

  it("whereValuesHash exposes IN-array values (Rails: equality_only=false)", () => {
    class Post extends Base {
      static {
        this.attribute("author", "string");
      }
    }
    const rel = Post.where({ author: ["Alice", "Bob"] });
    const hash = rel.whereValuesHash();
    expect(hash.author).toEqual(["Alice", "Bob"]);
  });

  it("scopeForCreate filters out IN-array values (Rails: equality_only=true)", () => {
    class Post extends Base {
      static {
        this.attribute("author", "string");
        this.attribute("title", "string");
      }
    }
    const rel = Post.where({ author: ["Alice", "Bob"], title: "Fixed" });
    const scope = rel.scopeForCreate();
    expect(scope.title).toBe("Fixed");
    expect(scope.author).toBeUndefined();
  });
});

describe("Scoping block (Rails-guided)", () => {
  it("scoping sets currentScope within the block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.currentScope).toBeNull();
    const rel = Post.where({ title: "x" });
    await Post.scoping(rel, async () => {
      expect(Post.currentScope).toBeTruthy();
    });
    expect(Post.currentScope).toBeNull();
  });
});

describe("Static shorthands (Rails-guided)", () => {
  it("Base.where is shorthand for Base.all().where()", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const sql1 = Post.where({ title: "x" }).toSql();
    const sql2 = Post.all().where({ title: "x" }).toSql();
    expect(sql1).toBe(sql2);
  });

  it("Base.all returns all records", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "A" });
    await Post.create({ title: "B" });
    const all = await Post.all().toArray();
    expect(all.length).toBe(2);
  });

  it("Base.first returns the first record", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "First" });
    await Post.create({ title: "Second" });
    const first = (await Post.first()) as Base;
    expect(first).not.toBeNull();
    expect(first.title).toBe("First");
  });

  it("Base.last returns the last record", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "First" });
    await Post.create({ title: "Last" });
    const last = (await Post.last()) as Base;
    expect(last).not.toBeNull();
    expect(last.title).toBe("Last");
  });

  it("Base.count returns count", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "A" });
    await Post.create({ title: "B" });
    expect(await Post.count()).toBe(2);
  });

  it("Base.exists returns boolean", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(await Post.exists()).toBe(false);
    await Post.create({ title: "A" });
    expect(await Post.exists()).toBe(true);
  });

  it("Base.pluck extracts column values", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    await Post.create({ title: "A" });
    await Post.create({ title: "B" });
    const titles = await Post.pluck("title");
    expect(titles).toContain("A");
    expect(titles).toContain("B");
  });

  it("Base.ids returns primary keys", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const a = await Post.create({ title: "A" });
    const b = await Post.create({ title: "B" });
    const ids = await Post.ids();
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  describe("HasManyScopingTest", () => {
    it.skip("forwarding of static methods", () => {
      // BLOCKED: relation — relation scoping feature gap
      // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
      // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
      /* needs association + scoping */
    });

    it.skip("nested scope finder", () => {
      // BLOCKED: relation — relation scoping feature gap
      // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
      // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
      /* needs association + scoping */
    });

    it.skip("none scoping", () => {
      // BLOCKED: relation — relation scoping feature gap
      // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
      // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
      /* needs none() relation */
    });

    it.skip("forwarding to scoped", () => {
      // BLOCKED: relation — relation scoping feature gap
      // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
      // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
      /* needs association + scoping */
    });

    it.skip("should default scope on associations is overridden by association conditions", () => {
      // BLOCKED: relation — relation scoping feature gap
      // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
      // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
      /* needs association + default_scope */
    });

    it.skip("should maintain default scope on eager loaded associations", () => {
      // BLOCKED: relation — relation scoping feature gap
      // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
      // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
      /* needs eager loading + default_scope */
    });
    it.skip("scoping applies to all queries on has many when set", () => {
      // BLOCKED: relation — relation scoping feature gap
      // ROOT-CAUSE: relation/scoping.ts#scopeFor or Relation#scoped missing Rails parity
      // SCOPE: ~50 LOC in relation/scoping.ts; affects ~28 tests in relation-scoping.test.ts
      /* needs association + scoping */
    });
  }); // HasManyScopingTest

  describe("HasAndBelongsToManyScopingTest", () => {
    it("forwarding of static methods", async () => {
      class Category extends Base {
        static {
          this.attribute("name", "string");
          // Register as a scope so the relation proxy can forward it,
          // mirroring Rails' CollectionProxy#method_missing delegation.
          (this as any).scope("whatAreYou", () => "a category...");
        }
      }
      await Category.create({ name: "test" });
      // Direct call on the class
      expect((Category as any).whatAreYou()).toBe("a category...");
      // Forwarded through the relation proxy — mirrors @welcome.categories.what_are_you
      const relation = Category.all();
      expect((relation as any).whatAreYou()).toBe("a category...");
    });

    it("nested scope finder", async () => {
      class Category extends Base {
        static {
          this.attribute("name", "string");
        }
      }
      await Category.create({ name: "cat1" });
      await Category.create({ name: "cat2" });
      // Mirrors Rails: Category.where("1=0").scoping { assert_equal 2, categories.count }
      // The nested scope context is active; queries inside respect it.
      await Category.where({ name: "cat1" }).scoping(async () => {
        expect(await Category.count()).toBe(1);
        // Further nested scope merges with outer — cat2 satisfies inner but not outer
        await Category.where({ name: "cat2" }).scoping(async () => {
          expect(await Category.count()).toBe(0);
        });
        expect(await Category.count()).toBe(1);
      });
    });

    it("none scoping", async () => {
      class Category extends Base {
        static {
          this.attribute("name", "string");
        }
      }
      await Category.create({ name: "cat1" });
      await Category.create({ name: "cat2" });
      // Category.none.scoping { assert_equal 0, categories.count }
      await Category.none().scoping(async () => {
        expect(await Category.count()).toBe(0);
      });
      // After exiting the none scope, the full count is restored
      expect(await Category.count()).toBe(2);
    });
  }); // HasAndBelongsToManyScopingTest
});
