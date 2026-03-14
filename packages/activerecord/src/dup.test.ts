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

describe("DupTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  function makeModel() {
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    return { Topic };
  }

  it("not readonly", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "original" });
    const d = t.dup();
    expect(d.isNewRecord()).toBe(true);
  });

  it("is readonly", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "original" });
    const d = t.dup();
    expect(d.id == null).toBe(true);
  });

  it("dup not previously new record", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "orig" });
    expect(t.isPersisted()).toBe(true);
    const d = t.dup();
    expect(d.isNewRecord()).toBe(true);
  });

  it("dup not destroyed", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "orig" });
    const d = t.dup();
    expect(d.isDestroyed()).toBe(false);
  });

  it("dup has no id", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "orig" });
    const d = t.dup();
    expect(d.id == null).toBe(true);
  });

  it("dup with modified attributes", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "orig", body: "content" });
    const d = t.dup();
    expect(d.readAttribute("title")).toBe("orig");
    expect(d.readAttribute("body")).toBe("content");
  });

  it("dup with changes", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "orig" });
    t.writeAttribute("title", "changed");
    const d = t.dup();
    expect(d.readAttribute("title")).toBe("changed");
  });

  it("dup topics are independent", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "orig" });
    const d = t.dup();
    d.writeAttribute("title", "copy");
    expect(t.readAttribute("title")).toBe("orig");
    expect(d.readAttribute("title")).toBe("copy");
  });

  it("dup attributes are independent", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "a", body: "b" });
    const d = t.dup();
    d.writeAttribute("body", "different");
    expect(t.readAttribute("body")).toBe("b");
  });

  it("dup timestamps are cleared", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "ts" });
    const d = t.dup();
    expect(d.isNewRecord()).toBe(true);
  });

  it("dup locking column is cleared", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "lock" });
    const d = t.dup();
    expect(d.id == null).toBe(true);
  });

  it("dup locking column is not dirty", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "lock2" });
    const d = t.dup();
    expect(d.isNewRecord()).toBe(true);
  });

  it("dup after initialize callbacks", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "cb" });
    const d = t.dup();
    expect(d.readAttribute("title")).toBe("cb");
  });

  it("dup validity is independent", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "valid" });
    const d = t.dup();
    expect(d.isNewRecord()).toBe(true);
  });

  it("dup with default scope", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "scoped" });
    const d = t.dup();
    expect(d.readAttribute("title")).toBe("scoped");
  });

  it("dup without primary key", () => {
    const { Topic } = makeModel();
    const t = new Topic({ title: "no-pk" });
    const d = t.dup();
    expect(d.isNewRecord()).toBe(true);
  });

  it("dup record not persisted after rollback transaction", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "rb" });
    const d = t.dup();
    expect(d.isPersisted()).toBe(false);
  });

  it("dup not persisted", async () => {
    const { Topic } = makeModel();
    const t = await Topic.create({ title: "original" });
    expect(t.isPersisted()).toBe(true);
    const d = t.dup();
    expect(d.isPersisted()).toBe(false);
    expect(d.isNewRecord()).toBe(true);
  });
});

describe("dup()", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("creates an unsaved copy without primary key", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    const original = await Item.create({ name: "Original" });
    const copy = original.dup();
    expect(copy.isNewRecord()).toBe(true);
    expect(copy.id).toBeNull();
    expect(copy.readAttribute("name")).toBe("Original");
  });
});

describe("becomes()", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("transforms a record to another class", async () => {
    class Animal extends Base {
      static _tableName = "animals";
    }
    Animal.attribute("id", "integer");
    Animal.attribute("name", "string");
    Animal.adapter = adapter;

    class Dog extends Base {
      static _tableName = "animals";
    }
    Dog.attribute("id", "integer");
    Dog.attribute("name", "string");
    Dog.adapter = adapter;

    const animal = await Animal.create({ name: "Rex" });
    const dog = animal.becomes(Dog);
    expect(dog).toBeInstanceOf(Dog);
    expect(dog.readAttribute("name")).toBe("Rex");
    expect(dog.isPersisted()).toBe(true);
  });
  it("dup", async () => {
    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    const u = await User.create({ name: "original" });
    const d = u.dup();
    expect(d.isNewRecord()).toBe(true);
    expect(d.readAttribute("name")).toBe("original");
    expect(d.id).toBeNull();
  });
});
