import { describe, it, expect, beforeAll } from "vitest";
import {
  Base,
  registerModel,
  StaleObjectError,
  ReadonlyAttributeError,
  RecordNotUnique,
  RecordNotFound,
} from "./index.js";
import { Associations, association } from "./associations.js";

import { fixtures } from "./test-fixtures.js";
import { Person, RichPerson } from "./test-helpers/models/person.js";
import { Frog } from "./test-helpers/models/frog.js";
import { Treasure } from "./test-helpers/models/treasure.js";
import { StringKeyObject } from "./test-helpers/models/string-key-object.js";
import { LegacyThing } from "./test-helpers/models/legacy-thing.js";
import { Reference } from "./test-helpers/models/reference.js";
import { Job } from "./test-helpers/models/job.js";
import { Comment } from "./test-helpers/models/comment.js";
import { PersonalLegacyThing } from "./test-helpers/models/personal-legacy-thing.js";
import { Ship } from "./test-helpers/models/ship.js";
import { LockWithoutDefault } from "./test-helpers/models/lock-without-default.js";
import { LockWithCustomColumnWithoutDefault } from "./test-helpers/models/lock-with-custom-column-without-default.js";
import { Car } from "./test-helpers/models/car.js";
import { Wheel } from "./test-helpers/models/wheel.js";
import { Bulb, CustomBulb, FunkyBulb, FailedBulb } from "./test-helpers/models/bulb.js";
import { Engine } from "./test-helpers/models/engine.js";
import { Reader } from "./test-helpers/models/reader.js";
import { travel, travelBack } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { assertQueriesCount, assertQueriesMatch } from "./testing/query-assertions.js";
import { adapterType } from "./test-adapter.js";

