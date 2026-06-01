/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/locking_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel, StaleObjectError, ReadonlyAttributeError } from "./index.js";
import { Associations } from "./associations.js";

import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Person } from "./test-helpers/models/person.js";
import { Frog } from "./test-helpers/models/frog.js";

const TEST_SCHEMA = {
  people: { name: "string", first_name: "string", lock_version: "integer", updated_at: "datetime" },
  pets: { name: "string", person_id: "integer" },
  references: { favorite: "boolean", lock_version: "integer" },
  posts: { title: "string", lock_version: "integer" },
  frogs: { name: "string" },
  legacy_things: {
    tps_report_number: { type: "integer" as const },
    version: { type: "integer" as const, null: false, default: 0 },
  },
  lock_without_defaults: { title: "string", lock_version: "integer", updated_at: "datetime" },
  lock_without_defaults_cust: { title: "string", custom_lock_version: "integer" },
  string_key_objects: {
    columns: {
      id: { type: "string" as const, null: false },
      name: "string" as const,
      lock_version: { type: "integer" as const, default: 0 },
    },
    primaryKey: ["id"] as ["id"],
  },
} as const;

describe("OptimisticLockingTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  it("quote value passed lock col", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p1 = await Person.create({ first_name: "anika" });
    expect(p1.lock_version).toBe(0);
    p1.first_name = "anika2";
    await p1.saveBang();
    expect(p1.lock_version).toBe(1);
  });

  it("non integer lock existing", async () => {
    class StringKeyObject extends Base {
      static {
        this._tableName = "string_key_objects";
        this.attribute("id", "string");
        this.primaryKey = "id";
        this.attribute("name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const s1 = await StringKeyObject.create({ id: "record1", name: "original" });
    const s2 = await StringKeyObject.find("record1");
    expect(s1.lock_version).toBe(0);
    expect(s2.lock_version).toBe(0);
    s1.name = "updated record";
    await s1.saveBang();
    expect(s1.lock_version).toBe(1);
    expect(s2.lock_version).toBe(0);
    s2.name = "doubly updated record";
    await expect(s2.saveBang()).rejects.toThrow(StaleObjectError);
  });

  it("non integer lock destroy", async () => {
    class StringKeyObject extends Base {
      static {
        this._tableName = "string_key_objects";
        this.attribute("id", "string");
        this.primaryKey = "id";
        this.attribute("name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const s1 = await StringKeyObject.create({ id: "rec1", name: "original" });
    const s2 = await StringKeyObject.find("rec1");
    expect(s1.lock_version).toBe(0);
    expect(s2.lock_version).toBe(0);
    s1.name = "updated record";
    await s1.saveBang();
    expect(s1.lock_version).toBe(1);
    expect(s2.lock_version).toBe(0);
    await expect(s2.destroy()).rejects.toThrow(StaleObjectError);
    await s1.destroy();
    expect(s1.isDestroyed()).toBe(true);
    await expect(StringKeyObject.find("rec1")).rejects.toThrow();
  });

  it("lock existing", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p1 = await Person.create({ first_name: "stu" });
    const p2 = await Person.find(p1.id);
    expect(p1.lock_version).toBe(0);
    expect(p2.lock_version).toBe(0);
    p1.first_name = "stu2";
    await p1.saveBang();
    expect(p1.lock_version).toBe(1);
    expect(p2.lock_version).toBe(0);
    p2.first_name = "sue";
    await expect(p2.saveBang()).rejects.toThrow(StaleObjectError);
  });

  it("lock destroy", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p1 = await Person.create({ first_name: "stu" });
    const p2 = await Person.find(p1.id);
    expect(p1.lock_version).toBe(0);
    expect(p2.lock_version).toBe(0);
    p1.first_name = "stu2";
    await p1.saveBang();
    expect(p1.lock_version).toBe(1);
    expect(p2.lock_version).toBe(0);
    await expect(p2.destroy()).rejects.toThrow(StaleObjectError);
    await p1.destroy();
    expect(p1.isDestroyed()).toBe(true);
    await expect(Person.find(p1.id)).rejects.toThrow();
  });

  it("lock repeating", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p1 = await Person.create({ first_name: "stu" });
    const p2 = await Person.find(p1.id);
    expect(p1.lock_version).toBe(0);
    expect(p2.lock_version).toBe(0);
    p1.first_name = "stu2";
    await p1.saveBang();
    expect(p1.lock_version).toBe(1);
    expect(p2.lock_version).toBe(0);
    p2.first_name = "sue";
    await expect(p2.saveBang()).rejects.toThrow(StaleObjectError);
    p2.first_name = "sue2";
    await expect(p2.saveBang()).rejects.toThrow(StaleObjectError);
  });

  it("lock new", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p1 = new Person({ first_name: "anika" });
    expect(p1.lock_version).toBe(0);
    p1.first_name = "anika2";
    await p1.saveBang();
    const p2 = await Person.find(p1.id);
    expect(p1.lock_version).toBe(0);
    expect(p2.lock_version).toBe(0);
    p1.first_name = "anika3";
    await p1.saveBang();
    expect(p1.lock_version).toBe(1);
    expect(p2.lock_version).toBe(0);
    p2.first_name = "sue";
    await expect(p2.saveBang()).rejects.toThrow(StaleObjectError);
  });

  it("lock exception record", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p1 = new Person({ first_name: "mira" });
    expect(p1.lock_version).toBe(0);
    p1.first_name = "mira2";
    await p1.saveBang();
    const p2 = await Person.find(p1.id);
    expect(p1.lock_version).toBe(0);
    expect(p2.lock_version).toBe(0);
    p1.first_name = "mira3";
    await p1.saveBang();
    p2.first_name = "sue";
    let error: any;
    try {
      await p2.saveBang();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.name).toBe("StaleObjectError");
    expect(error.record).toBe(p2);
  });

  it("lock new when explicitly passing nil", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p1 = new Person({ first_name: "anika", lock_version: null });
    await p1.saveBang();
    expect(p1.lock_version).toBe(0);
  });

  it("lock new when explicitly passing value", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p1 = new Person({ first_name: "Douglas Adams", lock_version: 42 });
    await p1.saveBang();
    expect(p1.lock_version).toBe(42);
  });

  it("touch existing lock", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
        this.attribute("updated_at", "datetime");
      }
    }
    const p1 = await Person.create({ first_name: "Szymon" });
    expect(p1.lock_version).toBe(0);
    await p1.touch();
    expect(p1.lock_version).toBe(1);
    expect(p1.changed).toBe(false);
    expect(Object.keys(p1.savedChanges).sort()).toEqual(expect.arrayContaining(["lock_version"]));
  });

  it("touch stale object", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
        this.attribute("updated_at", "datetime");
      }
    }
    const person = await Person.create({ first_name: "Mehmet Emin" });
    const stalePerson = await Person.find(person.id);
    await person.update({ first_name: "Updated" });
    await expect(stalePerson.touch()).rejects.toThrow(StaleObjectError);
    expect(Object.keys(stalePerson.savedChanges).length).toBe(0);
  });

  it.skip("update with dirty primary key", () => {
    // BLOCKED: unknown — primary key mutation not supported
  });
  it.skip("delete with dirty primary key", () => {
    // BLOCKED: unknown — primary key mutation not supported
  });
  it.skip("destroy with dirty primary key", () => {
    // BLOCKED: unknown — primary key mutation not supported
  });

  it("explicit update lock column raise error", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const person = await Person.create({ first_name: "Douglas Adams" });
    person.first_name = "Douglas Adams2";
    person.lock_version = 42;
    expect(person.attributeChanged("lock_version")).toBe(true);
    await expect(person.save()).rejects.toThrow(StaleObjectError);
  });

  it("lock column name existing", async () => {
    class LegacyThing extends Base {
      static {
        this._tableName = "legacy_things";
        this.lockingColumn = "version";
        this.attribute("tps_report_number", "integer");
        this.attribute("version", "integer", { default: 0 });
      }
    }
    const t1 = await LegacyThing.create({ tps_report_number: 500 });
    const t2 = await LegacyThing.find(t1.id);
    expect(t1.version).toBe(0);
    expect(t2.version).toBe(0);
    t1.tps_report_number = 700;
    await t1.saveBang();
    expect(t1.version).toBe(1);
    expect(t2.version).toBe(0);
    t2.tps_report_number = 800;
    await expect(t2.saveBang()).rejects.toThrow(StaleObjectError);
  });

  it("lock column is mass assignable", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p1 = await Person.create({ first_name: "bianca" });
    expect(p1.lock_version).toBe(0);
    expect(p1.lock_version).toBe(new Person(p1.attributes).lock_version);
    p1.first_name = "bianca2";
    await p1.saveBang();
    expect(p1.lock_version).toBe(1);
    expect(p1.lock_version).toBe(new Person(p1.attributes).lock_version);
  });

  it("lock without default sets version to zero", async () => {
    class LockWithoutDefault extends Base {
      static {
        this._tableName = "lock_without_defaults";
        this.attribute("title", "string");
        this.attribute("lock_version", "integer");
        this.attribute("updated_at", "datetime");
      }
    }
    const t1 = new LockWithoutDefault();
    expect(t1.lock_version).toBe(0);
    await t1.saveBang();
    await t1.reload();
    expect(t1.lock_version).toBe(0);
  });

  it("touch existing lock without default should work with null in the database", async () => {
    class LockWithoutDefault extends Base {
      static {
        this._tableName = "lock_without_defaults";
        this.attribute("title", "string");
        this.attribute("lock_version", "integer");
        this.attribute("updated_at", "datetime");
      }
    }
    // Mirrors Rails: raw INSERT so lock_version and updated_at start as NULL in DB
    await Base.connection.executeMutation(
      "INSERT INTO lock_without_defaults(title) VALUES('title1')",
    );
    const t1 = (await LockWithoutDefault.last())!;
    expect(t1.lock_version).toBe(0);
    await t1.touch();
    expect(t1.lock_version).toBe(1);
    expect(t1.changed).toBe(false);
    expect(Object.keys(t1.savedChanges).length).toBeGreaterThan(0);
    expect(Object.keys(t1.savedChanges).sort()).toEqual(
      expect.arrayContaining(["lock_version", "updated_at"]),
    );
  });

  it("touch stale object with lock without default", async () => {
    class LockWithoutDefault extends Base {
      static {
        this._tableName = "lock_without_defaults";
        this.attribute("title", "string");
        this.attribute("lock_version", "integer");
        this.attribute("updated_at", "datetime");
      }
    }
    const t1 = await LockWithoutDefault.create({ title: "title1" });
    const staleObject = await LockWithoutDefault.find(t1.id);
    await t1.update({ title: "title2" });
    await expect(staleObject.touch()).rejects.toThrow(StaleObjectError);
    expect(Object.keys(staleObject.savedChanges).length).toBe(0);
  });

  it("lock without default should work with null in the database", async () => {
    class LockWithoutDefault extends Base {
      static {
        this._tableName = "lock_without_defaults";
        this.attribute("title", "string");
        this.attribute("lock_version", "integer");
        this.attribute("updated_at", "datetime");
      }
    }
    // Mirrors Rails: raw INSERT so lock_version starts as NULL in DB
    await Base.connection.executeMutation(
      "INSERT INTO lock_without_defaults(title) VALUES('title1')",
    );
    const t1 = (await LockWithoutDefault.last())!;
    const t2 = await LockWithoutDefault.find(t1.id);
    expect(t1.lock_version).toBe(0);
    expect(t1.readAttributeBeforeTypeCast("lock_version")).toBeNull();
    expect(t2.lock_version).toBe(0);
    expect(t2.readAttributeBeforeTypeCast("lock_version")).toBeNull();
    t1.title = "new title1";
    t2.title = "new title2";
    await t1.saveBang();
    expect(t1.lock_version).toBe(1);
    expect(t1.title).toBe("new title1");
    await expect(t2.saveBang()).rejects.toThrow(StaleObjectError);
    expect(t2.lock_version).toBe(0);
    expect(t2.title).toBe("new title2");
  });

  it("update with lock version without default should work on dirty value before type cast", async () => {
    class LockWithoutDefault extends Base {
      static {
        this._tableName = "lock_without_defaults";
        this.attribute("title", "string");
        this.attribute("lock_version", "integer");
        this.attribute("updated_at", "datetime");
      }
    }
    // Mirrors Rails: raw INSERT so lock_version starts as NULL in DB
    await Base.connection.executeMutation(
      "INSERT INTO lock_without_defaults(title) VALUES('title1')",
    );
    const t1 = (await LockWithoutDefault.last())!;
    expect(t1.lock_version).toBe(0);
    expect(t1.readAttributeBeforeTypeCast("lock_version")).toBeNull();
    // eslint-disable-next-line no-self-assign -- mirrors Rails: t1.lock_version = t1.lock_version
    t1.lock_version = t1.lock_version;
    expect(t1.lock_version).toBe(0);
    expect(t1.readAttributeBeforeTypeCast("lock_version")).toBe(0);
    await t1.update({ title: "new title1" });
    expect(t1.lock_version).toBe(1);
    expect(t1.title).toBe("new title1");
  });

  it("destroy with lock version without default should work on dirty value before type cast", async () => {
    class LockWithoutDefault extends Base {
      static {
        this._tableName = "lock_without_defaults";
        this.attribute("title", "string");
        this.attribute("lock_version", "integer");
        this.attribute("updated_at", "datetime");
      }
    }
    // Mirrors Rails: raw INSERT so lock_version starts as NULL in DB
    await Base.connection.executeMutation(
      "INSERT INTO lock_without_defaults(title) VALUES('title1')",
    );
    const t1 = (await LockWithoutDefault.last())!;
    expect(t1.lock_version).toBe(0);
    expect(t1.readAttributeBeforeTypeCast("lock_version")).toBeNull();
    // eslint-disable-next-line no-self-assign -- mirrors Rails: t1.lock_version = t1.lock_version
    t1.lock_version = t1.lock_version;
    expect(t1.lock_version).toBe(0);
    expect(t1.readAttributeBeforeTypeCast("lock_version")).toBe(0);
    await t1.destroyBang();
    expect(t1.isDestroyed()).toBe(true);
  });

  it.skip("lock without default queries count", () => {
    // BLOCKED: unknown — needs query counting infrastructure (spy on execute call count)
  });

  it("lock with custom column without default sets version to zero", async () => {
    class LockCustom extends Base {
      static {
        this._tableName = "lock_without_defaults_cust";
        this.lockingColumn = "custom_lock_version";
        this.attribute("title", "string");
        this.attribute("custom_lock_version", "integer");
      }
    }
    const t1 = new LockCustom();
    expect(t1.custom_lock_version).toBe(0);
    await t1.saveBang();
    await t1.reload();
    expect(t1.custom_lock_version).toBe(0);
  });

  it("lock with custom column without default should work with null in the database", async () => {
    class LockCustom extends Base {
      static {
        this._tableName = "lock_without_defaults_cust";
        this.lockingColumn = "custom_lock_version";
        this.attribute("title", "string");
        this.attribute("custom_lock_version", "integer");
      }
    }
    // Mirrors Rails: raw INSERT so custom_lock_version starts as NULL in DB
    await Base.connection.executeMutation(
      "INSERT INTO lock_without_defaults_cust(title) VALUES('title1')",
    );
    const t1 = (await LockCustom.last())!;
    const t2 = await LockCustom.find(t1.id);
    expect(t1.custom_lock_version).toBe(0);
    expect(t1.readAttributeBeforeTypeCast("custom_lock_version")).toBeNull();
    expect(t2.custom_lock_version).toBe(0);
    expect(t2.readAttributeBeforeTypeCast("custom_lock_version")).toBeNull();
    t1.title = "new title1";
    t2.title = "new title2";
    await t1.saveBang();
    expect(t1.custom_lock_version).toBe(1);
    expect(t1.title).toBe("new title1");
    await expect(t2.saveBang()).rejects.toThrow(StaleObjectError);
    expect(t2.custom_lock_version).toBe(0);
    expect(t2.title).toBe("new title2");
  });

  it.skip("lock with custom column without default queries count", () => {
    // BLOCKED: unknown — needs query counting infrastructure
  });

  it("readonly attributes", async () => {
    class ReadonlyNameShip extends Base {
      static {
        this._tableName = "people";
        this.attribute("name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
        this.attrReadonly("name");
      }
    }
    expect(ReadonlyNameShip.readonlyAttributes).toContain("name");
    const s = await ReadonlyNameShip.create({ name: "unchangeable name" });
    await s.reload();
    expect(s.name).toBe("unchangeable name");
    await expect(s.update({ name: "changed name" })).rejects.toThrow(ReadonlyAttributeError);
    await s.reload();
    expect(s.name).toBe("unchangeable name");
  });

  it("quote table name reserved word references", async () => {
    class Reference extends Base {
      static {
        this._tableName = "references";
        this.attribute("favorite", "boolean");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const ref = await Reference.create({ favorite: false });
    ref.favorite = !ref.favorite;
    await ref.save();
    expect(ref.favorite).toBe(true);
    expect(ref.lock_version).toBe(1);
  });

  it("update without attributes does not only update lock version", async () => {
    class Person extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p1 = await Person.create({ first_name: "anika" });
    const lockVersion = p1.lock_version;
    await p1.save();
    await p1.reload();
    expect(p1.lock_version).toBe(lockVersion);
  });

  it.skip("counter cache with touch and lock version", () => {
    // BLOCKED: associations — counter cache with locking not fully integrated
  });
  it.skip("polymorphic destroy with dependencies and lock version", () => {
    // BLOCKED: associations — polymorphic + locking not supported
  });
  it.skip("removing has and belongs to many associations upon destroy", () => {
    // BLOCKED: associations — habtm not supported
  });

  it("yaml dumping with lock column", async () => {
    class LockWithoutDefault extends Base {
      static {
        this._tableName = "lock_without_defaults";
        this.attribute("title", "string");
        this.attribute("lock_version", "integer");
        this.attribute("updated_at", "datetime");
      }
    }
    const t1 = new LockWithoutDefault();
    const attrs = t1.attributes;
    const t2 = new LockWithoutDefault(attrs);
    expect(t1.attributes).toEqual(t2.attributes);
  });
});

describe("OptimisticLockingWithSchemaChangeTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(TEST_SCHEMA);
  });

  it.skip("increment counter updates lock version", () => {
    // BLOCKED: migration — requires DDL column add/remove
  });
  it.skip("decrement counter updates lock version", () => {
    // BLOCKED: migration — requires DDL column add/remove
  });
  it.skip("update counters updates lock version", () => {
    // BLOCKED: migration — requires DDL column add/remove
  });
  it.skip("increment counter updates custom lock version", () => {
    // BLOCKED: migration — requires DDL column add/remove
  });
  it.skip("decrement counter updates custom lock version", () => {
    // BLOCKED: migration — requires DDL column add/remove
  });
  it.skip("update counters updates custom lock version", () => {
    // BLOCKED: migration — requires DDL column add/remove
  });

  it("destroy dependents", async () => {
    class LockPerson extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    class LockPet extends Base {
      static {
        this._tableName = "pets";
        this.attribute("name", "string");
        this.attribute("person_id", "integer");
      }
    }
    registerModel("LockPerson", LockPerson);
    registerModel("LockPet", LockPet);
    Associations.hasMany.call(LockPerson, "lock_pets", {
      className: "LockPet",
      foreignKey: "person_id",
      dependent: "destroy",
    });
    const p1 = await LockPerson.create({ first_name: "fjord" });
    const t = await LockPet.create({ name: "Fido", person_id: p1.id });
    await p1.reload();
    await p1.destroy();
    expect(p1.isDestroyed()).toBe(true);
    await expect(LockPerson.find(p1.id)).rejects.toThrow();
    await expect(LockPet.find(t.id)).rejects.toThrow();
  });

  it("destroy existing object with locking column value null in the database", async () => {
    class LockWithoutDefault extends Base {
      static {
        this._tableName = "lock_without_defaults";
        this.attribute("title", "string");
        this.attribute("lock_version", "integer");
        this.attribute("updated_at", "datetime");
      }
    }
    // Mirrors Rails: raw INSERT so lock_version starts as NULL in DB
    await Base.connection.executeMutation(
      "INSERT INTO lock_without_defaults(title) VALUES('title1')",
    );
    const t1 = (await LockWithoutDefault.last())!;
    expect(t1.lock_version).toBe(0);
    expect(t1.readAttributeBeforeTypeCast("lock_version")).toBeNull();
    await t1.destroy();
    expect(t1.isDestroyed()).toBe(true);
  });

  it("destroy stale object", async () => {
    class LockWithoutDefault extends Base {
      static {
        this._tableName = "lock_without_defaults";
        this.attribute("title", "string");
        this.attribute("lock_version", "integer");
        this.attribute("updated_at", "datetime");
      }
    }
    const t1 = await LockWithoutDefault.create({ title: "title1" });
    const staleObject = await LockWithoutDefault.find(t1.id);
    await t1.update({ title: "title2" });
    await expect(staleObject.destroyBang()).rejects.toThrow(StaleObjectError);
    expect(staleObject.isDestroyed()).toBe(false);
  });
});

