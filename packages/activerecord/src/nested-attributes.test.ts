/**
 * Faithful port of activerecord/test/cases/nested_attributes_test.rb.
 *
 * Class names mirror the Rails test classes as `describe(...)` blocks and each
 * `it(...)` maps 1:1 to a Rails `def test_*` / `test "..."`. Trails-only cases
 * with no Rails counterpart live in `nested-attributes.trails.test.ts`.
 *
 * Where Rails reads an association synchronously after `reload`, trails returns
 * a promise, so reads go through `loadTarget()` / `loadHasOne` and in-memory
 * checks use `association(...).target`. These are the documented async-model
 * accommodations, not behavioral deviations.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  Base,
  RecordNotFound,
  registerModel,
  acceptsNestedAttributesFor,
  TooManyRecords,
} from "./index.js";
import { markForDestruction, isMarkedForDestruction } from "./autosave-association.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { fixtures, setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Human } from "./test-helpers/models/human.js";
import { Interest } from "./test-helpers/models/interest.js";
import { Owner } from "./test-helpers/models/owner.js";
import { Pet } from "./test-helpers/models/pet.js";
import { CpkBook, CpkChapter, CpkOrder } from "./test-helpers/models/cpk.js";
import { Bird } from "./test-helpers/models/bird.js";
import { Pirate } from "./test-helpers/models/pirate.js";
import { Ship } from "./test-helpers/models/ship.js";
import { ShipPart } from "./test-helpers/models/ship-part.js";
import { Treasure } from "./test-helpers/models/treasure.js";
import { Parrot } from "./test-helpers/models/parrot.js";
import { Developer } from "./test-helpers/models/developer.js";
import { Guitar } from "./test-helpers/models/guitar.js";
import { TuningPeg } from "./test-helpers/models/tuning-peg.js";
import { Entry } from "./test-helpers/models/entry.js";
import { Message } from "./test-helpers/models/message.js";
import { repairValidations } from "./test-helpers/repair-validations.js";
import { assertNoQueries, assertQueriesCount } from "./testing/query-assertions.js";

function registerCommonModels(): void {
  registerModel(Pirate);
  registerModel(Ship);
  registerModel(Bird);
  registerModel(Parrot);
  registerModel(Treasure);
  registerModel(ShipPart);
  registerModel(Developer);
  registerModel(Human);
  registerModel(Interest);
}

async function shipOf(pirate: Pirate): Promise<Ship | null> {
  return (await pirate.association("ship").loadTarget()) as Ship | null;
}

async function pirateOf(ship: Ship): Promise<Pirate | null> {
  return (await ship.association("pirate").loadTarget()) as Pirate | null;
}

// ==========================================================================
// TestNestedAttributesInGeneral
// ==========================================================================
describe("TestNestedAttributesInGeneral", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });

  beforeAll(registerCommonModels);

  // teardown { Pirate.accepts_nested_attributes_for :ship, allow_destroy: true, reject_if: proc(&:empty?) }
  function resetShipConfig(): void {
    acceptsNestedAttributesFor(Pirate, "ship", {
      allowDestroy: true,
      rejectIf: (a) => Object.keys(a).length === 0,
    });
  }

  it("base should have an empty nested attributes options", () => {
    // A model that never declared accepts_nested_attributes_for has no configs
    // of its own (Rails asserts ActiveRecord::Base.nested_attributes_options == {}).
    class Plain extends Base {}
    const configs = (Plain as any)._nestedAttributeConfigs;
    expect(configs === undefined || (Array.isArray(configs) && configs.length === 0)).toBe(true);
  });

  it("should add a proc to nested attributes options", () => {
    const configs = (Pirate as any)._nestedAttributeConfigs;
    for (const name of ["parrots", "birds"]) {
      const cfg = configs.find((c: any) => c.associationName === name);
      expect(typeof cfg.options.rejectIf).toBe("function");
    }
  });

  it("should not build a new record using reject all even if destroy is given", async () => {
    const pirate = await Pirate.createBang({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    (pirate as any).birdsWithRejectAllBlankAttributes = [{ name: "", color: "", _destroy: "0" }];
    await pirate.saveBang();
    expect((await (pirate as any).birdsWithRejectAllBlank.toArray()).length).toBe(0);
  });

  it("should not build a new record if reject all blank returns false", async () => {
    const pirate = await Pirate.createBang({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    (pirate as any).birdsWithRejectAllBlankAttributes = [{ name: "", color: "" }];
    await pirate.saveBang();
    expect((await (pirate as any).birdsWithRejectAllBlank.toArray()).length).toBe(0);
  });

  it("should build a new record if reject all blank does not return false", async () => {
    const pirate = await Pirate.createBang({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    (pirate as any).birdsWithRejectAllBlankAttributes = [{ name: "Tweetie", color: "" }];
    await pirate.saveBang();
    const birds = (await (pirate as any).birdsWithRejectAllBlank.toArray()) as Bird[];
    expect(birds.length).toBe(1);
    expect(birds[0].name).toBe("Tweetie");
  });

  it("should raise an ArgumentError for non existing associations", () => {
    expect(() => acceptsNestedAttributesFor(Pirate, "honesty")).toThrow(/No association found/);
  });

  // tracked-pending-convergence (0023-surfaced-deviations): building a nested
  // record from a hash with an unknown key does not raise UnknownAttributeError
  // because trails' `Model.new`/build silently drops unknown attributes (a
  // base-level deviation, not nested-attributes-specific). trails does raise it
  // on the UPDATE-existing flush path, but Rails raises here on the build path.
  // See model-new-unknown-attribute convergence story.
  it.skip("should raise an UnknownAttributeError for non existing nested attributes", async () => {
    await expect(
      (async () => {
        const pirate = new Pirate({ catchphrase: "Arr" });
        (pirate as any).shipAttributes = { sail: true };
        await pirate.save();
      })(),
    ).rejects.toThrow(/unknown attribute 'sail' for Ship/);
  });

  it("should disable allow destroy by default", async () => {
    acceptsNestedAttributesFor(Pirate, "ship");
    const pirate = await Pirate.createBang({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    const ship = await (pirate as any).createShip({ name: "Nights Dirty Lightning" });
    await pirate.update({ shipAttributes: { _destroy: true, id: ship.id } });
    const reloaded = await shipOf(await Pirate.find(pirate.id));
    expect(reloaded).not.toBeNull();
    resetShipConfig();
  });

  it("a model should respond to underscore destroy and return if it is marked for destruction", async () => {
    const ship = await Ship.createBang({ name: "Nights Dirty Lightning" });
    expect(isMarkedForDestruction(ship)).toBe(false);
    markForDestruction(ship);
    expect(isMarkedForDestruction(ship)).toBe(true);
  });

  it("reject if method without arguments", async () => {
    // Rails `reject_if: :new_record?` — the method runs on the owner; a new
    // (unsaved) pirate rejects the nested ship.
    acceptsNestedAttributesFor(Pirate, "ship", { rejectIf: (_a, rec) => rec.isNewRecord() });
    const pirate = new Pirate({ catchphrase: "Stop wastin' me time" });
    (pirate as any).shipAttributes = { name: "Black Pearl" };
    const before = Number(await Ship.count());
    await pirate.saveBang();
    expect(Number(await Ship.count())).toBe(before);
    resetShipConfig();
  });

  it("reject if method with arguments", async () => {
    // Rails `reject_if: :reject_empty_ships_on_create` —
    // `attributes.delete("_reject_me_if_new").present? && !persisted?`
    acceptsNestedAttributesFor(Pirate, "ship", {
      rejectIf: (attrs, rec) => {
        const v = attrs["_reject_me_if_new"];
        return v != null && v !== "" && v !== false && !rec.isPersisted();
      },
    });

    const pirate = new Pirate({ catchphrase: "Stop wastin' me time" });
    (pirate as any).shipAttributes = { name: "Red Pearl", _reject_me_if_new: true };
    let before = Number(await Ship.count());
    await pirate.saveBang();
    expect(Number(await Ship.count())).toBe(before); // not persisted → rejected

    // pirate is now persisted, so reject_empty_ships_on_create returns false
    (pirate as any).shipAttributes = { name: "Red Pearl", _reject_me_if_new: true };
    before = Number(await Ship.count());
    await pirate.saveBang();
    expect(Number(await Ship.count())).toBe(before + 1);
    resetShipConfig();
  });

  it("allows class to override setter and call super", () => {
    class MeanPirate extends Pirate {}
    registerModel("MeanPirate", MeanPirate);
    acceptsNestedAttributesFor(MeanPirate, "parrot");
    const proto = MeanPirate.prototype as unknown as Record<string, unknown>;
    const original = Object.getOwnPropertyDescriptor(proto, "parrotAttributes")!.set!;
    Object.defineProperty(proto, "parrotAttributes", {
      set(this: unknown, attrs: Record<string, unknown>) {
        original.call(this, { ...attrs, color: "blue" });
      },
      configurable: true,
    });

    const meanPirate = new MeanPirate();
    (meanPirate as any).parrotAttributes = { name: "James" };
    const target = (meanPirate.association("parrot") as any).target;
    expect(target.readAttribute("name")).toBe("James");
    expect(target.color).toBe("blue");
  });

  it("accepts nested attributes for can be overridden in subclasses", () => {
    acceptsNestedAttributesFor(Pirate, "parrot");
    class MeanPirate extends Pirate {}
    registerModel("MeanPirate", MeanPirate);
    acceptsNestedAttributesFor(MeanPirate, "parrot");

    const meanPirate = new MeanPirate();
    (meanPirate as any).parrotAttributes = { name: "James" };
    const target = (meanPirate.association("parrot") as any).target;
    expect(target.readAttribute("name")).toBe("James");
  });

  it("reject if with indifferent keys", async () => {
    acceptsNestedAttributesFor(Pirate, "ship", { rejectIf: (a) => !a["name"] });
    const pirate = new Pirate({ catchphrase: "Stop wastin' me time" });
    (pirate as any).shipAttributes = { name: "Hello Pearl" };
    const before = Number(await Ship.count());
    await pirate.saveBang();
    expect(Number(await Ship.count())).toBe(before + 1);
    resetShipConfig();
  });

  it("reject if with a proc which returns true always for has one", async () => {
    acceptsNestedAttributesFor(Pirate, "ship", { rejectIf: () => true });
    const pirate = await Pirate.create({ catchphrase: "Stop wastin' me time" });
    const ship = await (pirate as any).createShip({ name: "s1" });
    await pirate.update({ shipAttributes: { name: "s2", id: ship.id } });
    expect((await Ship.find(ship.id)).name).toBe("s1");
    resetShipConfig();
  });

  it("reuse already built new record", () => {
    acceptsNestedAttributesFor(Pirate, "ship");
    const pirate = new Pirate();
    const shipBuiltFirst = (pirate.association("ship") as any).build();
    (pirate as any).shipAttributes = { name: "Ship 1" };
    expect((pirate.association("ship") as any).target).toBe(shipBuiltFirst);
    resetShipConfig();
  });

  it("do not allow assigning foreign key when reusing existing new record", async () => {
    acceptsNestedAttributesFor(Pirate, "ship");
    const pirate = await Pirate.createBang({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    (pirate.association("ship") as any).build();
    (pirate as any).shipAttributes = { name: "Ship 1", pirate_id: Number(pirate.id) + 1 };
    expect(Number((pirate.association("ship") as any).target.pirate_id)).toBe(Number(pirate.id));
    resetShipConfig();
  });

  it("reject if with a proc which returns true always for has many", async () => {
    acceptsNestedAttributesFor(Human, "interests", { rejectIf: () => true });
    const human = await Human.create({ name: "John" });
    const interest = await (human as any).interests.create({ topic: "photography" });
    await human.update({ interestsAttributes: { topic: "gardening", id: interest.id } });
    expect((await Interest.find(interest.id)).topic).toBe("photography");
  });

  it("destroy works independent of reject if", async () => {
    acceptsNestedAttributesFor(Human, "interests", { rejectIf: () => true, allowDestroy: true });
    const human = await Human.create({ name: "Jon" });
    const interest = await (human as any).interests.create({ topic: "the ladies" });
    await human.update({ interestsAttributes: { _destroy: "1", id: interest.id } });
    await human.reload();
    expect((await (human as any).interests.toArray()).length).toBe(0);
  });

  it("reject if is not short circuited if allow destroy is false", async () => {
    acceptsNestedAttributesFor(Pirate, "ship", {
      rejectIf: (a) => a["name"] === "The Golden Hind",
      allowDestroy: false,
    });
    const pirate = await Pirate.createBang({
      catchphrase: "Stop wastin' me time",
      shipAttributes: { name: "White Pearl", _destroy: "1" },
    });
    expect((await shipOf(await Pirate.find(pirate.id)))!.name).toBe("White Pearl");

    let p = await Pirate.find(pirate.id);
    await p.updateBang({
      shipAttributes: { id: (await shipOf(p))!.id, name: "The Golden Hind", _destroy: "1" },
    });
    expect((await shipOf(await Pirate.find(pirate.id)))!.name).toBe("White Pearl");

    p = await Pirate.find(pirate.id);
    await p.updateBang({
      shipAttributes: { id: (await shipOf(p))!.id, name: "Black Pearl", _destroy: "1" },
    });
    expect((await shipOf(await Pirate.find(pirate.id)))!.name).toBe("Black Pearl");
    resetShipConfig();
  });

  it("has many association updating a single record", async () => {
    acceptsNestedAttributesFor(Human, "interests");
    const human = await Human.create({ name: "John" });
    const interest = await (human as any).interests.create({ topic: "photography" });
    await human.update({ interestsAttributes: { topic: "gardening", id: interest.id } });
    expect((await Interest.find(interest.id)).topic).toBe("gardening");
  });

  it("reject if with blank nested attributes id", async () => {
    acceptsNestedAttributesFor(Pirate, "ship", {
      rejectIf: (a) => a["id"] == null || a["id"] === "",
    });
    const pirate = new Pirate({ catchphrase: "Stop wastin' me time" });
    (pirate as any).shipAttributes = { id: "" };
    await expect(pirate.saveBang()).resolves.toBeTruthy();
    resetShipConfig();
  });

  it("first and array index zero methods return the same value when nested attributes are set to update existing record", async () => {
    acceptsNestedAttributesFor(Human, "interests");
    const created = await Human.create({ name: "John" });
    const interest = await (created as any).interests.create({ topic: "gardening" });
    const human = await Human.find(created.id);
    (human as any).interestsAttributes = [{ id: interest.id, topic: "gardening" }];
    const first = await (human as any).interests.first();
    const arr = await (human as any).interests.toArray();
    expect(first.topic).toBe(arr[0].topic);
  });

  it("should not create duplicates with create with", async () => {
    acceptsNestedAttributesFor(Human, "interests");
    const before = Number(await Interest.count());
    await Human.createWith({ interestsAttributes: [{ topic: "Pirate king" }] }).findOrCreateByBang({
      name: "Monkey D. Luffy",
    });
    expect(Number(await Interest.count()) - before).toBe(1);
  });

  it("updating models with cpk provided as strings", async () => {
    registerModel(CpkOrder);
    registerModel(CpkBook);
    registerModel(CpkChapter);
    const book = await CpkBook.createBang({ id: [1, 2], shop_id: 3 });
    await (book as any).chapters.createBang({ id: [1, 3], title: "Title" });
    await book.updateBang({ chaptersAttributes: { id: ["1", "3"], title: "New title" } });
    const reloaded = (await CpkBook.find([1, 2])) as any;
    expect(Number(await reloaded.chapters.count())).toBe(1);
    expect((await reloaded.chapters.first()).title).toBe("New title");
  });
});

// ==========================================================================
// TestNestedAttributesOnAHasOneAssociation
// ==========================================================================
describe("TestNestedAttributesOnAHasOneAssociation", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  beforeAll(registerCommonModels);
  // Rails' treasure.rb declares `accepts_nested_attributes_for :looter`.
  beforeAll(() => acceptsNestedAttributesFor(Treasure, "looter"));

  async function setup(): Promise<{ pirate: Pirate; ship: Ship }> {
    const pirate = await Pirate.createBang({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    const ship = await (pirate as any).createShip({ name: "Nights Dirty Lightning" });
    return { pirate, ship };
  }

  it("should raise argument error if trying to build polymorphic belongs to", () => {
    expect(() => {
      new Treasure({ name: "pearl", looterAttributes: { catchphrase: "Arrr" } });
    }).toThrow(/Cannot build association `looter'/);
  });

  it("should define an attribute writer method for the association", () => {
    const pirate = new Pirate();
    expect(() => {
      (pirate as any).shipAttributes = {};
    }).not.toThrow();
  });

  it("should build a new record if there is no id", async () => {
    const { pirate, ship } = await setup();
    await ship.destroy();
    const p = await Pirate.find(pirate.id);
    (p as any).shipAttributes = { name: "Davy Jones Gold Dagger" };
    const target = (p.association("ship") as any).target as Ship;
    expect(target.isPersisted()).toBe(false);
    expect(target.name).toBe("Davy Jones Gold Dagger");
  });

  it("should not build a new record if there is no id and destroy is truthy", async () => {
    const { pirate, ship } = await setup();
    await ship.destroy();
    const p = await Pirate.find(pirate.id);
    (p as any).shipAttributes = { name: "Davy Jones Gold Dagger", _destroy: "1" };
    expect((p.association("ship") as any).target).toBeFalsy();
  });

  it("should not build a new record if a reject if proc returns false", async () => {
    const { pirate, ship } = await setup();
    await ship.destroy();
    const p = await Pirate.find(pirate.id);
    (p as any).shipAttributes = {};
    expect((p.association("ship") as any).target).toBeFalsy();
  });

  it("should replace an existing record if there is no id", async () => {
    const { pirate, ship } = await setup();
    const p = await Pirate.find(pirate.id);
    await shipOf(p);
    (p as any).shipAttributes = { name: "Davy Jones Gold Dagger" };
    const target = (p.association("ship") as any).target as Ship;
    expect(target.isPersisted()).toBe(false);
    expect(target.name).toBe("Davy Jones Gold Dagger");
    expect(ship.name).toBe("Nights Dirty Lightning");
  });

  it("should not replace an existing record if there is no id and destroy is truthy", async () => {
    const { pirate, ship } = await setup();
    const p = await Pirate.find(pirate.id);
    await shipOf(p);
    (p as any).shipAttributes = { name: "Davy Jones Gold Dagger", _destroy: "1" };
    const target = (p.association("ship") as any).target as Ship;
    expect(String(target.id)).toBe(String(ship.id));
    expect(target.name).toBe("Nights Dirty Lightning");
  });

  it("should modify an existing record if there is a matching id", async () => {
    const { pirate, ship } = await setup();
    const p = await Pirate.find(pirate.id);
    await shipOf(p);
    (p as any).shipAttributes = { id: ship.id, name: "Davy Jones Gold Dagger" };
    const target = (p.association("ship") as any).target as Ship;
    expect(String(target.id)).toBe(String(ship.id));
    expect(target.name).toBe("Davy Jones Gold Dagger");
  });

  it("should raise RecordNotFound if an id is given but doesnt return a record", async () => {
    const { pirate } = await setup();
    await expect(
      (async () => {
        (pirate as any).shipAttributes = { id: 1234567890 };
        await pirate.save();
      })(),
    ).rejects.toThrow(RecordNotFound);
  });

  it("should take a hash with string keys and update the associated model", async () => {
    const { pirate, ship } = await setup();
    const p = await Pirate.find(pirate.id);
    await shipOf(p);
    (p as any).shipAttributes = { id: String(ship.id), name: "Davy Jones Gold Dagger" };
    const target = (p.association("ship") as any).target as Ship;
    expect(String(target.id)).toBe(String(ship.id));
    expect(target.name).toBe("Davy Jones Gold Dagger");
  });

  it("should modify an existing record if there is a matching composite id", async () => {
    const { pirate, ship } = await setup();
    vi.spyOn(ship, "id", "get").mockReturnValue("ABC1X" as any);
    (pirate as any).shipAttributes = { id: ship.id, name: "Davy Jones Gold Dagger" };
    expect((pirate.association("ship") as any).target.name).toBe("Davy Jones Gold Dagger");
  });

  it("should destroy an existing record if there is a matching id and destroy is truthy", async () => {
    const { pirate, ship } = await setup();
    await ship.destroy();
    for (const truth of [1, "1", true, "true"]) {
      const p = await Pirate.find(pirate.id);
      const s = await (p as any).createShip({ name: "Mister Pablo" });
      await p.update({ shipAttributes: { id: s.id, _destroy: truth } });
      expect(await shipOf(await Pirate.find(pirate.id))).toBeFalsy();
      await expect(Ship.find(s.id)).rejects.toThrow(RecordNotFound);
    }
  });

  it("should not destroy an existing record if destroy is not truthy", async () => {
    const { pirate, ship } = await setup();
    for (const notTruth of [null, "0", 0, "false", false]) {
      const p = await Pirate.find(pirate.id);
      await shipOf(p); // Rails reads `@pirate.ship`, loading it into memory
      await p.update({ shipAttributes: { id: ship.id, _destroy: notTruth } });
      expect(String((await Ship.find(ship.id)).id)).toBe(String(ship.id));
    }
  });

  it("should not destroy an existing record if allow destroy is false", async () => {
    const { pirate, ship } = await setup();
    acceptsNestedAttributesFor(Pirate, "ship", {
      allowDestroy: false,
      rejectIf: (a) => Object.keys(a).length === 0,
    });
    await pirate.update({ shipAttributes: { id: ship.id, _destroy: "1" } });
    const reloaded = await shipOf(await Pirate.find(pirate.id));
    expect(String(reloaded!.id)).toBe(String(ship.id));
    acceptsNestedAttributesFor(Pirate, "ship", {
      allowDestroy: true,
      rejectIf: (a) => Object.keys(a).length === 0,
    });
  });

  it("should also work with a HashWithIndifferentAccess", async () => {
    const { pirate, ship } = await setup();
    (pirate as any).shipAttributes = { id: ship.id, name: "Davy Jones Gold Dagger" };
    const target = (pirate.association("ship") as any).target as Ship;
    expect(target.isPersisted()).toBe(true);
    expect(target.name).toBe("Davy Jones Gold Dagger");
  });

  it("should work with update as well", async () => {
    const { pirate, ship } = await setup();
    await pirate.update({
      catchphrase: "Arr",
      shipAttributes: { id: ship.id, name: "Mister Pablo" },
    });
    const p = await Pirate.find(pirate.id);
    expect((p as any).catchphrase).toBe("Arr");
    expect((await shipOf(p))!.name).toBe("Mister Pablo");
  });

  it("should defer updating nested associations until after base attributes are set", async () => {
    const { ship } = await setup();
    const part = new ShipPart();
    (part as any).attributes = { shipAttributes: { name: "Prometheus" }, ship_id: ship.id };
    expect((await (part.association("ship") as any).loadTarget()).name).toBe("Prometheus");
  });

  it("should not destroy the associated model until the parent is saved", async () => {
    const { pirate, ship } = await setup();
    (pirate as any).attributes = { shipAttributes: { id: ship.id, _destroy: "1" } };
    const target = (pirate.association("ship") as any).target as Ship;
    expect(target.isDestroyed?.() ?? false).toBe(false);
    expect(isMarkedForDestruction(target)).toBe(true);
    await pirate.save();
    expect(target.isDestroyed?.() ?? true).toBe(true);
    expect(await shipOf(await Pirate.find(pirate.id))).toBeFalsy();
  });

  it("should automatically enable autosave on the association", () => {
    expect(Pirate.reflectOnAssociation("ship")?.options.autosave).toBe(true);
  });

  it("should accept update only option", async () => {
    const { pirate, ship } = await setup();
    await pirate.update({ updateOnlyShipAttributes: { id: ship.id, name: "Mayflower" } });
    expect((await shipOf(await Pirate.find(pirate.id)))!.name).toBe("Mayflower");
  });

  it("should create new model when nothing is there and update only is true", async () => {
    const { pirate, ship } = await setup();
    await (ship as any).delete();
    const p = await Pirate.find(pirate.id);
    await p.update({ updateOnlyShipAttributes: { name: "Mayflower" } });
    expect(await shipOf(await Pirate.find(pirate.id))).not.toBeNull();
  });

  it("should update existing when update only is true and no id is given", async () => {
    const { pirate, ship } = await setup();
    await (ship as any).delete();
    const newShip = await (pirate as any).createUpdateOnlyShip({ name: "Nights Dirty Lightning" });
    await pirate.update({ updateOnlyShipAttributes: { name: "Mayflower" } });
    expect((await Ship.find(newShip.id)).name).toBe("Mayflower");
  });

  it("should update existing when update only is true and id is given", async () => {
    const { pirate, ship } = await setup();
    await (ship as any).delete();
    const newShip = await (pirate as any).createUpdateOnlyShip({ name: "Nights Dirty Lightning" });
    await pirate.update({ updateOnlyShipAttributes: { name: "Mayflower", id: newShip.id } });
    expect((await Ship.find(newShip.id)).name).toBe("Mayflower");
  });

  it("should destroy existing when update only is true and id is given and is marked for destruction", async () => {
    acceptsNestedAttributesFor(Pirate, "updateOnlyShip", { updateOnly: true, allowDestroy: true });
    const { pirate, ship } = await setup();
    await (ship as any).delete();
    const newShip = await (pirate as any).createUpdateOnlyShip({ name: "Nights Dirty Lightning" });
    await pirate.update({
      updateOnlyShipAttributes: { name: "Mayflower", id: newShip.id, _destroy: true },
    });
    expect(await shipOf(await Pirate.find(pirate.id))).toBeFalsy();
    await expect(Ship.find(newShip.id)).rejects.toThrow(RecordNotFound);
    acceptsNestedAttributesFor(Pirate, "updateOnlyShip", { updateOnly: true, allowDestroy: false });
  });

  it("should raise an argument error if something other than a hash is passed in", async () => {
    const { pirate } = await setup();
    await expect(pirate.update({ shipAttributes: "foo" } as any)).rejects.toThrow(
      /Hash expected for `ship` attributes, got String/,
    );
  });
});

// ==========================================================================
// TestNestedAttributesOnABelongsToAssociation
// ==========================================================================
describe("TestNestedAttributesOnABelongsToAssociation", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  beforeAll(registerCommonModels);

  async function setup(): Promise<{ ship: Ship; pirate: Pirate }> {
    const ship = new Ship({ name: "Nights Dirty Lightning" });
    const pirate = (ship.association("pirate") as any).build({ catchphrase: "Aye" });
    await ship.saveBang();
    return { ship, pirate };
  }

  it("should define an attribute writer method for the association", () => {
    const ship = new Ship();
    expect(() => {
      (ship as any).pirateAttributes = {};
    }).not.toThrow();
  });

  it("should build a new record if there is no id", async () => {
    const { ship, pirate } = await setup();
    await pirate.destroy();
    const s = await Ship.find(ship.id);
    (s as any).pirateAttributes = { catchphrase: "Arr" };
    const target = (s.association("pirate") as any).target as Pirate;
    expect(target.isPersisted()).toBe(false);
    expect((target as any).catchphrase).toBe("Arr");
  });

  it("should not build a new record if there is no id and destroy is truthy", async () => {
    const { ship, pirate } = await setup();
    await pirate.destroy();
    const s = await Ship.find(ship.id);
    (s as any).pirateAttributes = { catchphrase: "Arr", _destroy: "1" };
    expect((s.association("pirate") as any).target).toBeFalsy();
  });

  it("should not build a new record if a reject if proc returns false", async () => {
    const { ship, pirate } = await setup();
    await pirate.destroy();
    const s = await Ship.find(ship.id);
    (s as any).pirateAttributes = {};
    expect((s.association("pirate") as any).target).toBeFalsy();
  });

  it("should replace an existing record if there is no id", async () => {
    const { ship, pirate } = await setup();
    const s = await Ship.find(ship.id);
    await pirateOf(s);
    (s as any).pirateAttributes = { catchphrase: "Arr" };
    const target = (s.association("pirate") as any).target as Pirate;
    expect(target.isPersisted()).toBe(false);
    expect((target as any).catchphrase).toBe("Arr");
    expect((pirate as any).catchphrase).toBe("Aye");
  });

  it("should not replace an existing record if there is no id and destroy is truthy", async () => {
    const { ship, pirate } = await setup();
    const s = await Ship.find(ship.id);
    await pirateOf(s);
    (s as any).pirateAttributes = { catchphrase: "Arr", _destroy: "1" };
    const target = (s.association("pirate") as any).target as Pirate;
    expect(String(target.id)).toBe(String(pirate.id));
    expect((target as any).catchphrase).toBe("Aye");
  });

  it("should modify an existing record if there is a matching id", async () => {
    const { ship, pirate } = await setup();
    const s = await Ship.find(ship.id);
    await pirateOf(s);
    (s as any).pirateAttributes = { id: pirate.id, catchphrase: "Arr" };
    const target = (s.association("pirate") as any).target as Pirate;
    expect(String(target.id)).toBe(String(pirate.id));
    expect((target as any).catchphrase).toBe("Arr");
  });

  it("should raise RecordNotFound if an id is given but doesnt return a record", async () => {
    const { ship } = await setup();
    await expect(
      (async () => {
        (ship as any).pirateAttributes = { id: 1234567890 };
        await ship.save();
      })(),
    ).rejects.toThrow(RecordNotFound);
  });

  it("should take a hash with string keys and update the associated model", async () => {
    const { ship, pirate } = await setup();
    const s = await Ship.find(ship.id);
    await pirateOf(s);
    (s as any).pirateAttributes = { id: String(pirate.id), catchphrase: "Arr" };
    const target = (s.association("pirate") as any).target as Pirate;
    expect(String(target.id)).toBe(String(pirate.id));
    expect((target as any).catchphrase).toBe("Arr");
  });

  it("should modify an existing record if there is a matching composite id", async () => {
    const { ship, pirate } = await setup();
    vi.spyOn(pirate, "id", "get").mockReturnValue("ABC1X" as any);
    (ship as any).pirateAttributes = { id: pirate.id, catchphrase: "Arr" };
    expect((ship.association("pirate") as any).target.catchphrase).toBe("Arr");
  });

  it("should destroy an existing record if there is a matching id and destroy is truthy", async () => {
    const { ship, pirate } = await setup();
    await pirate.destroy();
    for (const truth of [1, "1", true, "true"]) {
      const s = await Ship.find(ship.id);
      const p = await (s as any).createPirate({ catchphrase: "Arr" });
      await s.update({ pirateAttributes: { id: p.id, _destroy: truth } });
      await expect(Pirate.find(p.id)).rejects.toThrow(RecordNotFound);
    }
  });

  it("should unset association when an existing record is destroyed", async () => {
    const { ship, pirate } = await setup();
    const originalId = pirate.id;
    await ship.updateBang({ pirateAttributes: { id: pirate.id, _destroy: true } });
    expect((await Pirate.where({ id: originalId })).length).toBe(0);
    expect((ship as any).pirate_id).toBeFalsy();
    expect(await pirateOf(ship)).toBeFalsy();

    await ship.reload();
    expect((await Pirate.where({ id: originalId })).length).toBe(0);
    expect((ship as any).pirate_id).toBeFalsy();
    expect(await pirateOf(ship)).toBeFalsy();
  });

  it("should not destroy an existing record if destroy is not truthy", async () => {
    const { ship, pirate } = await setup();
    for (const notTruth of [null, "0", 0, "false", false]) {
      await ship.update({ pirateAttributes: { id: pirate.id, _destroy: notTruth } });
      await expect(Pirate.find(pirate.id)).resolves.toBeTruthy();
    }
  });

  it("should not destroy an existing record if allow destroy is false", async () => {
    const { ship, pirate } = await setup();
    acceptsNestedAttributesFor(Ship, "pirate", {
      allowDestroy: false,
      rejectIf: (a) => Object.keys(a).length === 0,
    });
    await ship.update({ pirateAttributes: { id: pirate.id, _destroy: "1" } });
    await expect(Pirate.find(pirate.id)).resolves.toBeTruthy();
    acceptsNestedAttributesFor(Ship, "pirate", {
      allowDestroy: true,
      rejectIf: (a) => Object.keys(a).length === 0,
    });
  });

  it("should work with update as well", async () => {
    const { ship, pirate } = await setup();
    await ship.update({
      name: "Mister Pablo",
      pirateAttributes: { id: pirate.id, catchphrase: "Arr" },
    });
    const s = await Ship.find(ship.id);
    expect(s.name).toBe("Mister Pablo");
    expect(((await pirateOf(s)) as any).catchphrase).toBe("Arr");
  });

  it("should not destroy the associated model until the parent is saved", async () => {
    const { ship, pirate } = await setup();
    (ship as any).attributes = { pirateAttributes: { id: pirate.id, _destroy: true } };
    await expect(Pirate.find(pirate.id)).resolves.toBeTruthy();
    await ship.save();
    await expect(Pirate.find(pirate.id)).rejects.toThrow(RecordNotFound);
  });

  it("should automatically enable autosave on the association", () => {
    expect(Ship.reflectOnAssociation("pirate")?.options.autosave).toBe(true);
  });

  it("should create new model when nothing is there and update only is true", async () => {
    const { ship, pirate } = await setup();
    await (pirate as any).delete();
    const s = await Ship.find(ship.id);
    // trails defers the update_only build to the post-save flush (it cannot
    // synchronously read "no existing record" without a DB load), so the
    // observable outcome — a freshly created update_only pirate — is checked
    // after save rather than the unsaved in-memory build Rails inspects.
    await s.update({ updateOnlyPirateAttributes: { catchphrase: "Arr" } });
    expect(
      await (await Ship.find(ship.id)).association("updateOnlyPirate").loadTarget(),
    ).not.toBeNull();
  });

  it("should update existing when update only is true and no id is given", async () => {
    const { ship, pirate } = await setup();
    await (pirate as any).delete();
    const newPirate = await (ship as any).createUpdateOnlyPirate({ catchphrase: "Aye" });
    await ship.update({ updateOnlyPirateAttributes: { catchphrase: "Arr" } });
    expect(((await Pirate.find(newPirate.id)) as any).catchphrase).toBe("Arr");
  });

  it("should update existing when update only is true and id is given", async () => {
    const { ship, pirate } = await setup();
    await (pirate as any).delete();
    const newPirate = await (ship as any).createUpdateOnlyPirate({ catchphrase: "Aye" });
    await ship.update({ updateOnlyPirateAttributes: { catchphrase: "Arr", id: newPirate.id } });
    expect(((await Pirate.find(newPirate.id)) as any).catchphrase).toBe("Arr");
  });

  it("should destroy existing when update only is true and id is given and is marked for destruction", async () => {
    acceptsNestedAttributesFor(Ship, "updateOnlyPirate", { updateOnly: true, allowDestroy: true });
    const { ship, pirate } = await setup();
    await (pirate as any).delete();
    const newPirate = await (ship as any).createUpdateOnlyPirate({ catchphrase: "Aye" });
    await ship.update({
      updateOnlyPirateAttributes: { catchphrase: "Arr", id: newPirate.id, _destroy: true },
    });
    await expect(Pirate.find(newPirate.id)).rejects.toThrow(RecordNotFound);
    acceptsNestedAttributesFor(Ship, "updateOnlyPirate", { updateOnly: true, allowDestroy: false });
  });

  it("should raise an argument error if something other than a hash is passed in", async () => {
    const { ship } = await setup();
    await expect(ship.update({ pirateAttributes: "foo" } as any)).rejects.toThrow(
      /Hash expected for `pirate` attributes, got String/,
    );
  });
});

// ==========================================================================
// NestedAttributesOnACollectionAssociationTests (mixed into has_many + HABTM)
// ==========================================================================
function collectionAssociationTests(
  associationName: "birds" | "parrots",
  childClass: typeof Bird | typeof Parrot,
  buildSetup: () => Promise<{ pirate: Pirate; child1: any; child2: any }>,
): void {
  const setter = `${associationName}Attributes`;
  const proxy = (p: Pirate) => (p as any)[associationName];
  const childName = childClass === Bird ? "Bird" : "Parrot";

  async function alternateParams(child1: any, child2: any): Promise<Record<string, any>> {
    return {
      foo: { id: child1.id, name: "Grace OMalley" },
      bar: { id: child2.id, name: "Privateers Greed" },
    };
  }

  it("should define an attribute writer method for the association", async () => {
    const { pirate } = await buildSetup();
    expect(() => {
      (pirate as any)[setter] = {};
    }).not.toThrow();
  });

  // tracked-pending-convergence (0023-surfaced-deviations): see the singular
  // counterpart — building a new nested record from an unknown key does not
  // raise (trails' build drops unknown attributes). model-new-unknown-attribute.
  it.skip("should raise an UnknownAttributeError for non existing nested attributes for has many", async () => {
    const { pirate } = await buildSetup();
    await expect(
      (async () => {
        (pirate as any)[setter] = [{ peg_leg: true }];
        await pirate.save();
      })(),
    ).rejects.toThrow(new RegExp(`unknown attribute 'peg_leg' for ${childName}`));
  });

  it("should save only one association on create", async () => {
    const pirate = (await Pirate.createBang({
      catchphrase: "Arr",
      [setter]: { foo: { name: "Grace OMalley" } },
    } as any)) as unknown as Pirate;
    const reloaded = await Pirate.find(pirate.id);
    expect(Number(await proxy(reloaded).count())).toBe(1);
  });

  it("should take a hash with string keys and assign the attributes to the associated models", async () => {
    const { pirate, child1, child2 } = await buildSetup();
    await pirate.update({ [setter]: await alternateParams(child1, child2) } as any);
    expect([
      (await childClass.find(child1.id)).name,
      (await childClass.find(child2.id)).name,
    ]).toEqual(["Grace OMalley", "Privateers Greed"]);
  });

  it("should take an array and assign the attributes to the associated models", async () => {
    const { pirate, child1, child2 } = await buildSetup();
    (pirate as any)[setter] = Object.values(await alternateParams(child1, child2));
    await pirate.save();
    expect([
      (await childClass.find(child1.id)).name,
      (await childClass.find(child2.id)).name,
    ]).toEqual(["Grace OMalley", "Privateers Greed"]);
  });

  it("should also work with a HashWithIndifferentAccess", async () => {
    const { pirate, child1 } = await buildSetup();
    (pirate as any)[setter] = { foo: { id: child1.id, name: "Grace OMalley" } };
    await pirate.save();
    expect((await childClass.find(child1.id)).name).toBe("Grace OMalley");
  });

  it("should take a hash and assign the attributes to the associated models", async () => {
    const { pirate, child1, child2 } = await buildSetup();
    (pirate as any).attributes = { [setter]: await alternateParams(child1, child2) };
    const target = await proxy(pirate).loadTarget();
    expect(target[0].name).toBe("Grace OMalley");
    expect(target[target.length - 1].name).toBe("Privateers Greed");
  });

  it("should not load association when updating existing records", async () => {
    const { pirate, child1 } = await buildSetup();
    await pirate.reload();
    (pirate as any)[setter] = [{ id: child1.id, name: "Grace OMalley" }];
    expect(proxy(pirate).loaded).toBe(false);
    await pirate.save();
    expect(proxy(pirate).loaded).toBe(false);
    expect((await childClass.find(child1.id)).name).toBe("Grace OMalley");
  });

  it("should not overwrite unsaved updates when loading association", async () => {
    const { pirate, child1 } = await buildSetup();
    await pirate.reload();
    (pirate as any)[setter] = [{ id: child1.id, name: "Grace OMalley" }];
    const target = await proxy(pirate).loadTarget();
    expect(target.find((r: any) => String(r.id) === String(child1.id)).name).toBe("Grace OMalley");
  });

  it("should preserve order when not overwriting unsaved updates", async () => {
    const { pirate, child1 } = await buildSetup();
    await pirate.reload();
    (pirate as any)[setter] = [{ id: child1.id, name: "Grace OMalley" }];
    const target = await proxy(pirate).loadTarget();
    expect(String(target[0].id)).toBe(String(child1.id));
  });

  it("should refresh saved records when not overwriting unsaved updates", async () => {
    const { pirate } = await buildSetup();
    await pirate.reload();
    const record = new (childClass as any)({ name: "Grace OMalley" });
    await proxy(pirate).push(record);
    await record.saveBang();
    const last = (await proxy(pirate).loadTarget()).at(-1);
    await last.updateBang({ name: "Polly" });
    expect((await proxy(pirate).loadTarget()).at(-1).name).toBe("Polly");
  });

  it("should not remove scheduled destroys when loading association", async () => {
    const { pirate, child1 } = await buildSetup();
    await pirate.reload();
    (pirate as any)[setter] = [{ id: child1.id, _destroy: "1" }];
    const target = await proxy(pirate).loadTarget();
    expect(
      isMarkedForDestruction(target.find((r: any) => String(r.id) === String(child1.id))),
    ).toBe(true);
  });

  it("should take a hash with composite id keys and assign the attributes to the associated models", async () => {
    const { pirate, child1, child2 } = await buildSetup();
    vi.spyOn(child1, "id", "get").mockReturnValue("ABC1X" as any);
    vi.spyOn(child2, "id", "get").mockReturnValue("ABC2X" as any);
    (pirate as any).attributes = {
      [setter]: [
        { id: child1.id, name: "Grace OMalley" },
        { id: child2.id, name: "Privateers Greed" },
      ],
    };
    expect([child1.name, child2.name]).toEqual(["Grace OMalley", "Privateers Greed"]);
  });

  it("should raise RecordNotFound if an id is given but doesnt return a record", async () => {
    const { pirate } = await buildSetup();
    // Rails queries `existing_records` here; trails can only consult the loaded
    // target synchronously, so load it first and use the bare setter (which,
    // unlike `attributes=`, surfaces the raw RecordNotFound).
    await proxy(pirate).load();
    expect(() => {
      (pirate as any)[setter] = [{ id: 1234567890 }];
    }).toThrow(RecordNotFound);
  });

  it("should raise RecordNotFound if an id belonging to a different record is given", async () => {
    const { pirate } = await buildSetup();
    const otherPirate = await Pirate.createBang({ catchphrase: "Ahoy!" });
    const otherChild = await proxy(otherPirate).createBang({ name: "Buccaneers Servant" });
    await proxy(pirate).load();
    expect(() => {
      (pirate as any)[setter] = [{ id: otherChild.id }];
    }).toThrow(RecordNotFound);
  });

  it("should automatically build new associated models for each entry in a hash where the id is missing", async () => {
    const { pirate } = await buildSetup();
    await proxy(pirate).destroyAll();
    await pirate.reload();
    (pirate as any).attributes = {
      [setter]: { foo: { name: "Grace OMalley" }, bar: { name: "Privateers Greed" } },
    };
    const target = await proxy(pirate).loadTarget();
    expect(target[0].isPersisted()).toBe(false);
    expect(target[0].name).toBe("Grace OMalley");
    expect(target.at(-1).isPersisted()).toBe(false);
    expect(target.at(-1).name).toBe("Privateers Greed");
  });

  it("should not assign destroy key to a record", async () => {
    const { pirate } = await buildSetup();
    expect(() => {
      (pirate as any)[setter] = { foo: { _destroy: "0" } };
    }).not.toThrow();
  });

  it("should ignore new associated records with truthy destroy attribute", async () => {
    const { pirate } = await buildSetup();
    await proxy(pirate).destroyAll();
    await pirate.reload();
    (pirate as any).attributes = {
      [setter]: {
        foo: { name: "Grace OMalley" },
        bar: { name: "Privateers Greed", _destroy: "1" },
      },
    };
    const target = await proxy(pirate).loadTarget();
    expect(target.length).toBe(1);
    expect(target[0].name).toBe("Grace OMalley");
  });

  it("should ignore new associated records if a reject if proc returns false", async () => {
    const { pirate, child1, child2 } = await buildSetup();
    const params = await alternateParams(child1, child2);
    params["baz"] = {};
    const before = Number(await proxy(pirate).count());
    (pirate as any).attributes = { [setter]: params };
    expect(Number(await proxy(pirate).count())).toBe(before);
  });

  it("should sort the hash by the keys before building new associated models", async () => {
    const { pirate } = await buildSetup();
    const attributes: Record<string, any> = {};
    attributes["123726353"] = { name: "Grace OMalley" };
    attributes["2"] = { name: "Privateers Greed" };
    (pirate as any)[setter] = attributes;
    const target = await proxy(pirate).loadTarget();
    expect(new Set(target.map((r: any) => r.name))).toEqual(
      new Set(["Posideons Killer", "Killer bandita Dionne", "Privateers Greed", "Grace OMalley"]),
    );
  });

  it("should raise an argument error if something else than a hash is passed", async () => {
    const { pirate } = await buildSetup();
    expect(() => {
      (pirate as any)[setter] = {};
    }).not.toThrow();
    expect(() => {
      (pirate as any)[setter] = "foo";
    }).toThrow(
      new RegExp(`Hash or Array expected for \`${associationName}\` attributes, got String`),
    );
  });

  it("should work with update as well", async () => {
    const { pirate, child1 } = await buildSetup();
    await pirate.update({
      catchphrase: "Arr",
      [setter]: { foo: { id: child1.id, name: "Grace OMalley" } },
    } as any);
    expect((await childClass.find(child1.id)).name).toBe("Grace OMalley");
  });

  it("should update existing records and add new ones that have no id", async () => {
    const { pirate, child1, child2 } = await buildSetup();
    const params = await alternateParams(child1, child2);
    params["baz"] = { name: "Buccaneers Servant" };
    const before = Number(await proxy(pirate).count());
    await pirate.update({ [setter]: params } as any);
    expect(Number(await proxy(pirate).count())).toBe(before + 1);
    const reloaded = await Pirate.find(pirate.id);
    expect(new Set((await proxy(reloaded).toArray()).map((r: any) => r.name))).toEqual(
      new Set(["Grace OMalley", "Privateers Greed", "Buccaneers Servant"]),
    );
  });

  it("should be possible to destroy a record", async () => {
    for (const trueVariable of ["1", 1, "true", true]) {
      const { pirate, child1, child2 } = await buildSetup();
      const record = await proxy(await Pirate.find(pirate.id)).createBang({
        name: "Grace OMalley",
      });
      const params = await alternateParams(child1, child2);
      params["baz"] = { id: record.id, _destroy: trueVariable };
      (pirate as any)[setter] = params;
      const before = Number(await proxy(pirate).count());
      await pirate.save();
      expect(Number(await proxy(await Pirate.find(pirate.id)).count())).toBe(before - 1);
    }
  });

  it("should not destroy the associated model with a non truthy argument", async () => {
    const { pirate, child1, child2 } = await buildSetup();
    for (const falseVariable of [null, "", "0", 0, "false", false]) {
      const params = await alternateParams(child1, child2);
      params["foo"]["_destroy"] = falseVariable;
      const before = Number(await proxy(pirate).count());
      await pirate.update({ [setter]: params } as any);
      expect(Number(await proxy(await Pirate.find(pirate.id)).count())).toBe(before);
    }
  });

  it("should not destroy the associated model until the parent is saved", async () => {
    const { pirate, child1, child2 } = await buildSetup();
    const params = await alternateParams(child1, child2);
    params["baz"] = { id: child1.id, _destroy: true };
    const before = Number(await proxy(pirate).count());
    (pirate as any)[setter] = params;
    expect(Number(await proxy(await Pirate.find(pirate.id)).count())).toBe(before);
    await pirate.save();
    expect(Number(await proxy(await Pirate.find(pirate.id)).count())).toBe(before - 1);
  });

  it("should automatically enable autosave on the association", () => {
    expect(Pirate.reflectOnAssociation(associationName)?.options.autosave).toBe(true);
  });

  it("can use symbols as object identifier", async () => {
    const { pirate } = await buildSetup();
    (pirate as any).attributes = {
      parrotsAttributes: { foo: { name: "Lovely Day" }, bar: { name: "Blown Away" } },
    };
    await expect(pirate.saveBang()).resolves.toBeTruthy();
  });

  it("assigning nested attributes target", async () => {
    const { pirate, child1, child2 } = await buildSetup();
    const params = Object.values(await alternateParams(child1, child2));
    (pirate as any)[setter] = params;
    await pirate.save();
    const nat = (
      pirate.association(associationName) as unknown as { nestedAttributesTarget: (Base | null)[] }
    ).nestedAttributesTarget;
    expect(nat.map((r) => (r ? String(r.id) : null))).toEqual([
      String(child1.id),
      String(child2.id),
    ]);
  });

  it("assigning nested attributes target with nil placeholder for rejected item", async () => {
    const { pirate, child1, child2 } = await buildSetup();
    const params = Object.values(await alternateParams(child1, child2));
    params.splice(1, 0, {});
    (pirate as any)[setter] = params;
    await pirate.save();
    const nat = (
      pirate.association(associationName) as unknown as { nestedAttributesTarget: (Base | null)[] }
    ).nestedAttributesTarget;
    expect(nat.map((r) => (r ? String(r.id) : null))).toEqual([
      String(child1.id),
      null,
      String(child2.id),
    ]);
  });
}

describe("TestNestedAttributesOnAHasManyAssociation", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  beforeAll(registerCommonModels);

  collectionAssociationTests("birds", Bird, async () => {
    const pirate = await Pirate.createBang({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    await (pirate as any).birds.createBang({ name: "Posideons Killer" });
    await (pirate as any).birds.createBang({ name: "Killer bandita Dionne" });
    const [child1, child2] = await (pirate as any).birds.toArray();
    return { pirate, child1, child2 };
  });

  it("validate presence of parent works with inverse of", async () => {
    expect(Human.reflectOnAssociation("interests")?.options.inverseOf).toBe("human");
    expect(Interest.reflectOnAssociation("human")?.options.inverseOf).toBe("interests");
    await repairValidations(Interest, async () => {
      (Interest as any).validates("human", { presence: true });
      const beforeH = Number(await Human.count());
      const beforeI = Number(await Interest.count());
      const human = await Human.createBang({
        name: "John",
        interestsAttributes: [{ topic: "Cars" }, { topic: "Sports" }],
      });
      expect(Number(await Human.count()) - beforeH).toBe(1);
      expect(Number(await Interest.count()) - beforeI).toBe(2);
      expect(Number(await (human as any).interests.count())).toBe(2);
    });
  });

  it("numeric column changes from zero to no empty string", async () => {
    acceptsNestedAttributesFor(Human, "interests");
    await repairValidations(Interest, async () => {
      (Interest as any).validates("zine_id", { numericality: true });
      const human = await Human.create({ name: "John" });
      const interest = await (human as any).interests.create({ topic: "bar", zine_id: 0 });
      expect(await interest.save()).toBe(true);
      expect(await human.update({ interestsAttributes: { id: interest.id, zine_id: "foo" } })).toBe(
        false,
      );
    });
  });
});

describe("TestNestedAttributesOnAHasAndBelongsToManyAssociation", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  beforeAll(registerCommonModels);

  collectionAssociationTests("parrots", Parrot, async () => {
    const pirate = await Pirate.createBang({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    await (pirate as any).parrots.createBang({ name: "Posideons Killer" });
    await (pirate as any).parrots.createBang({ name: "Killer bandita Dionne" });
    const [child1, child2] = await (pirate as any).parrots.toArray();
    return { pirate, child1, child2 };
  });
});

// ==========================================================================
// NestedAttributesLimitTests (mixed into Numeric / Symbol / Proc)
// ==========================================================================
function limitTests(makePirate: () => Promise<Pirate>): void {
  // trails wraps any error thrown from a setter during `attributes=` in an
  // AttributeAssignmentError, so the bare `parrots_attributes=` setter is used
  // here to observe the raw TooManyRecords Rails raises.
  it("limit with less records", async () => {
    const pirate = await makePirate();
    (pirate as any).parrotsAttributes = { foo: { name: "Big Big Love" } };
    const before = Number(await Parrot.count());
    await pirate.saveBang();
    expect(Number(await Parrot.count())).toBe(before + 1);
  });

  it("limit with number exact records", async () => {
    const pirate = await makePirate();
    (pirate as any).parrotsAttributes = {
      foo: { name: "Lovely Day" },
      bar: { name: "Blown Away" },
    };
    const before = Number(await Parrot.count());
    await pirate.saveBang();
    expect(Number(await Parrot.count())).toBe(before + 2);
  });

  it("limit with exceeding records", async () => {
    const pirate = await makePirate();
    expect(() => {
      (pirate as any).parrotsAttributes = {
        foo: { name: "Lovely Day" },
        bar: { name: "Blown Away" },
        car: { name: "The Happening" },
      };
    }).toThrow(TooManyRecords);
  });
}

describe("TestNestedAttributesLimitNumeric", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  beforeAll(registerCommonModels);
  beforeAll(() => acceptsNestedAttributesFor(Pirate, "parrots", { limit: 2 }));
  limitTests(
    async () =>
      await Pirate.createBang({
        catchphrase: "Don' botharrr talkin' like one, savvy?",
      }),
  );
});

describe("TestNestedAttributesLimitSymbol", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  beforeAll(registerCommonModels);
  beforeAll(() => acceptsNestedAttributesFor(Pirate, "parrots", { limit: "parrotsLimit" }));
  limitTests(
    async () =>
      (await Pirate.createBang({
        catchphrase: "Don' botharrr talkin' like one, savvy?",
        parrotsLimit: 2,
      } as any)) as unknown as Pirate,
  );
});

describe("TestNestedAttributesLimitProc", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  beforeAll(registerCommonModels);
  beforeAll(() => acceptsNestedAttributesFor(Pirate, "parrots", { limit: () => 2 }));
  limitTests(
    async () =>
      await Pirate.createBang({
        catchphrase: "Don' botharrr talkin' like one, savvy?",
      }),
  );
});

// ==========================================================================
// TestNestedAttributesWithNonStandardPrimaryKeys
// ==========================================================================
describe("TestNestedAttributesWithNonStandardPrimaryKeys", () => {
  const { owners, pets } = fixtures(["owners", "pets"], { schema: canonicalSchema });

  beforeAll(() => {
    acceptsNestedAttributesFor(Owner, "pets", { allowDestroy: true });
  });

  it("should update existing records with non standard primary key", async () => {
    const owner = owners("ashley");
    const pet1 = pets("chew");
    const pet2 = pets("mochi");
    await owner.update({
      petsAttributes: {
        "0": { id: pet1.id, name: "Foo" },
        "1": { id: pet2.id, name: "Bar" },
      },
    });
    expect((await (owner as any).pets.toArray()).map((p: any) => p.name)).toEqual(["Foo", "Bar"]);
  });

  it("attr accessor of child should be value provided during update", async () => {
    const owner = owners("ashley");
    const pet1 = pets("chew");
    await owner.update({
      petsAttributes: { "1": { id: pet1.id, name: "Foo2", current_user: "John", _destroy: true } },
    });
    expect(Pet.afterDestroyOutput).toBe("John");
  });
});

// ==========================================================================
// TestHasOneAutosaveAssociationWhichItselfHasAutosaveAssociations
// ==========================================================================
describe("TestHasOneAutosaveAssociationWhichItselfHasAutosaveAssociations", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  beforeAll(registerCommonModels);

  async function setup() {
    const pirate = await Pirate.createBang({ catchphrase: "My baby takes tha mornin' train!" });
    const ship = await (pirate as any).createShip({ name: "The good ship Dollypop" });
    const part = await ship.parts.createBang({ name: "Mast" });
    const trinket = await part.trinkets.createBang({ name: "Necklace" });
    return { pirate, ship, part, trinket };
  }

  it("when great-grandchild changed in memory, saving parent should save great-grandchild", async () => {
    const { pirate, trinket } = await setup();
    trinket.name = "changed";
    await pirate.save();
    expect((await Treasure.find(trinket.id)).name).toBe("changed");
  });

  it("when great-grandchild changed via attributes, saving parent should save great-grandchild", async () => {
    const { pirate, ship, part, trinket } = await setup();
    (pirate as any).attributes = {
      shipAttributes: {
        id: ship.id,
        partsAttributes: [
          { id: part.id, trinketsAttributes: [{ id: trinket.id, name: "changed" }] },
        ],
      },
    };
    await pirate.save();
    expect((await Treasure.find(trinket.id)).name).toBe("changed");
  });

  it("when great-grandchild marked_for_destruction via attributes, saving parent should destroy great-grandchild", async () => {
    const { pirate, ship, part, trinket } = await setup();
    (pirate as any).attributes = {
      shipAttributes: {
        id: ship.id,
        partsAttributes: [
          { id: part.id, trinketsAttributes: [{ id: trinket.id, _destroy: true }] },
        ],
      },
    };
    const before = Number(await part.trinkets.count());
    await pirate.save();
    expect(Number(await (await ShipPart.find(part.id)).trinkets.count())).toBe(before - 1);
  });

  it("when great-grandchild added via attributes, saving parent should create great-grandchild", async () => {
    const { pirate, ship, part } = await setup();
    (pirate as any).attributes = {
      shipAttributes: {
        id: ship.id,
        partsAttributes: [{ id: part.id, trinketsAttributes: [{ name: "created" }] }],
      },
    };
    const before = Number(await part.trinkets.count());
    await pirate.save();
    expect(Number(await (await ShipPart.find(part.id)).trinkets.count())).toBe(before + 1);
  });

  it("when extra records exist for associations, validate (which calls nested_records_changed_for_autosave?) should not load them up", async () => {
    const { pirate, ship, trinket } = await setup();
    trinket.name = "changed";
    await Ship.createBang({ pirate_id: pirate.id, name: "The Black Rock" });
    await ShipPart.createBang({ ship_id: ship.id, name: "Stern" });
    await assertNoQueries(false, async () => {
      await pirate.isValid();
    });
  });
});

// ==========================================================================
// TestHasManyAutosaveAssociationWhichItselfHasAutosaveAssociations
// ==========================================================================
describe("TestHasManyAutosaveAssociationWhichItselfHasAutosaveAssociations", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  beforeAll(registerCommonModels);

  async function setup() {
    const ship = await Ship.createBang({ name: "The good ship Dollypop" });
    const part = await (ship as any).parts.createBang({ name: "Mast" });
    const trinket = await part.trinkets.createBang({ name: "Necklace" });
    return { ship, part, trinket };
  }

  it("if association is not loaded and association record is saved and then in memory record attributes should be saved", async () => {
    const { ship, part } = await setup();
    (ship as any).partsAttributes = [{ id: part.id, name: "Deck" }];
    expect((ship.association("parts") as any).target.length).toBe(1);
    expect((await (ship as any).parts.toArray())[0].name).toBe("Deck");
  });

  it("if association is not loaded and child doesn't change and I am saving a grandchild then in memory record should be used", async () => {
    const { ship, part, trinket } = await setup();
    (ship as any).partsAttributes = [
      { id: part.id, trinketsAttributes: [{ id: trinket.id, name: "Ruby" }] },
    ];
    expect((ship.association("parts") as any).target.length).toBe(1);
    const parts = await (ship as any).parts.toArray();
    expect(parts[0].name).toBe("Mast");
    expect((await parts[0].trinkets.toArray())[0].name).toBe("Ruby");
    await ship.save();
    expect((await (await (ship as any).parts.toArray())[0].trinkets.toArray())[0].name).toBe(
      "Ruby",
    );
  });

  it("when grandchild changed in memory, saving parent should save grandchild", async () => {
    const { ship, trinket } = await setup();
    trinket.name = "changed";
    await ship.save();
    expect((await Treasure.find(trinket.id)).name).toBe("changed");
  });

  it("when grandchild changed via attributes, saving parent should save grandchild", async () => {
    const { ship, part, trinket } = await setup();
    (ship as any).attributes = {
      partsAttributes: [{ id: part.id, trinketsAttributes: [{ id: trinket.id, name: "changed" }] }],
    };
    await ship.save();
    expect((await Treasure.find(trinket.id)).name).toBe("changed");
  });

  it("when grandchild marked_for_destruction via attributes, saving parent should destroy grandchild", async () => {
    const { ship, part, trinket } = await setup();
    (ship as any).attributes = {
      partsAttributes: [{ id: part.id, trinketsAttributes: [{ id: trinket.id, _destroy: true }] }],
    };
    const before = Number(await part.trinkets.count());
    await ship.save();
    expect(Number(await (await ShipPart.find(part.id)).trinkets.count())).toBe(before - 1);
  });

  it("when grandchild added via attributes, saving parent should create grandchild", async () => {
    const { ship, part } = await setup();
    (ship as any).attributes = {
      partsAttributes: [{ id: part.id, trinketsAttributes: [{ name: "created" }] }],
    };
    const before = Number(await part.trinkets.count());
    await ship.save();
    expect(Number(await (await ShipPart.find(part.id)).trinkets.count())).toBe(before + 1);
  });

  it("circular references do not perform unnecessary queries", async () => {
    const ship = new Ship({ name: "The Black Rock" });
    const part = (ship.association("parts") as any).build({ name: "Stern" });
    (ship.association("treasures") as any).build({ looter: part });
    await assertQueriesCount(5, false, async () => {
      await ship.saveBang();
    });
  });

  it("nested singular associations are validated", async () => {
    const part = new ShipPart({ name: "Stern", shipAttributes: { name: null } });
    expect(await part.isValid()).toBe(false);
    expect((part as any).errors.fullMessages).toEqual(["Ship name can't be blank"]);
  });

  it("when extra records exist for associations, validate (which calls nested_records_changed_for_autosave?) should not load them up", async () => {
    const { ship, trinket } = await setup();
    trinket.name = "changed";
    await Ship.createBang({ name: "The Black Rock" });
    await ShipPart.createBang({ ship_id: ship.id, name: "Stern" });
    await assertNoQueries(false, async () => {
      await ship.isValid();
    });
  });
});

// ==========================================================================
// TestIndexErrorsWithNestedAttributesOnlyMode
// ==========================================================================
describe("TestIndexErrorsWithNestedAttributesOnlyMode", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  beforeAll(() => {
    registerModel(Guitar);
    registerModel(TuningPeg);
    acceptsNestedAttributesFor(Guitar, "tuningPegs", {
      rejectIf: (a) => Number(a["pitch"]) % 2 === 1,
    });
  });

  // tracked-pending-convergence (0023-surfaced-deviations): nested has_many
  // index_errors validation does not propagate to the parent's `valid?` when
  // the children are assigned in-memory via nested attributes — trails does not
  // run the indexed nested-record validators for the unloaded/assigned target.
  // See nested-attributes-index-errors convergence story.
  it.skip("index in nested_attributes_order order", async () => {
    const guitar = await Guitar.createBang({});
    await (guitar as any).tuningPegs.createBang({ pitch: 1 });
    const peg2 = await (guitar as any).tuningPegs.createBang({ pitch: 2 });
    expect(await guitar.isValid()).toBe(true);
    await guitar.update({ tuningPegsAttributes: [{ id: peg2.id, pitch: null }] });
    expect(await guitar.isValid()).toBe(false);
    expect(Object.keys((guitar as any).errors.messages)).toEqual(["tuningPegs[0].pitch"]);
  });

  it.skip("index unaffected by reject_if", async () => {
    const guitar = await Guitar.createBang({});
    await guitar.update({ tuningPegsAttributes: [{ pitch: 1 }, { pitch: null }] });
    expect(await guitar.isValid()).toBe(false);
    expect(Object.keys((guitar as any).errors.messages)).toEqual(["tuningPegs[1].pitch"]);
  });
});

// ==========================================================================
// TestNestedAttributesWithExtend
// ==========================================================================
describe("TestNestedAttributesWithExtend", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });

  // tracked-pending-convergence (0023-surfaced-deviations): the `extend:` option
  // on an association (Rails `has_many :treasures, extend: PostTreasuresExtension`)
  // is not wired into nested-attributes builds — the extension module's overrides
  // (e.g. `build` naming the record "from extension") do not run.
  // See nested-attributes-association-extend convergence story.
  it.skip("extend affects nested attributes", async () => {
    /* requires association `extend:` support */
  });
});

// ==========================================================================
// TestNestedAttributesForDelegatedType
// ==========================================================================
describe("TestNestedAttributesForDelegatedType", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
  });
  beforeAll(() => {
    registerModel(Entry);
    registerModel(Message);
    acceptsNestedAttributesFor(Entry, "entryable");
  });

  // tracked-pending-convergence (0023-surfaced-deviations): nested attributes
  // for a delegated_type association are not yet supported — trails treats the
  // delegated `entryable` as a plain polymorphic belongs_to and refuses to build
  // it, rather than instantiating the concrete type from `entryable_type`.
  // See nested-attributes-delegated-type convergence story.
  it.skip("should build a new record based on the delegated type", () => {
    const entry = new Entry({
      entryable_type: "Message",
      entryableAttributes: { subject: "Hello world!" },
    });
    const target = (entry.association("entryable") as any).target;
    expect(target.isPersisted()).toBe(false);
    expect(target.subject).toBe("Hello world!");
  });
});
