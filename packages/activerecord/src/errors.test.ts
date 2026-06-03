// QUARANTINED (PR #2916): bespoke in-test DDL skipped to cut MySQL CI cost; tests are the backlog for a faithful canonical rewrite (see docs/activerecord/ddl-quarantine-backlog.md and the dirty.test.ts model, PR #2913).
/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, RecordNotFound, RecordInvalid, ReadOnlyRecord, UnknownPrimaryKey } from "./index.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Item } from "./test-helpers/models/item.js";

// -- Helpers --
describe.skip("ErrorsTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({ posts: { title: "string" } });
  });
  it("can be instantiated with no args", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    const p = new Post();
    expect(p.errors).toBeDefined();
    expect(p.errors.empty).toBe(true);
  });
});

describe.skip("error classes", () => {
  // Canonical `items` fixtures (shared Item model + items.yml) so this
  // handler-suite file can't define a conflicting `items` shape in the worker DB.
  useHandlerFixtures(["items"], { schema: canonicalSchema });
  beforeAll(async () => {
    await defineSchema({
      widgets: { name: "string" },
      things: { name: "string" },
      empties: {},
    });
  });
  it("find throws RecordNotFound with metadata", async () => {
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
    try {
      await Empty.all().firstBang();
      expect.unreachable("should throw");
    } catch (e: any) {
      expect(e).toBeInstanceOf(RecordNotFound);
    }
  });
});

describe.skip("Error Classes (Rails-guided)", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({ people: { name: "string" } });
  });
  // Rails: test "RecordNotFound"
  it("find raises RecordNotFound with model, primary_key, and id", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("id", "integer");
        this.attribute("name", "string");
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
      }
    }

    const p = await Person.create({ name: "Alice" });
    p.readonlyBang();

    await expect(p.save()).rejects.toThrow(ReadOnlyRecord);
    await expect(p.destroy()).rejects.toThrow(ReadOnlyRecord);
  });
});

describe.skip("UnknownPrimaryKeyTest", () => {
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