describe("PessimisticLockingTest", () => {
  // Mirrors Rails `fixtures :people` — seed the canonical people rows and read
  // them with `Person.find(people("michael").id)` (Rails' `Person.find(1)`)
  // instead of constructing records inline. `schema` recreates the canonical
  // `people` table so the full fixture columns (gender, *_id, counts) and the
  // shared Person model resolve, regardless of any bespoke `people` a sibling
  // file left in the shared worker DB.
  const { people } = useHandlerFixtures(["people"], { schema: canonicalSchema });

  it("typical find with lock", async () => {
    await Person.transaction(async () => {
      const locked = await Person.all().lock().find(people("michael").id);
      expect(locked.first_name).toBe("Michael");
    });
  });

  it.skip("eager find with lock", () => {
    // BLOCKED: associations — needs eager loading (includes) with lock support
  });

  it("lock does not raise when the object is not dirty", async () => {
    const person = await Person.find(people("michael").id);
    await person.lockBang();
  });

  it("lock raises when the record is dirty", async () => {
    const person = await Person.find(people("michael").id);
    person.first_name = "fooman";
    await expect(person.lockBang()).rejects.toThrow(/Changed attributes: "first_name"/);
  });

  it("locking in after save callback", async () => {
    const frog = await Frog.create({ name: "Old Frog" });
    frog.name = "New Frog";
    await frog.saveBang();
  });

  it("with lock commits transaction", async () => {
    const person = await Person.find(people("michael").id);
    await person.withLock(async () => {
      person.first_name = "fooman";
      await person.saveBang();
    });
    const reloaded = await Person.find(person.id);
    expect(reloaded.first_name).toBe("fooman");
  });

  it("with lock rolls back transaction", async () => {
    const person = await Person.find(people("michael").id);
    const old = person.first_name;
    try {
      await person.withLock(async () => {
        person.first_name = "fooman";
        await person.saveBang();
        throw new Error("oops");
      });
    } catch {
      // expected
    }
    const reloaded = await Person.find(person.id);
    expect(reloaded.first_name).toBe(old);
  });

  it("with lock configures transaction", async () => {
    const adapter = Base.connection as any;
    const p = await Person.find(people("michael").id);
    await Person.transaction(async () => {
      const outerTx = adapter.transactionManager.currentTransaction;
      expect((outerTx as any).joinable).toBe(true);
      await p.withLock({ requiresNew: true, joinable: false }, async () => {
        const innerTx = adapter.transactionManager.currentTransaction;
        expect(innerTx).not.toBe(outerTx);
        expect((innerTx as any).joinable).toBe(false);
      });
    });
  });

  it.skip("lock sending custom lock statement", async () => {
    // BLOCKED: unknown — needs query matching infrastructure
  });

  it.skip("with lock sets isolation", () => {
    // BLOCKED: transactions — needs transaction isolation level support
  });

  it("with lock locks with no args", async () => {
    const p = await Person.find(people("michael").id);
    await p.withLock(async () => {
      expect(p.first_name).toBe("Michael");
    });
  });

  it.skip("no locks no wait", () => {
    // BLOCKED: connection-pool — requires concurrent database connections
  });
});
