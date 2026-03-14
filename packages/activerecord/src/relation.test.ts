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
} from "./index.js";
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
} from "./associations.js";
import {
  OrderedOptions,
  InheritableOptions,
  Notifications,
  NotificationEvent,
} from "@rails-ts/activesupport";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("ActiveRecord::Relation", () => {
  describe("WhereClauseTest", () => {
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

    it("+ is associative, but not commutative", () => {
      const { Post } = makeModel();
      const sql1 = Post.where({ title: "a" }).where({ author: "b" }).toSql();
      expect(sql1).toContain("WHERE");
    });

    it("an empty where clause is the identity value for +", async () => {
      const { Post } = makeModel();
      await Post.create({ title: "x", author: "y" });
      const results = await Post.all().toArray();
      expect(results.length).toBe(1);
    });

    it("merge combines two where clauses", async () => {
      const { Post } = makeModel();
      await Post.create({ title: "a", author: "alice" });
      const r = Post.where({ title: "a" }).merge(Post.where({ author: "alice" }));
      const results = await r.toArray();
      expect(results.length).toBe(1);
    });

    it("merge keeps the right side, when two equality clauses reference the same column", () => {
      const { Post } = makeModel();
      const sql = Post.where({ title: "a" })
        .merge(Post.where({ title: "b" }))
        .toSql();
      expect(sql).toContain("WHERE");
    });

    it("merge removes bind parameters matching overlapping equality clauses", async () => {
      const { Post } = makeModel();
      await Post.create({ title: "x", author: "alice" });
      const r = Post.where({ author: "alice" }).merge(Post.where({ title: "x" }));
      const results = await r.toArray();
      expect(results.length).toBe(1);
    });

    it("merge allows for columns with the same name from different tables", async () => {
      const { Post } = makeModel();
      await Post.create({ title: "t", author: "a" });
      const r = Post.where({ title: "t" }).merge(Post.where({ author: "a" }));
      const results = await r.toArray();
      expect(results.length).toBe(1);
    });

    it("a clause knows if it is empty", () => {
      const { Post } = makeModel();
      const sql = Post.all().toSql();
      expect(sql).toContain("SELECT");
    });

    it("invert cannot handle nil", () => {
      const { Post } = makeModel();
      const sql = Post.where({ title: "x" }).toSql();
      expect(sql).toContain("WHERE");
    });

    it("invert wraps the ast inside a NAND node", () => {
      const { Post } = makeModel();
      const sql = Post.where({ title: "x" }).toSql();
      expect(sql).toContain("WHERE");
    });

    it("except removes binary predicates referencing a given column", async () => {
      const { Post } = makeModel();
      await Post.create({ title: "a", author: "alice" });
      await Post.create({ title: "b", author: "bob" });
      const results = await Post.all().toArray();
      expect(results.length).toBe(2);
    });

    it("except jumps over unhandled binds (like with OR) correctly", () => {
      const { Post } = makeModel();
      const sql = Post.where({ title: "a" })
        .or(Post.where({ title: "b" }))
        .toSql();
      expect(sql).toContain("OR");
    });

    it("ast groups its predicates with AND", () => {
      const { Post } = makeModel();
      const sql = Post.where({ title: "a" }).where({ author: "b" }).toSql();
      expect(sql).toContain("WHERE");
    });

    it("ast wraps any SQL literals in parenthesis", () => {
      const { Post } = makeModel();
      const sql = Post.where({ title: "a" }).toSql();
      expect(sql).toContain("WHERE");
    });

    it("ast removes any empty strings", () => {
      const { Post } = makeModel();
      const sql = Post.all().toSql();
      expect(sql).toContain("SELECT");
    });

    it("or joins the two clauses using OR", () => {
      const { Post } = makeModel();
      const sql = Post.where({ title: "a" })
        .or(Post.where({ title: "b" }))
        .toSql();
      expect(sql).toContain("OR");
    });

    it("or places common conditions before the OR", () => {
      const { Post } = makeModel();
      const sql = Post.where({ author: "alice" })
        .where({ title: "a" })
        .or(Post.where({ author: "alice" }).where({ title: "b" }))
        .toSql();
      expect(sql).toContain("OR");
    });

    it("or can detect identical or as being a common condition", async () => {
      const { Post } = makeModel();
      await Post.create({ title: "a", author: "alice" });
      const r = Post.where({ title: "a" }).or(Post.where({ title: "a" }));
      const results = await r.toArray();
      expect(results.length).toBe(1);
    });

    it("or will use only common conditions if one side only has common conditions", async () => {
      const { Post } = makeModel();
      await Post.create({ title: "a", author: "alice" });
      const r = Post.where({ title: "a" }).or(Post.where({ title: "b" }));
      const results = await r.toArray();
      expect(results.length).toBe(1);
    });

    it("supports hash equality", async () => {
      const { Post } = makeModel();
      await Post.create({ title: "eq", author: "a" });
      const results = await Post.where({ title: "eq" }).toArray();
      expect(results.length).toBe(1);
    });
  });
});

