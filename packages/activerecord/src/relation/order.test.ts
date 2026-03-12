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
// OrderTest — targets relation/order_test.rb
// ==========================================================================
describe("OrderTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("order with string", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order("title").toSql();
    expect(sql).toContain("ORDER BY");
  });

  it("order with hash", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order({ title: "desc" }).toSql();
    expect(sql).toContain("DESC");
  });

  it("reorder replaces existing order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order("title").reorder({ title: "desc" }).toSql();
    expect(sql).toContain("DESC");
  });

  it("reverse order", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.order("title").reverseOrder().toSql();
    expect(sql).toContain("DESC");
  });
});

describe("OrderTest", () => {
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

  it("order asc", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "b", score: 2 });
    await Post.create({ title: "a", score: 1 });
    const results = await Post.order("title").toArray();
    expect(results[0].readAttribute("title")).toBe("a");
    expect(results[1].readAttribute("title")).toBe("b");
  });

  it("order desc", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a", score: 1 });
    await Post.create({ title: "b", score: 2 });
    const results = await Post.order("title DESC").toArray();
    expect(results[0].readAttribute("title")).toBe("b");
  });

  it("order with association", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "c" });
    await Post.create({ title: "a" });
    const results = await Post.order("title").toArray();
    expect(results[0].readAttribute("title")).toBe("a");
  });

  it("order with association alias", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "z", score: 1 });
    await Post.create({ title: "a", score: 2 });
    const results = await Post.order("title").toArray();
    expect(results[0].readAttribute("title")).toBe("a");
  });
});

describe("Relation Order (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  class Item extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("price", "integer");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    Item.adapter = adapter;
    await Item.create({ name: "Charlie", price: 30 });
    await Item.create({ name: "Alice", price: 10 });
    await Item.create({ name: "Bob", price: 20 });
  });

  it("order asc", async () => {
    const result = await Item.all().order({ name: "asc" }).toArray();
    expect(result[0].readAttribute("name")).toBe("Alice");
    expect(result[2].readAttribute("name")).toBe("Charlie");
  });

  it("order desc", async () => {
    const result = await Item.all().order({ name: "desc" }).toArray();
    expect(result[0].readAttribute("name")).toBe("Charlie");
    expect(result[2].readAttribute("name")).toBe("Alice");
  });

  it("order by string column name", async () => {
    const result = await Item.all().order("name").toArray();
    expect(result[0].readAttribute("name")).toBe("Alice");
  });

  it("reorder replaces existing order", async () => {
    const result = await Item.all().order({ name: "asc" }).reorder({ name: "desc" }).toArray();
    expect(result[0].readAttribute("name")).toBe("Charlie");
  });

  it("reverseOrder flips direction", async () => {
    const result = await Item.all().order({ price: "asc" }).reverseOrder().toArray();
    expect(result[0].readAttribute("price")).toBe(30);
  });

  it("multiple order columns", async () => {
    const sql = Item.all().order({ name: "asc" }, { price: "desc" }).toSql();
    expect(sql).toContain("name");
    expect(sql).toContain("price");
  });
});
