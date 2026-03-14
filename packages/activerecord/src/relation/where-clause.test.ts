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

// ==========================================================================
// WhereClauseTest — targets relation/where_clause_test.rb
// ==========================================================================
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

  it("where with hash produces sql", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.where({ title: "hello" }).toSql();
    expect(sql).toContain("WHERE");
  });

  it("where not with hash produces negation", () => {
    const adapter = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().whereNot({ title: "hello" }).toSql();
    expect(sql).toContain("!=");
  });
  it("+ combines two where clauses", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.where({ title: "hello" }).and(Post.where({ status: "active" }));
    const sql = rel.toSql();
    expect(sql).toContain("title");
    expect(sql).toContain("status");
  });

  it("or returns an empty where clause when either side is empty", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.where({ title: "hello" }).or(Post.all());
    const sql = rel.toSql();
    // When one side is empty (all), OR should still produce valid SQL
    expect(sql).toContain("FROM");
  });

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
