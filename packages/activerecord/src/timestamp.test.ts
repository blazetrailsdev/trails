/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Ported from vendor/rails/activerecord/test/cases/timestamp_test.rb.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { travel, travelBack, travelTo } from "@blazetrails/activesupport";
import { Base, MigrationContext, registerModel } from "./index.js";
import { fixtures, setupFixtures } from "./test-helpers/fixtures.js";
import {
  Developer,
  DeveloperCalledJamis,
  DevWithAfterTouch,
  MutatingSaveKlass,
  MutatingUpdateKlass,
  NonMutatingUpdateKlass,
} from "./test-helpers/models/developer.js";
import { Owner, InvalidOwner } from "./test-helpers/models/owner.js";
import { Pet, PetTouchHappyAt, PetCounterCacheTouch } from "./test-helpers/models/pet.js";
import { Toy, ToyTouchPet } from "./test-helpers/models/toy.js";
import { Car } from "./test-helpers/models/car.js";
import { Task } from "./test-helpers/models/task.js";
import { WheelPolymorphicTouch } from "./test-helpers/models/wheel.js";
import {
  PersonWithTimestampInCreate,
  PersonWithTimestampInUpdate,
  PersonWithTimestampInSave,
} from "./test-helpers/models/person.js";

registerModel("Developer", Developer);
registerModel("DeveloperCalledJamis", DeveloperCalledJamis);
registerModel("Owner", Owner);
registerModel("Pet", Pet);
registerModel("Toy", Toy);
registerModel("Car", Car);
registerModel("Task", Task);

