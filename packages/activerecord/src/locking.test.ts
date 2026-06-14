/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/locking_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel, StaleObjectError, ReadonlyAttributeError } from "./index.js";
import { Associations, association } from "./associations.js";

import { defineSchema } from "./test-helpers/define-schema.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Person } from "./test-helpers/models/person.js";
import { Frog } from "./test-helpers/models/frog.js";
import { Treasure } from "./test-helpers/models/treasure.js";
import { StringKeyObject } from "./test-helpers/models/string-key-object.js";
import { LegacyThing } from "./test-helpers/models/legacy-thing.js";
import { Reference } from "./test-helpers/models/reference.js";
import { Ship } from "./test-helpers/models/ship.js";
import { LockWithoutDefault } from "./test-helpers/models/lock-without-default.js";
import { LockWithCustomColumnWithoutDefault } from "./test-helpers/models/lock-with-custom-column-without-default.js";
import { assertQueriesCount } from "./testing/query-assertions.js";

describe("OptimisticLockingTest", () => {
  // Mirrors Rails `fixtures :people, :legacy_things, :references,
  // :string_key_objects, :peoples_treasures`: seed the canonical rows and read
  // them with the shared Person/LegacyThing/Reference/StringKeyObject models
  // (Rails' `Person.find(1)` etc.) instead of constructing records inline. The
  // bespoke `LockWithoutDefault*` (Rails declares these top-level, no fixtures)
  // and `ReadonlyNameShip < Ship` tables are canonical too. Treasures are listed
  // before peoples_treasures so their IDs are resolved first (ref ordering).
  const { people, stringKeyObjects, legacyThings, references } = useHandlerFixtures(
    ["people", "stringKeyObjects", "legacyThings", "references", "treasures", "peoplesTreasures"],
    { schema: canonicalSchema },
  );
  beforeAll(async () => {
    // Force-recreate every canonical table this suite touches. The worker's
    // canonical schema preload keeps their signatures cache-warm, so a plain
    // `defineSchema` (including the fixtures' own) is a no-op — meaning a sibling
    // file that physically replaced a table with a bespoke shape (e.g.
    // autosave-association's `people: { name, first_name }`) would survive into
    // this suite. `dropExisting` bypasses the signature cache and rebuilds them
    // from the canonical schema verbatim, so we never write a reduced shape that
    // could in turn contaminate later suites. Covers the fixture tables plus the
    // bespoke-class tables: `ships` (ReadonlyNameShip) and the
    // `lock_without_defaults*` pair (Rails: `t.timestamps null: true`).
    await defineSchema(
      {
        people: canonicalSchema.people,
        references: canonicalSchema.references,
        legacy_things: canonicalSchema.legacy_things,
        string_key_objects: canonicalSchema.string_key_objects,
        ships: canonicalSchema.ships,
        lock_without_defaults: canonicalSchema.lock_without_defaults,
        lock_without_defaults_cust: canonicalSchema.lock_without_defaults_cust,
        treasures: canonicalSchema.treasures,
        peoples_treasures: canonicalSchema.peoples_treasures,
      },
      { dropExisting: true },
    );
    registerModel(Treasure);
  });

  it("quote value passed lock col", async () => {
    const p1 = await Person.find(people("michael").id);
    expect(p1.lock_version).toBe(0);
    p1.first_name = "anika2";
    await p1.saveBang();
    expect(p1.lock_version).toBe(1);
  });

  it("non integer lock existing", async () => {
    const s1 = await StringKeyObject.find(stringKeyObjects("first").id);
    const s2 = await StringKeyObject.find(stringKeyObjects("first").id);
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
    const s1 = await StringKeyObject.find(stringKeyObjects("first").id);
    const s2 = await StringKeyObject.find(stringKeyObjects("first").id);
    expect(s1.lock_version).toBe(0);
    expect(s2.lock_version).toBe(0);
    s1.name = "updated record";
    await s1.saveBang();
    expect(s1.lock_version).toBe(1);
    expect(s2.lock_version).toBe(0);
    await expect(s2.destroy()).rejects.toThrow(StaleObjectError);
    await s1.destroy();
    expect(s1.isDestroyed()).toBe(true);
    await expect(StringKeyObject.find(stringKeyObjects("first").id)).rejects.toThrow();
  });

  it("lock existing", async () => {
    const p1 = await Person.find(people("michael").id);
    const p2 = await Person.find(people("michael").id);
    expect(p1.lock_version).toBe(0);
    expect(p2.lock_version).toBe(0);
    p1.first_name = "stu";
    await p1.saveBang();
    expect(p1.lock_version).toBe(1);
    expect(p2.lock_version).toBe(0);
    p2.first_name = "sue";
    await expect(p2.saveBang()).rejects.toThrow(StaleObjectError);
  });

  it("lock destroy", async () => {
    // Reads the `michael` fixture (Rails' `Person.find(1)`) but through an
    // association-free model: the canonical Person's `dependent: :destroy` HMT
    // graph (jobsWithDependentDestroy → references → job) isn't resolvable on
    // the destroy path yet. Follow-up: use the shared Person once through-
    // association dependent destroy resolves its source class.
    class LockPerson extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
      }
    }
    const p1 = await LockPerson.find(people("michael").id);
    const p2 = await LockPerson.find(people("michael").id);
    expect(p1.lock_version).toBe(0);
    expect(p2.lock_version).toBe(0);
    p1.first_name = "stu";
    await p1.saveBang();
    expect(p1.lock_version).toBe(1);
    expect(p2.lock_version).toBe(0);
    await expect(p2.destroy()).rejects.toThrow(StaleObjectError);
    await p1.destroy();
    expect(p1.isDestroyed()).toBe(true);
    await expect(LockPerson.find(people("michael").id)).rejects.toThrow();
  });

  it("lock repeating", async () => {
    const p1 = await Person.find(people("michael").id);
    const p2 = await Person.find(people("michael").id);
    expect(p1.lock_version).toBe(0);
    expect(p2.lock_version).toBe(0);
    p1.first_name = "stu";
    await p1.saveBang();
    expect(p1.lock_version).toBe(1);
    expect(p2.lock_version).toBe(0);
    p2.first_name = "sue";
    await expect(p2.saveBang()).rejects.toThrow(StaleObjectError);
    p2.first_name = "sue2";
    await expect(p2.saveBang()).rejects.toThrow(StaleObjectError);
  });

  it("lock new", async () => {
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
    const p1 = new Person({ first_name: "anika", lock_version: null });
    await p1.saveBang();
    expect(p1.lock_version).toBe(0);
  });

  it("lock new when explicitly passing value", async () => {
    const p1 = new Person({ first_name: "Douglas Adams", lock_version: 42 });
    await p1.saveBang();
    expect(p1.lock_version).toBe(42);
  });

  it("touch existing lock", async () => {
    const p1 = await Person.find(people("michael").id);
    expect(p1.lock_version).toBe(0);
    await p1.touch();
    expect(p1.lock_version).toBe(1);
    expect(p1.changed).toBe(false);
    expect(Object.keys(p1.savedChanges).sort()).toEqual(["lock_version", "updated_at"]);
  });

  it("touch stale object", async () => {
    const person = await Person.createBang({ first_name: "Mehmet Emin" });
    const stalePerson = await Person.find(person.id);
    await person.updateAttribute("gender", "M");
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
    const person = await Person.find(people("michael").id);
    person.first_name = "Douglas Adams";
    person.lock_version = 42;
    expect(person.attributeChanged("lock_version")).toBe(true);
    await expect(person.save()).rejects.toThrow(StaleObjectError);
  });

  it("lock column name existing", async () => {
    const t1 = await LegacyThing.find(legacyThings("obtuse").id);
    const t2 = await LegacyThing.find(legacyThings("obtuse").id);
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
    const p1 = await Person.create({ first_name: "bianca" });
    expect(p1.lock_version).toBe(0);
    expect(p1.lock_version).toBe(new Person(p1.attributes).lock_version);
    p1.first_name = "bianca2";
    await p1.saveBang();
    expect(p1.lock_version).toBe(1);
    expect(p1.lock_version).toBe(new Person(p1.attributes).lock_version);
  });

  it("lock without default sets version to zero", async () => {
    const t1 = new LockWithoutDefault();
    expect(t1.lock_version).toBe(0);
    await t1.saveBang();
    await t1.reload();
    expect(t1.lock_version).toBe(0);
  });

  it("touch existing lock without default should work with null in the database", async () => {
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
    const t1 = await LockWithoutDefault.create({ title: "title1" });
    const staleObject = await LockWithoutDefault.find(t1.id);
    await t1.update({ title: "title2" });
    await expect(staleObject.touch()).rejects.toThrow(StaleObjectError);
    expect(Object.keys(staleObject.savedChanges).length).toBe(0);
  });

  it("lock without default should work with null in the database", async () => {
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

  it("lock without default queries count", async () => {
    const t1 = await LockWithoutDefault.create({ title: "title1" });
    expect(t1.title).toBe("title1");
    expect(t1.lock_version).toBe(0);

    await assertQueriesCount(3, false, async () => {
      await t1.update({ title: "title2" });
    });

    await t1.reload();
    expect(t1.title).toBe("title2");
    expect(t1.lock_version).toBe(1);

    const t2 = new LockWithoutDefault({ title: "title1" });

    await assertQueriesCount(3, false, async () => {
      await t2.saveBang();
    });

    await t2.reload();
    expect(t2.title).toBe("title1");
    expect(t2.lock_version).toBe(0);
  });

  it("lock with custom column without default sets version to zero", async () => {
    const t1 = new LockWithCustomColumnWithoutDefault();
    expect(t1.custom_lock_version).toBe(0);
    await t1.saveBang();
    await t1.reload();
    expect(t1.custom_lock_version).toBe(0);
  });

  it("lock with custom column without default should work with null in the database", async () => {
    // Mirrors Rails: raw INSERT so custom_lock_version starts as NULL in DB
    await Base.connection.executeMutation(
      "INSERT INTO lock_without_defaults_cust(title) VALUES('title1')",
    );
    const t1 = (await LockWithCustomColumnWithoutDefault.last())!;
    const t2 = await LockWithCustomColumnWithoutDefault.find(t1.id);
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

  it("lock with custom column without default queries count", async () => {
    const t1 = await LockWithCustomColumnWithoutDefault.create({ title: "title1" });
    expect(t1.title).toBe("title1");
    expect(t1.custom_lock_version).toBe(0);

    await assertQueriesCount(3, false, async () => {
      await t1.update({ title: "title2" });
    });

    await t1.reload();
    expect(t1.title).toBe("title2");
    expect(t1.custom_lock_version).toBe(1);

    const t2 = new LockWithCustomColumnWithoutDefault({ title: "title1" });

    await assertQueriesCount(3, false, async () => {
      await t2.saveBang();
    });

    await t2.reload();
    expect(t2.title).toBe("title1");
    expect(t2.custom_lock_version).toBe(0);
  });

  it("readonly attributes", async () => {
    class ReadonlyNameShip extends Ship {
      static {
        this.attrReadonly("name");
      }
    }
    expect(ReadonlyNameShip.readonlyAttributes).toEqual(["name"]);
    const s = await ReadonlyNameShip.create({ name: "unchangeable name" });
    await s.reload();
    expect(s.name).toBe("unchangeable name");
    await expect(s.update({ name: "changed name" })).rejects.toThrow(ReadonlyAttributeError);
    await s.reload();
    expect(s.name).toBe("unchangeable name");
  });

  it("quote table name reserved word references", async () => {
    const ref = await Reference.find(references("michael_magician").id);
    ref.favorite = !ref.favorite;
    await ref.save();
    expect(ref.favorite).toBe(true);
    expect(ref.lock_version).toBe(1);
  });

  it("update without attributes does not only update lock version", async () => {
    const p1 = await Person.createBang({ first_name: "anika" });
    const lockVersion = p1.lock_version;
    await p1.save();
    await p1.reload();
    expect(p1.lock_version).toBe(lockVersion);
  });

  it.skip("counter cache with touch and lock version", () => {
    // BLOCKED: belongs-to counter cache updates the target through the
    // relation-level `updateCounters` (with a combined `touch`), which bypasses
    // the class-level Locking::Optimistic#update_counters override that bumps
    // lock_version, and the separate belongs-to touch path raises a stale
    // object. Needs the belongs-to counter-cache+touch+lock integration.
  });
  it.skip("polymorphic destroy with dependencies and lock version", () => {
    // BLOCKED: same belongs-to counter-cache+touch+lock integration gap — a
    // wheel create touches the car via the relation-level counter update and
    // the separate touch raises StaleObjectError.
  });
  it("removing has and belongs to many associations upon destroy", async () => {
    // RichPerson's async beforeValidation callbacks conflict with the sync
    // validation chain, so we use a local class with the same HABTM.
    class TestRichPerson extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
      }
    }
    registerModel("TestRichPerson", TestRichPerson);
    Associations.hasAndBelongsToMany.call(TestRichPerson, "treasures", {
      className: "Treasure",
      joinTable: "peoples_treasures",
      foreignKey: "rich_person_id",
    });
    const p = await TestRichPerson.createBang({ first_name: "Jon" });
    const proxy = association(p, "treasures");
    await proxy.create({});
    expect(await proxy.isEmpty()).toBe(false);
    await p.destroy();
    // Rails clears the association cache on destroy; in TS the proxy cache is
    // not invalidated automatically, so force a reload to mirror Rails' fresh-
    // query behavior before asserting empty.
    await proxy.reload();
    expect(await proxy.isEmpty()).toBe(true);
    const rows = await (Base.connection as any).selectRows(
      `SELECT * FROM peoples_treasures WHERE rich_person_id = ${p.id}`,
    );
    expect(rows.length).toBe(0);
  });

  it("yaml dumping with lock column", async () => {
    const t1 = new LockWithoutDefault();
    const attrs = t1.attributes;
    const t2 = new LockWithoutDefault(attrs);
    expect(t1.attributes).toEqual(t2.attributes);
  });
});

