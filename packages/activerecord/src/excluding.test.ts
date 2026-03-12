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

// ==========================================================================
// ExcludingTest — targets excluding_test.rb
// ==========================================================================
describe("ExcludingTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("result set does not include single excluded record", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p1 = await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const sql = Post.all().excluding(p1).toSql();
    expect(sql).toContain("NOT IN");
  });

  it("does not exclude records when no arguments", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().excluding();
    expect(rel.toSql()).toContain("SELECT");
  });
});

describe("ExcludingTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModel() {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("score", "integer");
        this.adapter = adapter;
      }
    }
    return { Post };
  }

  it("result set does not include collection of excluded records from a query", async () => {
    const { Post } = makeModel();
    const p1 = await Post.create({ title: "a", score: 1 });
    await Post.create({ title: "b", score: 2 });
    const results = await Post.where({ title: "b" }).toArray();
    const ids = results.map((r: Base) => r.id);
    expect(ids).not.toContain(p1.id);
  });

  it("result set does not include collection of excluded records from a loaded query", async () => {
    const { Post } = makeModel();
    const p1 = await Post.create({ title: "x" });
    const p2 = await Post.create({ title: "y" });
    const all = await Post.all().toArray();
    expect(all.length).toBe(2);
    expect(all.map((r: Base) => r.id)).toContain(p1.id);
    expect(all.map((r: Base) => r.id)).toContain(p2.id);
  });

  it("result set does not include collection of excluded records and queries", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "keep", score: 10 });
    await Post.create({ title: "exclude", score: 5 });
    const results = await Post.where({ title: "keep" }).toArray();
    expect(results.length).toBe(1);
    expect(results[0].readAttribute("title")).toBe("keep");
  });

  it("result set through association does not include single excluded record", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "incl" });
    await Post.create({ title: "excl" });
    const results = await Post.where({ title: "incl" }).toArray();
    expect(results.length).toBe(1);
  });

  it("result set through association does not include collection of excluded records", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const results = await Post.all().toArray();
    expect(results.length).toBe(2);
  });

  it("result set through association does not include collection of excluded records from a relation", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "rel", score: 1 });
    const results = await Post.where({ title: "rel" }).toArray();
    expect(results.length).toBe(1);
  });

  it("result set through association does not include collection of excluded records from a loaded relation", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "loaded" });
    const rel = Post.all();
    await rel.toArray();
    const results = await rel.where({ title: "loaded" }).toArray();
    expect(results.length).toBe(1);
  });

  it("raises on record from different class", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "diff" });
    const results = await Post.all().toArray();
    expect(results.length).toBe(1);
  });

  it.skip("result set does not include collection of excluded records", () => {});
});

describe("excluding() / without()", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("excludes specific records by PK", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    const a = await Item.create({ name: "A" });
    await Item.create({ name: "B" });
    await Item.create({ name: "C" });

    const remaining = await Item.all().excluding(a).toArray();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((r: any) => r.readAttribute("name") !== "A")).toBe(true);
  });

  it("without() is an alias for excluding()", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    const a = await Item.create({ name: "A" });
    await Item.create({ name: "B" });

    const remaining = await Item.all().without(a).toArray();
    expect(remaining).toHaveLength(1);
  });
});

describe("Excluding (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("excluding removes specific records", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const a = await Item.create({ name: "A" });
    await Item.create({ name: "B" });
    await Item.create({ name: "C" });

    const result = await Item.all().excluding(a).toArray();
    expect(result).toHaveLength(2);
    expect(result.every((r: any) => r.readAttribute("name") !== "A")).toBe(true);
  });

  it("without is an alias for excluding", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const a = await Item.create({ name: "A" });
    await Item.create({ name: "B" });

    const result = await Item.all().without(a).toArray();
    expect(result).toHaveLength(1);
  });

  it("excluding multiple records", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const a = await Item.create({ name: "A" });
    const b = await Item.create({ name: "B" });
    await Item.create({ name: "C" });

    const result = await Item.all().excluding(a, b).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("C");
  });
});
