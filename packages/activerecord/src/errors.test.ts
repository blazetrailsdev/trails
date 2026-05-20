/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, RecordNotFound, RecordInvalid, ReadOnlyRecord, UnknownPrimaryKey } from "./index.js";

import { createTestAdapter, type TestDatabaseAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { withTransactionalFixtures } from "./test-helpers/with-transactional-fixtures.js";

// -- Helpers --
function freshAdapter(): TestDatabaseAdapter {
  return createTestAdapter();
}

describe("ErrorsTest", () => {
  let adapter: TestDatabaseAdapter;
  beforeAll(async () => {
    adapter = freshAdapter();
    await defineSchema(adapter, { posts: { title: "string" } });
  });
  withTransactionalFixtures(() => adapter);
  it("can be instantiated with no args", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = new Post();
    expect(p.errors).toBeDefined();
    expect(p.errors.empty).toBe(true);
  });
});

describe("error classes", () => {
  let adapter: TestDatabaseAdapter;
  beforeAll(async () => {
    adapter = freshAdapter();
    await defineSchema(adapter, {
      items: {},
      widgets: { name: "string" },
      things: { name: "string" },
      empties: {},
    });
  });
  withTransactionalFixtures(() => adapter);

  it("find throws RecordNotFound with metadata", async () => {
    class Item extends Base {
      static _tableName = "items";
    }
    Item.attribute("id", "integer");
    Item.adapter = adapter;

    try {
      await Item.find(999);
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordNotFound);
      expect(e.model).toBe("Item");
      expect(e.primaryKey).toBe("id");
      expect(e.id).toBe(999);
    }
  });

  it("saveBang throws RecordInvalid with record reference", async () => {
    class Widget extends Base {
      static _tableName = "widgets";
    }
    Widget.attribute("id", "integer");
    Widget.attribute("name", "string");
    Widget.validates("name", { presence: true });
    Widget.adapter = adapter;

    const w = new Widget({});
    try {
      await w.saveBang();
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordInvalid);
      expect(e.record).toBe(w);
      expect(e.message).toMatch(/Validation failed/);
    }
  });

  it("readonly record throws ReadOnlyRecord", async () => {
    class Thing extends Base {
      static _tableName = "things";
    }
    Thing.attribute("id", "integer");
    Thing.attribute("name", "string");
    Thing.adapter = adapter;

    const t = await Thing.create({ name: "test" });
    t.readonlyBang();
    try {
      await t.save();
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(ReadOnlyRecord);
    }
  });

  it("firstBang throws RecordNotFound", async () => {
    class Empty extends Base {
      static _tableName = "empties";
    }
    Empty.attribute("id", "integer");
    Empty.adapter = adapter;

    try {
      await Empty.all().firstBang();
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordNotFound);
    }
  });
});

describe("Error Classes (Rails-guided)", () => {
  let adapter: TestDatabaseAdapter;

  beforeAll(async () => {
    adapter = freshAdapter();
    await defineSchema(adapter, { people: { name: "string" } });
  });
  withTransactionalFixtures(() => adapter);

  // Rails: test "RecordNotFound"
  it("find raises RecordNotFound with model, primary_key, and id", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    try {
      await Person.find(42);
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordNotFound);
      expect(e.model).toBe("Person");
      expect(e.primaryKey).toBe("id");
      expect(e.id).toBe(42);
      expect(e.message).toContain("42");
    }
  });

  // Rails: test "RecordNotFound with multiple IDs"
  it("find with multiple IDs raises RecordNotFound listing missing IDs", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    await Person.create({ id: 1 });

    try {
      await Person.find([1, 2, 3]);
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordNotFound);
      expect(e.message).toContain("2");
      expect(e.message).toContain("3");
    }
  });

  // Rails: test "RecordInvalid"
  it("save! raises RecordInvalid with error messages", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
      static {
        this.validates("name", { presence: true });
      }
    }

    const p = new Person({});
    try {
      await p.saveBang();
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordInvalid);
      expect(e.record).toBe(p);
      expect(e.message).toContain("Validation failed");
    }
  });

  // Rails: test "create! raises RecordInvalid"
  it("create! raises RecordInvalid on validation failure", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
      static {
        this.validates("name", { presence: true });
      }
    }

    await expect(Person.createBang({})).rejects.toThrow(RecordInvalid);
  });

  // Rails: test "find_by! raises RecordNotFound"
  it("findByBang raises RecordNotFound when no record matches", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await expect(Person.findByBang({ name: "Nobody" })).rejects.toThrow(RecordNotFound);
  });

  // Rails: test "ReadOnlyRecord"
  it("save on readonly record raises ReadOnlyRecord", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const p = await Person.create({ name: "Alice" });
    p.readonlyBang();

    await expect(p.save()).rejects.toThrow(ReadOnlyRecord);
    await expect(p.destroy()).rejects.toThrow(ReadOnlyRecord);
  });
});

describe("UnknownPrimaryKeyTest", () => {
  it("no-arg constructor produces generic message", () => {
    const err = new UnknownPrimaryKey();
    expect(err.message).toBe("Unknown primary key.");
    expect(err.model).toBeNull();
  });

  it("description is separated by newline+space", () => {
    class Dummy extends Base {
      static _tableName = "dummies";
    }
    const err = new UnknownPrimaryKey(Dummy, "No PK configured.");
    expect(err.message).toBe(
      "Unknown primary key for table dummies in model Dummy.\nNo PK configured.",
    );
    expect(err.model).toBe(Dummy);
  });
});