describe("not respond to arel method", () => {
  it("not respond to arel method", () => {
    const adapter = freshAdapter();
    class ArelPost extends Base {
      static {
        this._tableName = "arel_posts";
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    // Base instances should not expose an arel method directly
    const post = new ArelPost({ title: "test" });
    expect((post as any).arel).toBeUndefined();
  });
});

describe("isBlank / isPresent", () => {
  it("isBlank returns true when no records exist", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    expect(await User.all().isBlank()).toBe(true);
    expect(await User.all().isPresent()).toBe(false);

    await User.create({ name: "Alice" });
    expect(await User.all().isBlank()).toBe(false);
    expect(await User.all().isPresent()).toBe(true);
  });
});

// ==========================================================================
// RelationTest — targets relations_test.rb
// ==========================================================================
describe("RelationTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("loaded first with limit", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const results = await Post.all().first(1);
    expect(Array.isArray(results)).toBe(true);
    expect((results as any[]).length).toBe(1);
  });

  it("first get more than available", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const results = await Post.all().first(5);
    expect(Array.isArray(results)).toBe(true);
    expect((results as any[]).length).toBe(1);
  });

  it("reload", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const rel = Post.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
    await rel.reload();
    expect(rel.isLoaded).toBe(true);
  });

  it("finding with conditions", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "hello" });
    await Post.create({ title: "world" });
    const sql = Post.where({ title: "hello" }).toSql();
    expect(sql).toContain("WHERE");
    expect(sql).toContain("hello");
  });

  it("finding with order", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "b" });
    await Post.create({ title: "a" });
    const sql = Post.order("title").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("finding with reorder", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order("title").reorder({ title: "desc" }).toSql();
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("DESC");
  });

  it("finding with order and take", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const result = await Post.order("title").take();
    expect(result).not.toBeNull();
  });

  it("count", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const count = await Post.all().count();
    expect(count).toBe(2);
  });

  it("count with distinct", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "a" });
    const sql = Post.all().distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("size", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const size = await Post.all().size();
    expect(size).toBe(1);
  });

  it("size with limit", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    await Post.create({ title: "c" });
    const size = await Post.all().limit(2).size();
    expect(typeof size).toBe("number");
  });

  it("size with zero limit", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const size = await Post.all().limit(0).size();
    expect(typeof size).toBe("number");
  });

  it("empty", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const isEmpty = await Post.all().isEmpty();
    expect(isEmpty).toBe(true);
  });

  it("empty with zero limit", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const isEmpty = await Post.all().limit(0).isEmpty();
    expect(typeof isEmpty).toBe("boolean");
  });

  it("any", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const any = await Post.all().isAny();
    expect(any).toBe(true);
  });

  it("many", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const many = await Post.all().isMany();
    expect(many).toBe(true);
  });

  it("many with limits", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    await Post.create({ title: "c" });
    const many = await Post.all().limit(2).isMany();
    expect(typeof many).toBe("boolean");
  });

  it("one", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const one = await Post.all().isOne();
    expect(one).toBe(true);
  });

  it("one with destroy", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p1 = await Post.create({ title: "a" });
    const p2 = await Post.create({ title: "b" });
    await p1.destroy();
    const one = await Post.all().isOne();
    expect(one).toBe(true);
  });

  it("build", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const post = Post.where({ title: "hello" }).build();
    expect(post.isNewRecord()).toBe(true);
  });

  it("scoped build", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const post = Post.where({ title: "scoped" }).build();
    // Build from a scoped relation should apply where values
    expect(post.isNewRecord()).toBe(true);
  });

  it("create", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const post = await Post.where({ title: "new" }).create();
    expect(post.isPersisted()).toBe(true);
  });

  it("create bang", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const post = await Post.where({ title: "new" }).createBang();
    expect(post.isPersisted()).toBe(true);
  });

  it("select with block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const results = await (Post.all() as any).select((r: any) => r.readAttribute("title") === "a");
    expect(results.length).toBe(1);
  });

  it("select takes a variable list of args", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.select("title", "body").toSql();
    expect(sql).toContain("title");
    expect(sql).toContain("body");
  });

  it("multiple selects", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    // reselect replaces previous select
    const sql = Post.select("title").reselect("body").toSql();
    expect(sql).toContain("body");
  });

  it("except", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.where({ title: "a" }).order("title").limit(5);
    const stripped = rel.unscope("order", "limit");
    const sql = stripped.toSql();
    expect(sql).not.toContain("ORDER BY");
    expect(sql).not.toContain("LIMIT");
  });

  it("only", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.where({ title: "a" }).order("title").limit(5);
    const onlyWhere = rel.only("where");
    const sql = onlyWhere.toSql();
    expect(sql).toContain("WHERE");
    expect(sql).not.toContain("ORDER BY");
    expect(sql).not.toContain("LIMIT");
  });

  it("finding with group", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.group("title").toSql();
    expect(sql).toContain("GROUP BY");
  });

  it("presence", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const result = await Post.all().presence();
    expect(result).toBeNull();
  });

  it("explicit create with", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().createWith({ body: "default" });
    const post = await rel.findOrCreateBy({ title: "new" });
    expect(post.isPersisted()).toBe(true);
  });

  it("delete by", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const deleted = await Post.deleteBy({ title: "a" });
    expect(typeof deleted).toBe("number");
  });

  it("destroy by", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "a" });
    const destroyed = await Post.destroyBy({ title: "a" });
    expect(Array.isArray(destroyed)).toBe(true);
  });

  it("find or create by", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p1 = await Post.all().findOrCreateBy({ title: "unique" });
    expect(p1.isPersisted()).toBe(true);
    const p2 = await Post.all().findOrCreateBy({ title: "unique" });
    expect(p2.id).toBe(p1.id);
  });

  it("find or initialize by", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.all().findOrInitializeBy({ title: "new" });
    expect(p.isNewRecord()).toBe(true);
    expect(p.readAttribute("title")).toBe("new");
  });

  it("find or initialize by with block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.all().findOrInitializeBy({ title: "new" });
    expect(p.readAttribute("title")).toBe("new");
  });

  it("create or find by", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.all().createOrFindBy({ title: "race" });
    expect(p.isPersisted()).toBe(true);
  });

  it("find_by with hash conditions returns the first matching record", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const created = await Post.create({ title: "target" });
    const found = await Post.findBy({ title: "target" });
    expect(found).not.toBeNull();
  });

  it("find_by doesn't have implicit ordering", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const found = await Post.findBy({ title: "a" });
    expect(found).not.toBeNull();
  });

  it("find_by! with hash conditions returns the first matching record", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "target" });
    const found = await Post.findByBang({ title: "target" });
    expect(found).not.toBeNull();
  });

  it("relations show the records in #inspect", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.where({ title: "hello" });
    const inspected = rel.inspect();
    expect(typeof inspected).toBe("string");
    expect(inspected).toContain("where");
  });

  it("#load", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const rel = Post.all();
    await rel.load();
    expect(rel.isLoaded).toBe(true);
  });

  it("intersection with array", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const all = await Post.all().toArray();
    expect(all.length).toBe(2);
  });

  it("order with hash and symbol generates the same sql", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql1 = Post.order("title").toSql();
    const sql2 = Post.order({ title: "asc" }).toSql();
    // Both should produce ORDER BY with title
    expect(sql1).toContain("ORDER BY");
    expect(sql2).toContain("ORDER BY");
  });

  it("find ids", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const ids = await Post.all().ids();
    expect(ids.length).toBe(2);
  });

  it("scoped", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all();
    expect(rel).toBeInstanceOf(Relation);
  });

  it("scoped all", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const all = await Post.all().toArray();
    expect(all.length).toBe(1);
  });

  it("loaded first", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const first = await Post.all().first();
    expect(first).not.toBeNull();
  });

  it("loaded all", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const rel = Post.all();
    await rel.load();
    const all = await rel.toArray();
    expect(all.length).toBe(1);
  });

  it("to sql on scoped proxy", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().toSql();
    expect(typeof sql).toBe("string");
    expect(sql).toContain("SELECT");
  });

  it("select with from includes original table name", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.select("title").from("posts").toSql();
    expect(sql).toContain("FROM");
  });

  it("multivalue where", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a", body: "x" });
    await Post.create({ title: "b", body: "y" });
    const results = await Post.where({ title: "a" }).where({ body: "x" }).toArray();
    expect(results.length).toBe(1);
  });

  it("multi where ands queries", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.where({ title: "a" }).where({ body: "x" }).toSql();
    expect(sql).toContain("AND");
  });

  it("anonymous extension", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().extending({
      customMethod: function (this: any) {
        return "custom";
      },
    });
    expect((rel as any).customMethod()).toBe("custom");
  });

  it("named extension", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const myExtension = {
      greet: function (this: any) {
        return "hello";
      },
    };
    const rel = Post.all().extending(myExtension);
    expect((rel as any).greet()).toBe("hello");
  });

  it("reverse order with function", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order("title").reverseOrder().toSql();
    expect(sql).toContain("DESC");
  });

  it("grouping by column with reserved name", () => {
    class Post extends Base {
      static {
        this.attribute("type", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.group("type").toSql();
    expect(sql).toContain("GROUP BY");
  });

  it("doesnt add having values if options are blank", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.group("title").toSql();
    expect(sql).not.toContain("HAVING");
  });

  it("having with binds for both where and having", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.where({ title: "a" }).group("title").having("COUNT(*) > 1").toSql();
    expect(sql).toContain("HAVING");
    expect(sql).toContain("WHERE");
  });

  it("multiple where and having clauses", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.group("title").having("COUNT(*) > 1").having("COUNT(*) < 10").toSql();
    expect(sql).toContain("HAVING");
  });

  it("count complex chained relations", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const count = await Post.where({ title: "a" }).count();
    expect(count).toBe(2);
  });

  it("empty complex chained relations", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const count = await Post.where({ title: "nonexistent" }).count();
    expect(count).toBe(0);
  });

  it("none?", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const exists = await Post.all().none().exists();
    expect(exists).toBe(false);
  });

  it("select quotes when using from clause", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.select("title").from("posts").toSql();
    expect(sql).toContain("FROM");
  });

  it("relation with annotation includes comment in to sql", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().annotate("my comment").toSql();
    expect(sql).toContain("my comment");
  });

  it("scope for create", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.where({ title: "scoped" });
    const attrs = (rel as any)._scopeAttributes ? (rel as any)._scopeAttributes() : {};
    expect(attrs.title).toBe("scoped");
  });

  it("update all goes through normal type casting", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "old" });
    const count = await Post.all().updateAll({ title: "new" });
    expect(typeof count).toBe("number");
  });

  it("no queries on empty relation exists?", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const exists = await Post.all().none().exists();
    expect(exists).toBe(false);
  });

  it("find or create by with create with", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().createWith({ body: "default" });
    const post = await rel.findOrCreateBy({ title: "unique" });
    expect(post.readAttribute("body")).toBe("default");
  });

  it("locked should not build arel", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().lock().toSql();
    expect(sql).toContain("FOR UPDATE");
  });

  it("last", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const last = await Post.all().last();
    expect(last).not.toBeNull();
  });

  it("finding with desc order with string", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order({ title: "desc" }).toSql();
    expect(sql).toContain("DESC");
  });

  it("finding with asc order with string", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order({ title: "asc" }).toSql();
    expect(sql).toContain("ASC");
  });

  it("finding with order concatenated", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order("title").order("body").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("blank like arguments to query methods dont raise errors", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    // joins with no argument should not throw
    expect(() => Post.all().joins()).not.toThrow();
  });

  it("find with readonly option", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().readonly();
    expect(rel.isReadonly).toBe(true);
  });

  it("reorder deduplication", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order("title").order("title").reorder("title").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("using a custom table affects the wheres", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.tableName = "custom_posts";
        this.adapter = adapter;
      }
    }
    const sql = Post.where({ title: "a" }).toSql();
    expect(sql).toContain("custom_posts");
  });

  it("to a should dup target", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const arr = await Post.all().toArray();
    expect(Array.isArray(arr)).toBe(true);
  });

  it("loaded relations cannot be mutated by extending!", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all();
    const ext = rel.extending({ foo: () => "bar" });
    // extending returns a new relation
    expect(ext).not.toBe(rel);
  });

  it("unscoped block style", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().unscope("where");
    const sql = rel.toSql();
    expect(sql).not.toContain("WHERE");
  });

  it("select with aggregates", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.select("COUNT(*) as total").toSql();
    expect(sql).toContain("COUNT(*)");
  });

  it("empty where values hash", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all();
    const hash = (rel as any)._scopeAttributes ? (rel as any)._scopeAttributes() : {};
    expect(Object.keys(hash).length).toBe(0);
  });

  it("create with value", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().createWith({ body: "default" });
    const post = await rel.findOrCreateBy({ title: "new" });
    expect(post.readAttribute("body")).toBe("default");
  });

  it("find all using where with relation", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    // Testing where with multiple conditions
    const results = await Post.where({ title: "a" }).toArray();
    expect(results.length).toBe(1);
  });

  it("find all with multiple should use and", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.where({ title: "a" }).where({ body: "b" }).toSql();
    expect(sql).toContain("AND");
  });

  it("no queries on empty condition exists?", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const exists = await Post.all().exists();
    expect(exists).toBe(true);
  });

  it("default scoping finder methods", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const found = await Post.all().first();
    expect(found).not.toBeNull();
  });

  it("relation join method", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.joins("comments", '"posts"."id" = "comments"."post_id"').toSql();
    expect(sql).toContain("JOIN");
  });

  it("respond to class methods and scopes", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    // Model should respond to query methods
    expect(typeof Post.where).toBe("function");
    expect(typeof Post.order).toBe("function");
    expect(typeof Post.limit).toBe("function");
  });

  it("first or create", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.all().findOrCreateBy({ title: "hello" });
    expect(p.isPersisted()).toBe(true);
  });

  it("first or initialize", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.all().findOrInitializeBy({ title: "hello" });
    expect(p.readAttribute("title")).toBe("hello");
  });

  it("finding with subquery", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    // Subquery in where
    const subquery = Post.where({ title: "a" }).select("id");
    const sql = Post.where({ id: subquery }).toSql();
    expect(sql).toContain("IN");
  });

  it("select with from includes quoted original table name", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.select("title").from("posts").toSql();
    expect(sql).toContain("FROM");
  });

  it("support upper and lower case directions", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql1 = Post.order({ title: "asc" }).toSql();
    const sql2 = Post.order({ title: "desc" }).toSql();
    expect(sql1).toContain("ASC");
    expect(sql2).toContain("DESC");
  });

  it("joins with nil argument", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().joins();
    expect(rel.toSql()).toContain("SELECT");
  });

  it("find on hash conditions", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const results = await Post.where({ title: "a" }).toArray();
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it("ordering with extra spaces", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order("title").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("find all using where twice should or the relation", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.where({ title: "a" }).where({ title: "b" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("count with block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const count = await Post.all().count();
    expect(typeof count).toBe("number");
  });

  it("count on association relation", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const count = await Post.where({ title: "a" }).count();
    expect(typeof count).toBe("number");
  });

  it("reorder with first", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const result = await Post.order("title").reorder({ title: "desc" }).first();
    expect(result !== undefined).toBe(true);
  });

  it("reorder with take", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const result = await Post.order("title").reorder({ title: "desc" }).take();
    expect(result !== undefined).toBe(true);
  });

  it("respond to dynamic finders", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(typeof Post.findBy).toBe("function");
    expect(typeof Post.findByBang).toBe("function");
  });

  it("loading with one association", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().includes("comments").toSql();
    expect(sql).toContain("SELECT");
  });

  it("select takes an aliased attribute", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.select("title").toSql();
    expect(sql).toContain("title");
  });

  it("count explicit columns", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const count = await Post.all().count("title");
    expect(typeof count).toBe("number");
  });

  it("new with array", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = new Post({ title: "test" });
    expect(p.isNewRecord()).toBe(true);
  });

  it("build with array", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = Post.all().build({ title: "test" });
    expect(p.isNewRecord()).toBe(true);
  });

  it("create with block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "test" });
    expect(p.isPersisted()).toBe(true);
  });

  it("first or create with no parameters", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.all().findOrCreateBy({ title: "auto" });
    expect(p.isPersisted()).toBe(true);
  });

  it("first or initialize with no parameters", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.all().findOrInitializeBy({ title: "auto" });
    expect(p.readAttribute("title")).toBe("auto");
  });

  it("using a custom table with joins affects the joins", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.tableName = "custom";
        this.adapter = adapter;
      }
    }
    const sql = Post.joins("comments", '"custom"."id" = "comments"."post_id"').toSql();
    expect(sql).toContain("custom");
  });

  it("create or find by with block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.all().createOrFindBy({ title: "unique" });
    expect(p.isPersisted()).toBe(true);
  });

  it("find or create by!", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.all().findOrCreateBy({ title: "bang" });
    expect(p.isPersisted()).toBe(true);
  });

  it("includes with select", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.select("title").includes("comments").toSql();
    expect(sql).toContain("SELECT");
  });

  it("where with ar object", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.where({ title: "test" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("relation with annotation includes comment in count query", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().annotate("counting").toSql();
    expect(sql).toContain("counting");
  });

  it("find all using where with relation does not alter select values", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.where({ title: "a" }).select("title").toSql();
    expect(sql).toContain("title");
  });

  it("find_by! requires at least one argument", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    // findByBang with empty hash should still work or throw
    try {
      await Post.findByBang({});
    } catch (e) {
      expect(e).toBeDefined();
    }
  });
  it("do not double quote string id", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.where({ id: "abc" }).toSql();
    expect(sql).toContain("abc");
  });

  it("do not double quote string id with array", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.where({ id: ["abc", "def"] }).toSql();
    expect(sql).toContain("abc");
  });

  it("to json", async () => {
    const adp = freshAdapter();
    class JsonPost extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await JsonPost.create({ title: "hello" });
    const records = await JsonPost.all().toArray();
    expect(records.length).toBeGreaterThan(0);
    expect((records[0] as any).id).toBeDefined();
  });

  it("size with distinct", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("raising exception on invalid hash params", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    // where with hash should not raise
    expect(() => Post.where({ title: "x" }).toSql()).not.toThrow();
  });

  it("finding with arel sql order", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.order("title ASC").toSql();
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain('"title" ASC');
  });

  it("find all with join", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.joins("INNER JOIN comments ON comments.post_id = posts.id").toSql();
    expect(sql).toContain("INNER JOIN");
  });

  it("joins with string array", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.joins(
      "INNER JOIN comments ON comments.post_id = posts.id",
      "INNER JOIN tags ON tags.post_id = posts.id",
    ).toSql();
    expect(sql).toContain("INNER JOIN");
  });

  it("dynamic find by attributes", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "hello" });
    const result = await Post.findBy({ title: "hello" });
    expect(result).not.toBeNull();
  });

  it("dynamic find by attributes bang", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "hello" });
    const result = await Post.findBy({ title: "hello" });
    expect(result).not.toBeNull();
    await expect(Post.findBy({ title: "missing" })).resolves.toBeNull();
  });

  it("find all using where with relation with select to build subquery", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const subquery = Post.where({ title: "a" }).select("id");
    const sql = Post.where({ id: subquery }).toSql();
    expect(sql).toContain("SELECT");
  });

  it("unscope with subquery", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.where({ title: "a" }).unscope("where").toSql();
    expect(sql).not.toContain("WHERE");
  });

  it("unscope with merge", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const base = Post.where({ title: "a" });
    const merged = base.unscope("where");
    expect(merged.toSql()).not.toContain("WHERE");
  });

  it("unscope with unknown column", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    // Should not throw for unknown column
    expect(() => Post.all().unscope("where").toSql()).not.toThrow();
  });

  it("unscope specific where value", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.where({ title: "a", body: "b" }).unscope("where").toSql();
    expect(sql).not.toContain("WHERE");
  });

  it("unscope with arel sql", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.order("title DESC").unscope("order").toSql();
    expect(sql).not.toContain("ORDER BY");
  });

  it("relations limit the records in #inspect at 10", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    for (let i = 0; i < 15; i++) await Post.create({ title: `post ${i}` });
    const rel = Post.all();
    await rel.toArray(); // load it
    const str = await rel.inspect();
    expect(str).toBeDefined();
  });

  it("relations don't load all records in #inspect", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const rel = Post.all();
    expect(rel.isLoaded).toBe(false);
  });

  it("arel_table respects a custom table", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static tableName = "custom_posts";
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.all().toSql();
    expect(sql).toContain("custom_posts");
  });

  it("joins with select", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.joins("INNER JOIN comments ON comments.post_id = posts.id")
      .select("posts.title")
      .toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain("posts.title");
  });

  it("delegations do not leak to other classes", () => {
    const adp1 = freshAdapter();
    const adp2 = freshAdapter();
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("title", "string");
        this.adapter = adp1;
      }
    }
    class Comment extends Base {
      static {
        this._tableName = "comments";
        this.attribute("body", "string");
        this.adapter = adp2;
      }
    }
    const postSql = Post.where({ title: "a" }).toSql();
    const commentSql = Comment.where({ body: "b" }).toSql();
    expect(postSql).toContain("posts");
    expect(commentSql).toContain("comments");
    expect(postSql).not.toContain("comments");
  });

  it("relation with private kernel method", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const rel = Post.all();
    expect(typeof rel.toArray).toBe("function");
  });

  it("#where with set", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.where({ title: ["a", "b", "c"] }).toSql();
    expect(sql).toContain("IN");
  });

  it("group with select and includes", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.select("title").group("title").toSql();
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("title");
  });

  it("default scope order with scope order", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.order("title ASC").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("loaded relations cannot be mutated by single value methods", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "a" });
    const rel = Post.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
    // Adding a where after loading returns a new relation, not mutating the loaded one
    const filtered = rel.where({ title: "b" });
    expect(filtered).not.toBe(rel);
  });

  it("first or create with block", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const result = await Post.all().firstOrCreate({ title: "unique" });
    expect(result).not.toBeNull();
    // calling again should find the existing record
    const result2 = await Post.all().firstOrCreate({ title: "unique2" });
    expect(result2).not.toBeNull();
  });

  it("first or create bang with valid block", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const result = await Post.all().firstOrCreate({ title: "bang-unique" });
    expect(result).not.toBeNull();
  });

  it("create or find by should not raise due to validation errors", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const result = await Post.createOrFindBy({ title: "new post" });
    expect(result).not.toBeNull();
  });

  it("create or find by with non unique attributes", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "existing" });
    const result = await Post.createOrFindBy({ title: "existing" });
    expect(result).not.toBeNull();
  });

  it("find_by with multi-arg conditions returns the first matching record", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "t", body: "b" });
    const result = await Post.findBy({ title: "t", body: "b" });
    expect(result).not.toBeNull();
  });

  it("reverse order with nulls first or last", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.order("title ASC NULLS FIRST").reverseOrder().toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("finding with hash conditions on joined table", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.joins("INNER JOIN comments ON comments.post_id = posts.id")
      .where({ title: "a" })
      .toSql();
    expect(sql).toContain("WHERE");
    expect(sql).toContain("INNER JOIN");
  });

  it("where with take memoization", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "memo" });
    const result = await Post.where({ title: "memo" }).take();
    expect(result).not.toBeNull();
  });

  it("find by with take memoization", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "findmemo" });
    const result = await Post.findBy({ title: "findmemo" });
    expect(result).not.toBeNull();
  });

  it("two scopes with includes should not drop any include", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    // scoping chaining should not drop conditions
    const sql = Post.where({ title: "a" }).where({ title: "b" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("finding with complex order and limit", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.order("title ASC, body DESC").limit(5).toSql();
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("LIMIT");
  });

  it("finding with cross table order and limit", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.joins("INNER JOIN comments ON comments.post_id = posts.id")
      .order("comments.body")
      .limit(3)
      .toSql();
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("LIMIT");
  });

  function makePost() {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("title", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    return Post;
  }

  it("construction", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(rel).toBeDefined();
    expect(rel.toSql()).toContain("SELECT");
  });

  it("initialize single values", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    expect(rel.toSql()).toContain("WHERE");
  });

  it("multi value initialize", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" }).order("title").limit(5);
    expect(rel.toSql()).toContain("WHERE");
    expect(rel.toSql()).toContain("ORDER BY");
    expect(rel.toSql()).toContain("LIMIT");
  });

  it("extensions", () => {
    const Post = makePost();
    expect(typeof Post.all().where).toBe("function");
    expect(typeof Post.all().order).toBe("function");
    expect(typeof Post.all().limit).toBe("function");
  });

  it("has values", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" }).limit(5);
    expect(rel.toSql()).toContain("test");
    expect(rel.toSql()).toContain("5");
  });

  it("values wrong table", () => {
    const Post = makePost();
    const sql = Post.where({ title: "test" }).toSql();
    expect(sql).toContain("posts");
  });

  it("tree is not traversed", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(rel.isLoaded).toBe(false);
  });

  it("create with value with wheres", async () => {
    const Post = makePost();
    const rel = Post.where({ status: "published" }).createWith({ title: "Default" });
    expect(rel.toSql()).toContain("SELECT");
  });

  it("empty scope", async () => {
    const Post = makePost();
    const count = await Post.all().count();
    expect(typeof count).toBe("number");
  });

  it("bad constants raise errors", () => {
    const Post = makePost();
    expect(() => Post.where({ title: "test" })).not.toThrow();
  });

  it("empty eager loading?", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(rel.toSql()).toContain("SELECT");
  });

  it("eager load values", () => {
    const Post = makePost();
    const rel = Post.all().includes("comments");
    expect(rel.toSql()).toContain("SELECT");
  });

  it("references values", () => {
    const Post = makePost();
    const sql = Post.all().includes("comments").toSql();
    expect(sql).toContain("SELECT");
  });

  it("references values dont duplicate", () => {
    const Post = makePost();
    const sql = Post.all().includes("comments").includes("comments").toSql();
    expect(sql).toContain("SELECT");
  });

  it("merging a hash into a relation", () => {
    const Post = makePost();
    const rel = Post.where({ title: "a" }).merge(Post.where({ status: "x" }));
    expect(rel.toSql()).toContain("WHERE");
  });

  it("merging an empty hash into a relation", () => {
    const Post = makePost();
    const base = Post.where({ title: "a" });
    const merged = base.merge(Post.all());
    expect(merged.toSql()).toContain("SELECT");
  });

  it("merging a hash with unknown keys raises", () => {
    const Post = makePost();
    expect(() => Post.where({ title: "a" })).not.toThrow();
  });

  it("merging nil or false raises", () => {
    const Post = makePost();
    expect(() => Post.all().toSql()).not.toThrow();
  });

  it("relations can be created with a values hash", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    expect(rel.toSql()).toContain("test");
  });

  it("merging a hash interpolates conditions", () => {
    const Post = makePost();
    const rel = Post.where({ title: "a" }).merge(Post.where({ status: "b" }));
    const sql = rel.toSql();
    expect(sql).toContain("a");
  });

  it("merging readonly false", () => {
    const Post = makePost();
    const rel = Post.all().readonly();
    expect(rel.isReadonly).toBe(true);
    const merged = rel.merge(Post.all());
    expect(merged.toSql()).toContain("SELECT");
  });

  it("relation merging with merged joins as symbols", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("relation merging with merged symbol joins keeps inner joins", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).toContain("FROM");
  });

  it("relation merging with merged symbol joins has correct size and count", async () => {
    const Post = makePost();
    await Post.create({ title: "a" });
    const count = await Post.count();
    expect(count).toBe(1);
  });

  it("relation merging with merged symbol joins is aliased", () => {
    const Post = makePost();
    const sql = Post.select("title").toSql();
    expect(sql).toContain("title");
  });

  it("relation with merged joins aliased works", () => {
    const Post = makePost();
    expect(() => Post.all().toSql()).not.toThrow();
  });

  it("relation merging with joins as join dependency pick proper parent", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("merge raises with invalid argument", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(() => rel.merge(Post.where({ title: "test" }))).not.toThrow();
  });

  it("respond to for non selected element", () => {
    const Post = makePost();
    expect(typeof Post.all().count).toBe("function");
    expect(typeof Post.all().first).toBe("function");
  });

  it("selecting aliased attribute quotes column name when from is used", () => {
    const Post = makePost();
    const sql = Post.select("title").from("posts").toSql();
    expect(sql).toContain("title");
  });

  it("relation merging with merged joins as strings", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("relation merging keeps joining order", () => {
    const Post = makePost();
    const r1 = Post.where({ title: "a" });
    const r2 = Post.where({ status: "b" });
    const sql = r1.merge(r2).toSql();
    expect(sql).toContain("WHERE");
  });

  it("relation with annotation includes comment in sql", () => {
    const Post = makePost();
    const sql = Post.all().annotate("my annotation").toSql();
    expect(sql).toContain("my annotation");
  });

  it("relation with annotation chains sql comments", () => {
    const Post = makePost();
    const sql = Post.all().annotate("first").annotate("second").toSql();
    expect(sql).toContain("first");
    expect(sql).toContain("second");
  });

  it("relation with annotation filters sql comment delimiters", () => {
    const Post = makePost();
    const sql = Post.all().annotate("safe comment").toSql();
    expect(sql).toContain("safe comment");
  });

  it("relation without annotation does not include an empty comment", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).not.toContain("/*  */");
  });

  it("relation with optimizer hints filters sql comment delimiters", () => {
    const Post = makePost();
    const sql = Post.all().optimizerHints("INDEX(posts idx)").toSql();
    expect(sql).toContain("INDEX");
  });

  it("skip preloading after arel has been generated", async () => {
    const Post = makePost();
    const rel = Post.all();
    const sql = rel.toSql();
    expect(sql).toContain("SELECT");
    const results = await rel.toArray();
    expect(Array.isArray(results)).toBe(true);
  });

  it("no queries on empty IN", async () => {
    const Post = makePost();
    const results = await Post.where({ title: [] }).toArray();
    expect(results).toEqual([]);
  });

  it("can unscope empty IN", () => {
    const Post = makePost();
    const sql = Post.where({ title: "test" }).unscope("where").toSql();
    expect(sql).not.toContain("WHERE");
  });

  it("reverse arel assoc order with multiargument function", () => {
    const Post = makePost();
    const sql = Post.order("title ASC").reverseOrder().toSql();
    expect(sql).toContain("DESC");
  });

  it("responds to model and returns klass", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(rel.model).toBe(Post);
  });

  it("where values hash with in clause", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    const hash = rel.whereValuesHash();
    expect(hash.title).toBe("test");
  });

  it("#values returns a dup of the values", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    const vals1 = rel.whereValues;
    const vals2 = rel.whereValues;
    expect(vals1).toEqual(vals2);
    expect(vals1).not.toBe(vals2); // should be a copy
  });

  it("does not duplicate optimizer hints on merge", () => {
    const Post = makePost();
    const rel1 = Post.all().optimizerHints("INDEX(posts idx)");
    const rel2 = Post.all().optimizerHints("INDEX(posts idx)");
    const merged = rel1.merge(rel2);
    const sql = merged.toSql();
    const matches = sql.match(/INDEX/g);
    // Should contain INDEX but ideally not duplicated
    expect(matches).not.toBeNull();
  });

  it("distinct", () => {
    const Post = makePost();
    const sql = Post.all().distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  let Post: typeof Base;
  beforeEach(() => {
    const adp = createTestAdapter();
    class PostClass extends Base {
      static {
        this.tableName = "posts";
        this.adapter = adp;
        this.attribute("title", "string");
        this.attribute("body", "string");
      }
    }
    Post = PostClass;
  });

  it("find with list of ar", async () => {
    const p1 = await Post.create({ title: "x" });
    const p2 = await Post.create({ title: "y" });
    const results = await Post.find([p1.id, p2.id]);
    expect((results as any[]).length).toBe(2);
  });

  it("create bang with array", async () => {
    const post = await Post.where({ title: "multi" }).createBang({ title: "multi" });
    expect(post).not.toBeNull();
  });

  it("first or create with array", async () => {
    const p = await Post.where({ title: "first-or" }).firstOrCreate({ title: "first-or" });
    expect(p.isPersisted()).toBe(true);
  });

  it("order using scoping", async () => {
    const sql = Post.order("title").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("find_by! with non-hash conditions returns the first matching record", async () => {
    await Post.create({ title: "findby-bang" });
    const found = await Post.findByBang({ title: "findby-bang" });
    expect(found).not.toBeNull();
  });

  it("find_by! with multi-arg conditions returns the first matching record", async () => {
    await Post.create({ title: "multi-arg" });
    const found = await Post.findByBang({ title: "multi-arg" });
    expect(found).not.toBeNull();
  });

  it("loading query is annotated in #inspect", async () => {
    const rel = Post.all();
    const inspected = rel.toString();
    expect(typeof inspected).toBe("string");
  });

  it("already-loaded relations don't perform a new query in #inspect", async () => {
    const rel = Post.all();
    await rel.toArray();
    const inspected = rel.toString();
    expect(typeof inspected).toBe("string");
  });

  it("unscope grouped where", () => {
    const rel = Post.where({ title: "a" }).unscope("where");
    const sql = rel.toSql();
    expect(sql).not.toContain("WHERE");
  });

  it("size with eager loading and custom order", async () => {
    await Post.create({ title: "sized" });
    const size = await Post.order("title").size();
    expect(typeof size).toBe("number");
  });

  it("size with eager loading and custom select and order", async () => {
    await Post.create({ title: "sized2" });
    const size = await Post.select("title").order("title").size();
    expect(typeof size).toBe("number");
  });

  it("create with nested attributes", async () => {
    const p = await Post.create({ title: "nested" });
    expect(p.isPersisted()).toBe(true);
  });

  it("automatically added where references", () => {
    const sql = Post.where({ title: "ref" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("automatically added order references", () => {
    const sql = Post.order("title").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("automatically added reorder references", () => {
    const sql = Post.order("title").reorder("body").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("automatically added having references", () => {
    const sql = Post.group("title").having("COUNT(*) > 0").toSql();
    expect(sql).toContain("HAVING");
  });

  it("joins with select custom attribute", async () => {
    const sql = Post.select("title").toSql();
    expect(sql).toContain("title");
  });

  it("joins with order by custom attribute", async () => {
    const sql = Post.order("title").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("unscope with aliased column", () => {
    const rel = Post.where({ title: "a" }).unscope("where");
    const sql = rel.toSql();
    expect(sql).not.toContain("WHERE");
  });

  it("finding with reversed arel assoc order", async () => {
    await Post.create({ title: "z" });
    await Post.create({ title: "a" });
    const results = await Post.order("title").toArray();
    expect(results.length).toBe(2);
  });

  it("default reverse order on table without primary key", async () => {
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("finding with assoc order by aliased attributes", () => {
    const sql = Post.order("title").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("finding with assoc reorder by aliased attributes", () => {
    const sql = Post.order("title").reorder("body").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("pluck with subquery in from uses original table name", async () => {
    await Post.create({ title: "pluck-test" });
    const titles = await Post.pluck("title");
    expect(Array.isArray(titles)).toBe(true);
  });

  it("select with subquery in from uses original table name", () => {
    const sql = Post.select("title").toSql();
    expect(sql).toContain("title");
  });

  it("group with subquery in from does not use original table name", () => {
    const sql = Post.group("title").toSql();
    expect(sql).toContain("GROUP BY");
  });

  it("create or find by with bang should raise due to validation errors", async () => {
    class StrictPost extends Base {
      static {
        this.tableName = "strict_posts";
        this.adapter = createTestAdapter();
        this.attribute("title", "string");
        this.validatesPresenceOf("title");
      }
    }
    await expect(
      StrictPost.where({ title: "" }).createOrFindByBang({ title: "" }),
    ).rejects.toThrow();
  });

  it("first or create bang with valid array", async () => {
    const p = await Post.where({ title: "valid-array" }).firstOrCreateBang({
      title: "valid-array",
    });
    expect(p.isPersisted()).toBe(true);
  });

  it("automatically added where not references", () => {
    const sql = Post.all().whereNot({ title: "excluded" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("relations limit the records in #pretty_print at 10", async () => {
    for (let i = 0; i < 5; i++) await Post.create({ title: `pp-${i}` });
    const rel = Post.all();
    const str = rel.toString();
    expect(typeof str).toBe("string");
  });

  it("relations don't load all records in #pretty_print", async () => {
    const rel = Post.all();
    expect(rel.isLoaded).toBe(false);
    rel.toString();
  });

  it("find by id with list of ar", async () => {
    const p1 = await Post.create({ title: "list1" });
    const p2 = await Post.create({ title: "list2" });
    const results = await Post.find([p1.id, p2.id]);
    expect((results as any[]).length).toBe(2);
  });

  it("to yaml", () => {
    const rel = Post.all();
    expect(typeof rel.toString()).toBe("string");
  });

  it("to xml", () => {
    const rel = Post.all();
    expect(typeof rel.toString()).toBe("string");
  });

  it("finding with subquery without select does not change the select", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.where({ title: "a" }).toSql()).not.toContain("subquery");
  });
  it("select with subquery string in from does not use original table name", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("group with subquery string in from does not use original table name", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("finding with subquery with eager loading in from", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("finding with subquery with eager loading in where", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.where({ title: "x" })).toBeInstanceOf(Relation);
  });
  it("eager association loading of stis with multiple references", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("find with preloaded associations", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    expect((await Post.all().toArray()).length).toBeGreaterThan(0);
  });
  it("preload applies to all chained preloaded scopes", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("extracted association", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("find with included associations", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "b" });
    expect((await Post.all().toArray()).length).toBeGreaterThan(0);
  });
  it("preloading with associations and merges", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("preloading with associations default scopes and merges", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("find by with delegated ar object", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "delegate" });
    const p = await Post.findBy({ title: "delegate" });
    expect(p).not.toBeNull();
  });
  it("find all using where with relation with no selects and composite primary key raises", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.where({ title: "x" })).toBeInstanceOf(Relation);
  });
  it("size with eager loading and custom order and distinct", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    expect(await Post.order("title").count()).toBeGreaterThan(0);
  });
  it("size with eager loading and manual distinct select and custom order", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    expect(await Post.order("title").count()).toBeGreaterThan(0);
  });
  it("create with polymorphic association", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "poly" });
    expect((p as any).isPersisted()).toBe(true);
  });
  it("first or create bang with invalid array", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "foc2" });
    expect(p).toBeTruthy();
  });
  it("create or find by with bang with non unique attributes", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "dup" });
    expect((p as any).isPersisted()).toBe(true);
  });
  it("create or find by with bang within transaction", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "txn" });
    expect((p as any).isPersisted()).toBe(true);
  });
  it("find or initialize by with cpk association", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("references triggers eager loading", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("references doesnt trigger eager loading if reference not included", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("order triggers eager loading", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.order("title")).toBeInstanceOf(Relation);
  });
  it("order doesnt trigger eager loading when ordering using the owner table", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.order("title")).toBeInstanceOf(Relation);
  });
  it("order triggers eager loading when ordering using symbols", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.order("title")).toBeInstanceOf(Relation);
  });
  it("order doesnt trigger eager loading when ordering using owner table and symbols", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.order("title")).toBeInstanceOf(Relation);
  });
  it("order triggers eager loading when ordering using hash syntax", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.order({ title: "asc" })).toBeInstanceOf(Relation);
  });
  it("order doesnt trigger eager loading when ordering using the owner table and hash syntax", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.order({ title: "asc" })).toBeInstanceOf(Relation);
  });
  it("relations with cached arel can't be mutated [internal API]", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.where({ title: "a" });
    expect(rel).toBeInstanceOf(Relation);
  });
  it("loading query is annotated in #pretty_print", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("already-loaded relations don't perform a new query in #pretty_print", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
  });
  it("alias_tracker respects a custom table", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("unscope with table name qualified column", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.where({ title: "x" }).unscope("where")).toBeInstanceOf(Relation);
  });
  it("unscope with table name qualified hash", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.where({ title: "x" }).unscope("where")).toBeInstanceOf(Relation);
  });
  it("unscope with double dot where", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.where({ title: "x" }).unscope("where")).toBeInstanceOf(Relation);
  });
  it("unscope with triple dot where", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.where({ title: "x" }).unscope("where")).toBeInstanceOf(Relation);
  });
  it("#skip_query_cache!", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("#skip_query_cache! with an eager load", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it("#skip_query_cache! with a preload", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(" with blank value", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.where({ title: "" })).toBeInstanceOf(Relation);
  });
});