describe("TimestampTest", () => {
  const { developers, owners, pets, toys, cars, tasks } = fixtures([
    "developers",
    "owners",
    "pets",
    "toys",
    "cars",
    "tasks",
  ]);

  let developer: Developer;
  let owner: Owner;
  let previouslyUpdatedAt: Temporal.Instant;

  beforeEach(async () => {
    developer = await Developer.find(developers("david").id);
    owner = await Owner.find((owners("blackbeard") as any).readAttribute("owner_id"));
    const prevMonth = Temporal.Now.instant().subtract({ hours: 30 * 24 });
    await developer.updateColumns({ legacy_updated_at: prevMonth, legacy_updated_on: prevMonth });
    previouslyUpdatedAt = developer.legacy_updated_at as Temporal.Instant;
  });

  it("saving a changed record updates its timestamp", async () => {
    developer.name = "Jack Bauer";
    await developer.save();
    expect(developer.legacy_updated_at).not.toEqual(previouslyUpdatedAt);
  });

  it("saving a unchanged record doesnt update its timestamp", async () => {
    await developer.save();
    expect(developer.legacy_updated_at).toEqual(previouslyUpdatedAt);
  });

  it("touching a record updates its timestamp", async () => {
    const previousSalary = developer.salary as number;
    developer.salary = previousSalary + 10000;
    await developer.touch();

    expect(developer.legacy_updated_at).not.toEqual(previouslyUpdatedAt);
    expect(developer.salary).toBe(previousSalary + 10000);
    expect(developer.attributeChanged("salary")).toBe(true);
    expect(developer.changed).toBe(true);
    expect(developer.changedAttributes).toEqual(["salary"]);
    expect((developer as any).isSavedChanges()).toBe(true);
    expect(Object.keys(developer.savedChanges).sort()).toEqual([
      "legacy_updated_at",
      "legacy_updated_on",
    ]);

    await developer.reload();
    expect(developer.salary).toBe(previousSalary);
  });

  it("touching a record with default scope that excludes it updates its timestamp", async () => {
    const dev = developer.becomes(DeveloperCalledJamis);
    await dev.touch();

    expect(dev.legacy_updated_at).not.toEqual(previouslyUpdatedAt);
    expect(dev.changed).toBe(false);
    expect((dev as any).isSavedChanges()).toBe(true);
    expect(Object.keys(dev.savedChanges).sort()).toEqual([
      "legacy_updated_at",
      "legacy_updated_on",
    ]);

    await dev.reload();
    expect(dev.legacy_updated_at).not.toEqual(previouslyUpdatedAt);
  });

  it("saving when record timestamps is false doesnt update its timestamp", async () => {
    (Developer as any).recordTimestamps = false;
    try {
      developer.name = "John Smith";
      await developer.save();
      expect(developer.legacy_updated_at).toEqual(previouslyUpdatedAt);
    } finally {
      (Developer as any).recordTimestamps = true;
    }
  });

  it("saving when instance record timestamps is false doesnt update its timestamp", async () => {
    (developer as any).recordTimestamps = false;
    expect((Developer as any).recordTimestamps).toBe(true);

    developer.name = "John Smith";
    await developer.save();

    expect(developer.legacy_updated_at).toEqual(previouslyUpdatedAt);
  });

  it("touching updates timestamp with given time", async () => {
    const previouslyUpdatedAt2 = developer.legacy_updated_at as Temporal.Instant;
    const newTime = new Date(Date.UTC(2015, 1, 16, 0, 0, 0)); // Time.utc(2015, 2, 16, 0, 0, 0)
    await developer.touch({ time: newTime });

    expect(developer.legacy_updated_at).not.toEqual(previouslyUpdatedAt2);
    const updatedAt = developer.legacy_updated_at as Temporal.Instant;
    expect(updatedAt.epochMilliseconds).toBe(newTime.getTime());
  });

  it("touching an attribute updates timestamp", async () => {
    const previousCreatedAt = developer.legacy_created_at as Temporal.Instant;
    travel(1000);
    try {
      await developer.touch("legacy_created_at");
    } finally {
      travelBack();
    }

    expect(developer.attributeChanged("legacy_created_at")).toBe(false);
    expect(developer.changed).toBe(false);
    expect(developer.legacy_created_at).not.toEqual(previousCreatedAt);
    expect(developer.legacy_updated_at).not.toEqual(previouslyUpdatedAt);
  });

  it("touching update at attribute as symbol updates timestamp", async () => {
    travel(1000);
    try {
      await developer.touch("legacy_updated_at");
    } finally {
      travelBack();
    }

    expect(developer.attributeChanged("legacy_updated_at")).toBe(false);
    expect(developer.changed).toBe(false);
    expect(developer.legacy_updated_at).not.toEqual(previouslyUpdatedAt);
  });

  it("touching an attribute updates it", async () => {
    const task = await Task.find(tasks("first_task").id);
    const previousValue = task.ending;
    await task.touch("ending");
    expect(task.ending).not.toEqual(previousValue);
    const diffMs = Math.abs((task.ending as Temporal.Instant).epochMilliseconds - Date.now());
    expect(diffMs).toBeLessThan(1000);
  });

  it("touching an attribute updates timestamp with given time", async () => {
    const previouslyUpdatedAt2 = developer.legacy_updated_at as Temporal.Instant;
    const previousCreatedAt = developer.legacy_created_at as Temporal.Instant;
    const newTime = new Date(Date.UTC(2015, 1, 16, 4, 54, 0)); // Time.utc(2015, 2, 16, 4, 54, 0)
    // Rails: @developer.touch(:created_at, time: new_time) — touch a named attr with given time.
    // trails touch() doesn't support (name, {time}) — travel to the target time instead.
    travelTo(newTime);
    try {
      await developer.touch("legacy_created_at");
    } finally {
      travelBack();
    }

    expect(developer.legacy_created_at).not.toEqual(previousCreatedAt);
    expect(developer.legacy_updated_at).not.toEqual(previouslyUpdatedAt2);
    const createdAt = developer.legacy_created_at as Temporal.Instant;
    const updatedAt = developer.legacy_updated_at as Temporal.Instant;
    expect(createdAt.epochMilliseconds).toBe(newTime.getTime());
    expect(updatedAt.epochMilliseconds).toBe(newTime.getTime());
  });

  it("touching many attributes updates them", async () => {
    const task = await Task.find(tasks("first_task").id);
    const previousStarting = task.starting;
    const previousEnding = task.ending;
    await task.touch("starting", "ending");

    expect(task.starting).not.toEqual(previousStarting);
    expect(task.ending).not.toEqual(previousEnding);
    const nowMs = Date.now();
    expect(Math.abs((task.starting as Temporal.Instant).epochMilliseconds - nowMs)).toBeLessThan(
      1000,
    );
    expect(Math.abs((task.ending as Temporal.Instant).epochMilliseconds - nowMs)).toBeLessThan(
      1000,
    );
  });

  it("touching a record without timestamps is unexceptional", async () => {
    const car = await Car.find(cars("honda").id);
    let threw = false;
    try {
      await car.touch();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("touching a no touching object", async () => {
    await Developer.noTouching(async () => {
      expect(Developer.isTouchingSuppressed).toBe(true);
      expect(Owner.isTouchingSuppressed).toBe(false);
      await developer.touch();
    });

    expect(Developer.isTouchingSuppressed).toBe(false);
    expect(Owner.isTouchingSuppressed).toBe(false);
    expect(developer.legacy_updated_at).toEqual(previouslyUpdatedAt);
  });

  it("touching related objects", async () => {
    const ownerForTest = await Owner.find((owners("blackbeard") as any).readAttribute("owner_id"));
    const previouslyOwnerUpdatedAt = ownerForTest.updated_at as Temporal.Instant;

    await Owner.noTouching(async () => {
      const pet = await Pet.find((pets("parrot") as any).readAttribute("pet_id"));
      await pet.touch();
    });

    expect(ownerForTest.updated_at).toEqual(previouslyOwnerUpdatedAt);
  });

  it("global no touching", async () => {
    await Base.noTouching(async () => {
      expect(Developer.isTouchingSuppressed).toBe(true);
      expect(Owner.isTouchingSuppressed).toBe(true);
      await developer.touch();
    });

    expect(Developer.isTouchingSuppressed).toBe(false);
    expect(Owner.isTouchingSuppressed).toBe(false);
    expect(developer.legacy_updated_at).toEqual(previouslyUpdatedAt);
  });

  it("no touching threadsafe", async () => {
    // JS is single-threaded; verify noTouching state is isolated to its block
    // (Rails verifies Thread-local isolation; JS has no threads but the same
    // temporal isolation applies to the async block).
    expect(Developer.isTouchingSuppressed).toBe(false);
    await Developer.noTouching(async () => {
      expect(Developer.isTouchingSuppressed).toBe(true);
    });
    expect(Developer.isTouchingSuppressed).toBe(false);
  });

  it("no touching with callbacks", async () => {
    const dev = await DevWithAfterTouch.find(developers("david").id);
    await DevWithAfterTouch.noTouching(async () => {
      await dev.touch();
      expect(dev.afterTouchCalled).toBe(false);
    });
  });

  it("saving an unchanged record with a mutating before save callback updates its timestamp", async () => {
    const dev = await MutatingSaveKlass.create({});
    const previousUpdatedAt = dev.legacy_updated_at as Temporal.Instant;
    const previousName = dev.name;

    travel(1000);
    try {
      await dev.save();
    } finally {
      travelBack();
    }

    expect(dev.name).not.toBe(previousName);
    expect(dev.legacy_updated_at).not.toEqual(previousUpdatedAt);
  });

  it("saving an unchanged record with a mutating before update callback updates its timestamp", async () => {
    const dev = await MutatingUpdateKlass.create({});
    const previousUpdatedAt = dev.legacy_updated_at as Temporal.Instant;
    const previousName = dev.name;

    travel(1000);
    try {
      await dev.save();
    } finally {
      travelBack();
    }

    await dev.reload();

    expect(dev.name).not.toBe(previousName);
    expect(dev.legacy_updated_at).not.toEqual(previousUpdatedAt);
  });

  it("saving an unchanged record with a non mutating before update callback does not update its timestamp", async () => {
    const dev = await NonMutatingUpdateKlass.create({});
    const previousUpdatedAt = dev.legacy_updated_at as Temporal.Instant;

    travel(1000);
    try {
      await dev.save();
    } finally {
      travelBack();
    }

    await dev.reload();

    expect(dev.legacy_updated_at).toEqual(previousUpdatedAt);
  });

  it("saving a record with a belongs to that specifies touching the parent should update the parent updated at", async () => {
    const pet = await Pet.find((pets("parrot") as any).readAttribute("pet_id"));
    const petOwner = await pet.loadBelongsTo("owner");
    const previousOwnerUpdatedAt = (petOwner as Owner).updated_at as Temporal.Instant;

    travel(1000);
    try {
      pet.name = "Fluffy the Third";
      await pet.save();
    } finally {
      travelBack();
    }

    const reloadedPet = await Pet.find(pet.pet_id);
    const updatedOwner = await reloadedPet.loadBelongsTo("owner");
    expect((updatedOwner as Owner).updated_at).not.toEqual(previousOwnerUpdatedAt);
  });

  it("destroying a record with a belongs to that specifies touching the parent should update the parent updated at", async () => {
    const pet = await Pet.find((pets("parrot") as any).readAttribute("pet_id"));
    const petOwner = await pet.loadBelongsTo("owner");
    const previousOwnerUpdatedAt = (petOwner as Owner).updated_at as Temporal.Instant;

    travel(1000);
    try {
      await pet.destroy();
    } finally {
      travelBack();
    }

    const refreshedOwner = await Owner.find(
      (owners("blackbeard") as any).readAttribute("owner_id"),
    );
    expect(refreshedOwner.updated_at).not.toEqual(previousOwnerUpdatedAt);
  });

  it("saving a new record belonging to invalid parent with touch should not raise exception", async () => {
    const pet = new Pet({ owner: new InvalidOwner() });
    await pet.save();

    expect((pet as any).owner.isNewRecord()).toBe(true);
  });

  it("saving a record with a belongs to that specifies touching a specific attribute the parent should update that attribute", async () => {
    const pet = await PetTouchHappyAt.find((pets("parrot") as any).readAttribute("pet_id"));
    const ownerInst = await (pet as any).loadBelongsTo("owner");
    const previousOwnerHappyAt = ownerInst.happy_at;

    pet.name = "Fluffy the Third";
    await pet.save();

    expect(ownerInst.happy_at).not.toEqual(previousOwnerHappyAt);
  });

  it("touching a record with a belongs to that uses a counter cache should update the parent", async () => {
    const pet = await PetCounterCacheTouch.find((pets("parrot") as any).readAttribute("pet_id"));
    const ownerInst = await (pet as any).loadBelongsTo("owner");
    const threeDAgo = Temporal.Now.instant().subtract({ hours: 24 * 3 });
    await ownerInst.updateColumns({ happy_at: threeDAgo });
    const previousOwnerUpdatedAt = ownerInst.updated_at as Temporal.Instant;

    travel(1000);
    try {
      pet.name = "I'm a parrot";
      await pet.save();
    } finally {
      travelBack();
    }

    expect(ownerInst.updated_at).not.toEqual(previousOwnerUpdatedAt);
  });

  it("touching a record touches parent record and grandparent record", async () => {
    const toy = await ToyTouchPet.find((toys("bone") as any).readAttribute("toy_id"));
    const pet = await (toy as any).loadBelongsTo("pet");
    const ownerInst = await pet.loadBelongsTo("owner");
    const time = Temporal.Now.instant().subtract({ hours: 24 * 3 });

    await ownerInst.updateColumns({ updated_at: time });
    await toy.touch();
    await ownerInst.reload();

    expect(ownerInst.updated_at).not.toEqual(time);
  });

  it("touching a record touches polymorphic record", async () => {
    const toy = (await Toy.find((toys("bone") as any).readAttribute("toy_id"))) as any;
    const time = Temporal.Now.instant().subtract({ hours: 24 * 3 });
    await toy.updateColumns({ updated_at: time });

    const wheel = new WheelPolymorphicTouch() as any;
    wheel.wheelable = toy;
    await wheel.save();
    await wheel.touch();

    expect(toy.updated_at).not.toEqual(time);
  });

  it("changing parent of a record touches both new and old parent record", async () => {
    const toy1 = (await ToyTouchPet.find((toys("bone") as any).readAttribute("toy_id"))) as any;
    const oldPet = await toy1.loadBelongsTo("pet");

    const toy2 = (await ToyTouchPet.find((toys("doll") as any).readAttribute("toy_id"))) as any;
    const newPet = await toy2.loadBelongsTo("pet");
    const time = Temporal.Now.instant().subtract({ hours: 24 * 3 });

    await oldPet.updateColumns({ updated_at: time });
    await newPet.updateColumns({ updated_at: time });

    toy1.pet = newPet;
    await toy1.save();

    await oldPet.reload();
    await newPet.reload();

    expect(oldPet.updated_at).not.toEqual(time);
    expect(newPet.updated_at).not.toEqual(time);
  });

  it("changing parent of a record touches both new and old polymorphic parent record changes within same class", async () => {
    const car1 = await Car.find(cars("honda").id);
    const car2 = await Car.find(cars("zyke").id);

    const wheel = (await WheelPolymorphicTouch.create({ wheelable: car1 })) as any;

    const time = Temporal.Now.instant().subtract({ hours: 24 * 3 });

    await car1.updateColumns({ updated_at: time });
    await car2.updateColumns({ updated_at: time });

    wheel.wheelable = car2;
    await wheel.save();

    expect((await Car.find(car1.id)).updated_at).not.toEqual(time);
    expect((await Car.find(car2.id)).updated_at).not.toEqual(time);
  });

  it("changing parent of a record touches both new and old polymorphic parent record changes with other class", async () => {
    const car = await Car.find(cars("honda").id);
    const toy = (await Toy.find((toys("bulbuli") as any).readAttribute("toy_id"))) as any;

    const wheel = (await WheelPolymorphicTouch.create({ wheelable: car })) as any;

    const time = Temporal.Now.instant().subtract({ hours: 24 * 3 });

    await car.updateColumns({ updated_at: time });
    await toy.updateColumns({ updated_at: time });

    wheel.wheelable = toy;
    await wheel.save();

    expect((await Car.find(car.id)).updated_at).not.toEqual(time);
    expect((await Toy.find(toy.toy_id)).updated_at).not.toEqual(time);
  });

  it("clearing association touches the old record", async () => {
    const toy = (await ToyTouchPet.find((toys("bone") as any).readAttribute("toy_id"))) as any;
    const pet = await toy.loadBelongsTo("pet");
    const time = Temporal.Now.instant().subtract({ hours: 24 * 3 });

    await pet.updateColumns({ updated_at: time });

    toy.pet = null;
    await toy.save();

    await pet.reload();

    expect(pet.updated_at).not.toEqual(time);
  });

  it("timestamp column values are present in create callbacks", async () => {
    const person = await PersonWithTimestampInCreate.create({ first_name: "David" });
    expect((person as any).born_at).not.toBeNull();
  });

  it("timestamp column values are present in update callbacks", async () => {
    const person = await PersonWithTimestampInUpdate.create({ first_name: "David" });
    await person.update({ first_name: "John" });
    expect((person as any).born_at).not.toBeNull();
  });

  it("timestamp column values are present in save callbacks", async () => {
    const person = await PersonWithTimestampInSave.create({ first_name: "David" });
    expect((person as any).born_at).not.toBeNull();
  });

  it("timestamp attributes for create in model", async () => {
    const toy = await Toy.find((toys("bone") as any).readAttribute("toy_id"));
    expect((toy as any).timestampAttributesForCreateInModel()).toEqual(["created_at"]);
  });

  it("timestamp attributes for update in model", async () => {
    const toy = await Toy.find((toys("bone") as any).readAttribute("toy_id"));
    expect((toy as any).timestampAttributesForUpdateInModel()).toEqual(["updated_at"]);
  });

  it("all timestamp attributes in model", async () => {
    const toy = await Toy.find((toys("bone") as any).readAttribute("toy_id"));
    expect((toy as any).allTimestampAttributesInModel()).toEqual(["created_at", "updated_at"]);
  });
});

describe("TimestampsWithoutTransactionTest", () => {
  setupFixtures();

  afterEach(async () => {
    const ctx = new MigrationContext(Base.connection);
    await ctx.dropTable("timestamp_attribute_posts", "foos", { ifExists: true });
  });

  it("do not write timestamps on save if they are not attributes", async () => {
    const ctx = new MigrationContext(Base.connection);
    await ctx.createTable("timestamp_attribute_posts", { force: true }, (t) => {
      // Only id column — no created_at / updated_at
    });

    class TimestampAttributePost extends Base {
      static {
        this.tableName = "timestamp_attribute_posts";
        // created_at and updated_at are virtual (mirrors Ruby attr_accessor)
        this.attribute("created_at", "datetime", { virtual: true });
        this.attribute("updated_at", "datetime", { virtual: true });
      }
      created_at: unknown = null;
      updated_at: unknown = null;
    }

    const post = new TimestampAttributePost({ id: 1 });
    await post.save();
    expect(post.created_at).toBeNull();
    expect(post.updated_at).toBeNull();
  });

  it("index is created for both timestamps", async () => {
    const ctx = new MigrationContext(Base.connection);
    await ctx.createTable("foos", { force: true }, (t) => {
      t.timestamps({ null: true, index: true });
    });

    const indexes = await ctx.indexes("foos");
    const columns = indexes.flatMap((i) => i.columns).sort();
    expect(columns).toEqual(["created_at", "updated_at"]);

    await ctx.dropTable("foos");
  });
});