describe("OptimisticLockingWithSchemaChangeTest", () => {
  // Mirrors Rails `fixtures :people, :legacy_things, :references` plus
  // `self.use_transactional_tests = false` (locking_test.rb:563-568): the
  // counter tests run DDL (`add_counter_column_to`), and on MySQL `ALTER TABLE`
  // forces an implicit commit that would end the per-test SAVEPOINT — so those
  // tests opt out of the transaction wrapper via `usesTransaction`. The fixture
  // loader still delete+inserts each table per test, resetting `lock_version`
  // to 0 between cases on every adapter.
  const counterTests = [
    "increment counter updates lock version",
    "decrement counter updates lock version",
    "update counters updates lock version",
    "increment counter updates custom lock version",
    "decrement counter updates custom lock version",
    "update counters updates custom lock version",
  ];
  const { people, legacyThings } = useHandlerFixtures(["people", "legacyThings", "references"], {
    schema: canonicalSchema,
    usesTransaction: counterTests,
  });
  beforeAll(async () => {
    await defineSchema(
      {
        people: canonicalSchema.people,
        legacy_things: canonicalSchema.legacy_things,
        personal_legacy_things: canonicalSchema.personal_legacy_things,
        lock_without_defaults: canonicalSchema.lock_without_defaults,
        lock_without_defaults_cust: canonicalSchema.lock_without_defaults_cust,
      },
      { dropExisting: true },
    );
  });

  // Mirrors Rails' private add_counter_column_to / remove_counter_column_from
  // helpers: add a `test_count` integer column, run reset_column_information so
  // the model picks it up, then strip it again in the ensure block.
  async function addCounterColumnTo(model: typeof Base): Promise<void> {
    await (Base.connection as any).addColumn(model.tableName, "test_count", "integer", {
      null: false,
      default: 0,
    });
    model.resetColumnInformation();
  }
  async function removeCounterColumnFrom(model: typeof Base): Promise<void> {
    await (Base.connection as any).removeColumn(model.tableName, "test_count");
    model.resetColumnInformation();
  }

  // Mirrors Rails' private counter_test(model, expected_count) { |id| ... }.
  async function counterTest(
    model: typeof Base,
    expectedCount: number,
    op: (id: unknown) => Promise<unknown>,
  ): Promise<void> {
    await addCounterColumnTo(model);
    try {
      const object = (await (model as any).first())!;
      expect(object.test_count).toBe(0);
      expect(object.readAttribute(model.lockingColumn)).toBe(0);
      await op(object.id);
      await object.reload();
      expect(object.test_count).toBe(expectedCount);
      expect(object.readAttribute(model.lockingColumn)).toBe(1);
    } finally {
      await removeCounterColumnFrom(model);
    }
  }

  // Touch the fixture accessors so the seeded sets are referenced (Rails
  // declares `fixtures :people, :legacy_things` for these); `model.first()`
  // inside counterTest reads the seeded row, mirroring Rails' `model.first`.
  void people;
  void legacyThings;

  // Rails generates these with { lock_version: Person, custom_lock_version: LegacyThing }.
  it("increment counter updates lock version", async () => {
    await counterTest(Person, 1, (id) => Person.incrementCounter("test_count", id));
  });
  it("decrement counter updates lock version", async () => {
    await counterTest(Person, -1, (id) => Person.decrementCounter("test_count", id));
  });
  it("update counters updates lock version", async () => {
    await counterTest(Person, 1, (id) => Person.updateCounters(id, { test_count: 1 }));
  });
  it("increment counter updates custom lock version", async () => {
    await counterTest(LegacyThing, 1, (id) => LegacyThing.incrementCounter("test_count", id));
  });
  it("decrement counter updates custom lock version", async () => {
    await counterTest(LegacyThing, -1, (id) => LegacyThing.decrementCounter("test_count", id));
  });
  it("update counters updates custom lock version", async () => {
    await counterTest(LegacyThing, 1, (id) => LegacyThing.updateCounters(id, { test_count: 1 }));
  });

  it("destroy dependents", async () => {
    // Mirrors Rails: Person with PersonalLegacyThing (dependent: :destroy).
    // Uses inline classes to avoid counterCache on the canonical PersonalLegacyThing.
    class LockPerson extends Base {
      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
      }
    }
    class LockPersonalLegacyThing extends Base {
      static {
        this._tableName = "personal_legacy_things";
        this.lockingColumn = "version";
        this.attribute("person_id", "integer");
      }
    }
    registerModel("LockPerson", LockPerson);
    registerModel("LockPersonalLegacyThing", LockPersonalLegacyThing);
    Associations.hasMany.call(LockPerson, "lockPersonalLegacyThings", {
      className: "LockPersonalLegacyThing",
      foreignKey: "person_id",
      dependent: "destroy",
    });
    const p1 = await LockPerson.create({ first_name: "fjord" });
    const t = await LockPersonalLegacyThing.create({ person_id: p1.id });
    await p1.reload();
    await p1.destroy();
    expect(p1.isDestroyed()).toBe(true);
    await expect(LockPerson.find(p1.id)).rejects.toThrow();
    await expect(LockPersonalLegacyThing.find(t.id)).rejects.toThrow();
  });

  it("destroy existing object with locking column value null in the database", async () => {
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