describe("OptimisticLockingTest", () => {
  const { people, stringKeyObjects, legacyThings, references } = fixtures([
    "people",
    "stringKeyObjects",
    "legacyThings",
    "references",
    "treasures",
    "peoplesTreasures",
  ]);
  beforeAll(async () => {
    registerModel("Car", Car);
    registerModel("Wheel", Wheel);
    registerModel("Bulb", Bulb);
    registerModel("CustomBulb", CustomBulb);
    registerModel("FunkyBulb", FunkyBulb);
    registerModel("FailedBulb", FailedBulb);
    registerModel("Engine", Engine);
    void Car.resetColumnInformation();
    void Wheel.resetColumnInformation();
    await Car.loadSchema();
    await Wheel.loadSchema();
    registerModel(Treasure);
    registerModel(Reference);
    registerModel(Job);
    registerModel(Comment);
    registerModel(PersonalLegacyThing);
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
    class LockPerson extends Base {
      declare first_name: string;
      declare lock_version: number;
      static {
        this.attribute("id", "integer");
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
    expect(p1.isChanged).toBe(false);
    expect(Object.keys(p1.savedChanges).sort()).toEqual(["lock_version", "updated_at"]);
  });

  it("touch stale object", async () => {
    const person = await Person.createBang({ first_name: "Mehmet Emin" });
    const stalePerson = await Person.find(person.id);
    await person.updateAttribute("gender", "M");
    await expect(stalePerson.touch()).rejects.toThrow(StaleObjectError);
    expect(Object.keys(stalePerson.savedChanges).length).toBe(0);
  });

  it("update with dirty primary key", async () => {
    await expect(
      (async () => {
        const person = await Person.find(1);
        person.id = 2;
        await person.saveBang();
      })(),
    ).rejects.toBeInstanceOf(RecordNotUnique);

    const person = await Person.find(1);
    person.id = 42;
    await person.saveBang();

    expect(await Person.find(42)).toBeDefined();
    await expect(Person.find(1)).rejects.toBeInstanceOf(RecordNotFound);
  });

  it("delete with dirty primary key", async () => {
    const person = await Person.find(1);
    person.id = 2;
    await person.delete();

    expect(await Person.find(2)).toBeDefined();
    await expect(Person.find(1)).rejects.toBeInstanceOf(RecordNotFound);
  });

  it("destroy with dirty primary key", async () => {
    const person = await Person.find(1);
    person.id = 2;
    await person.destroy();

    expect(await Person.find(2)).toBeDefined();
    await expect(Person.find(1)).rejects.toBeInstanceOf(RecordNotFound);
  });

  it("touch with dirty primary key", async () => {
    const before = await Person.find(1);
    const beforeLockVersion = before.lock_version;

    const person = await Person.find(1);
    person.id = 42;
    expect(await person.touch()).toBe(true);

    const persisted = await Person.find(1);
    expect(persisted.lock_version).toBe(beforeLockVersion + 1);
    await expect(Person.find(42)).rejects.toBeInstanceOf(RecordNotFound);
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
    await Base.connection.executeMutation(
      "INSERT INTO lock_without_defaults(title) VALUES('title1')",
    );
    const t1 = (await LockWithoutDefault.last())!;
    expect(t1.lock_version).toBe(0);
    await t1.touch();
    expect(t1.lock_version).toBe(1);
    expect(t1.isChanged).toBe(false);
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

  const after = (a: unknown, b: unknown): boolean =>
    (a as RubyTime).toR().cmp((b as RubyTime).toR()) > 0;

  it("counter cache with touch and lock version", async () => {
    const car = await Car.createBang({});

    expect(car.wheels_count).toBe(0);
    expect(car.lock_version).toBe(0);

    let previouslyUpdatedAt = car.updated_at;
    let previouslyWheelsOwnedAt = car.wheels_owned_at;
    travel(1000);
    try {
      await Wheel.createBang({ wheelable: car });
    } finally {
      travelBack();
    }

    await car.reload();
    expect(car.wheels_count).toBe(1);
    expect(car.lock_version).toBe(1);
    expect(after(car.updated_at, previouslyUpdatedAt)).toBe(true);
    expect(after(car.wheels_owned_at, previouslyWheelsOwnedAt)).toBe(true);

    previouslyUpdatedAt = car.updated_at;
    previouslyWheelsOwnedAt = car.wheels_owned_at;
    travel(2000);
    try {
      await ((await association(car, "wheels").first()) as any).update({ size: 42 });
    } finally {
      travelBack();
    }

    await car.reload();
    expect(car.wheels_count).toBe(1);
    expect(car.lock_version).toBe(2);
    expect(after(car.updated_at, previouslyUpdatedAt)).toBe(true);
    expect(after(car.wheels_owned_at, previouslyWheelsOwnedAt)).toBe(true);

    previouslyUpdatedAt = car.updated_at;
    previouslyWheelsOwnedAt = car.wheels_owned_at;
    travel(3000);
    try {
      await ((await association(car, "wheels").first()) as any).destroyBang();
    } finally {
      travelBack();
    }

    await car.reload();
    expect(car.wheels_count).toBe(0);
    expect(car.lock_version).toBe(3);
    expect(after(car.updated_at, previouslyUpdatedAt)).toBe(true);
    expect(after(car.wheels_owned_at, previouslyWheelsOwnedAt)).toBe(true);

    await association(car, "wheels").push(await Wheel.createBang({}));
    expect(car.wheels_count).toBe(1);
    expect(car.lock_version).toBe(4);
    expect((car as any).attributeChanged("lock_version")).toBe(false);
    await car.update({ name: "herbie" });
  });

  it("polymorphic destroy with dependencies and lock version", async () => {
    const car = await Car.createBang({});

    const wheels = association(car, "wheels");
    const beforeCreate = (await wheels.count()) as number;
    await wheels.create({});
    expect(await wheels.count()).toBe(beforeCreate + 1);

    const reloaded = await car.reload();
    const beforeDestroy = Number(await Wheel.where({ wheelable_id: reloaded.id }).count());
    expect(beforeDestroy).toBe(1);
    await reloaded.destroy();
    const afterDestroy = Number(await Wheel.where({ wheelable_id: reloaded.id }).count());
    expect(afterDestroy).toBe(beforeDestroy - 1);
    expect(reloaded.isDestroyed()).toBe(true);
  });
  it("removing has and belongs to many associations upon destroy", async () => {
    const p = await RichPerson.createBang({ first_name: "Jon" });
    const proxy = association(p, "treasures");
    await proxy.create({});
    expect(await proxy.isEmpty()).toBe(false);
    await p.destroy();
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
  const schemaChangeTests = [
    "increment counter updates lock version",
    "decrement counter updates lock version",
    "update counters updates lock version",
    "increment counter updates custom lock version",
    "decrement counter updates custom lock version",
    "update counters updates custom lock version",
    "destroy dependents",
    "destroy existing object with locking column value null in the database",
    "destroy stale object",
  ];
  const { people, legacyThings } = fixtures(["people", "legacyThings", "references"], {
    usesTransaction: schemaChangeTests,
  });

  async function addCounterColumnTo(model: typeof Base): Promise<void> {
    await (Base.connection as any).addColumn(model.tableName, "test_count", "integer", {
      null: false,
      default: 0,
    });
    void model.resetColumnInformation();
  }
  async function removeCounterColumnFrom(model: typeof Base): Promise<void> {
    await (Base.connection as any).removeColumn(model.tableName, "test_count");
    void model.resetColumnInformation();
  }

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

  void people;
  void legacyThings;

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
    class LockPerson extends Base {
      static {
        this.attribute("id", "integer");
        this._tableName = "people";
        this.attribute("first_name", "string");
        this.attribute("lock_version", "integer", { default: 0 });
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
      }
    }
    class LockPersonalLegacyThing extends Base {
      static {
        this.attribute("id", "integer");
        this._tableName = "personal_legacy_things";
        this.lockingColumn = "version";
        this.attribute("person_id", "integer");
        this.attribute("version", "integer", { default: 0 });
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
  const { people } = fixtures(["people"], {
    usesTransaction: ["with lock sets isolation"],
  });

  beforeAll(() => {
    registerModel("Reader", Reader);
  });

  it("typical find with lock", async () => {
    await Person.transaction(async () => {
      const locked = await Person.all().lock().find(people("michael").id);
      expect(locked.first_name).toBe("Michael");
    });
  });

  it.skipIf(adapterType === "postgres")("eager find with lock", async () => {
    await Person.transaction(async () => {
      await Person.includes(":readers").lock().find(people("michael").id);
    });
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
    } catch {}
    const reloaded = await Person.find(person.id);
    expect(reloaded.first_name).toBe(old);
  });

  it("with lock configures transaction", async () => {
    const adapter = Base.connection as any;
    const p = await Person.find(people("michael").id);
    await Person.transaction(async () => {
      const outerTx = adapter.transactionManager.currentTransaction;
      expect(outerTx.joinable).toBe(true);
      await p.withLock({ requiresNew: true, joinable: false }, async () => {
        const innerTx = adapter.transactionManager.currentTransaction;
        expect(innerTx).not.toBe(outerTx);
        expect(innerTx.joinable).toBe(false);
      });
    });
  });

  it.skipIf(adapterType !== "postgres")("lock sending custom lock statement", async () => {
    await Person.transaction(async () => {
      const person = await Person.find(people("michael").id);
      await assertQueriesMatch(/LIMIT \$?\d FOR SHARE NOWAIT/, undefined, false, async () => {
        await person.lockBang("FOR SHARE NOWAIT");
      });
    });
  });

  it.skipIf(adapterType !== "postgres")("with lock sets isolation", async () => {
    const adapter = Base.connection as any;
    const person = await Person.find(people("michael").id);
    await person.withLock({ isolation: ":read_uncommitted" }, async () => {
      const currentTransaction = adapter.transactionManager.currentTransaction;
      expect(currentTransaction.isolationLevel).toBe(":read_uncommitted");
    });
  });

  it.skipIf(adapterType !== "postgres")("with lock locks with no args", async () => {
    const p = await Person.find(people("michael").id);
    await p.withLock(async () => {
      expect(p.first_name).toBe("Michael");
    });
  });

  // PERMANENT-SKIP: thread-based concurrency. Rails' `duel` spawns two
  it.skip("no locks no wait", () => {});
});
