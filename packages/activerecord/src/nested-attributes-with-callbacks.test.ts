/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Targets: activerecord/test/cases/nested_attributes_with_callbacks_test.rb
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Base, registerModel, acceptsNestedAttributesFor } from "./index.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";

// Shared callback sink — Rails uses a class variable `@@add_callback_called`
// captured by the `before_add` procs declared on the associations below.
let addCallbackCalled: NwcBird[] = [];

// Rails uses the real `Pirate`/`Bird` models (`pirates`/`birds` tables) and
// declares the `birds_with_add` associations on Pirate at test-case load. We
// mirror that with dedicated classes mapped to the canonical tables so the
// before_add procs and nested-attributes wiring stay isolated to this file.
class NwcBird extends Base {
  static {
    this._tableName = "birds";
    this.attribute("name", "string");
    this.attribute("pirate_id", "integer");
    this.belongsTo("pirate", { className: "NwcPirate", foreignKey: "pirate_id" });
    this.validates("name", { presence: true });
  }
}

class NwcPirate extends Base {
  static {
    this._tableName = "pirates";
    this.attribute("catchphrase", "string");
  }
}

NwcPirate.hasMany("birds", {
  className: "NwcBird",
  foreignKey: "pirate_id",
});
// Mirrors Rails' `before_add: proc { |p, b| @@add_callback_called << b;
// p.birds_with_add_load.to_a }` — the proc both records the added bird and
// loads the target. The `.to_a` force-load is synchronous in Rails, but
// trails fires before_add from the synchronous add path while the collection
// load is async, so the proc can only fire-and-forget (`void`). The added
// record still lands in the in-memory target via the sync build path, so the
// observable assertions match Rails; only the proc's own side-effect load is
// non-blocking. Tracked-pending-convergence deviation — see
// packages/website/docs/guides/activerecord-rails-deviations.md §11.
NwcPirate.hasMany("birdsWithAddLoad", {
  className: "NwcBird",
  foreignKey: "pirate_id",
  beforeAdd: (p: any, b: any) => {
    addCallbackCalled.push(b);
    void p.birdsWithAddLoad.toArray();
  },
});
NwcPirate.hasMany("birdsWithAdd", {
  className: "NwcBird",
  foreignKey: "pirate_id",
  beforeAdd: (_p: any, b: any) => {
    addCallbackCalled.push(b);
  },
});

acceptsNestedAttributesFor(NwcPirate, "birds", {});
acceptsNestedAttributesFor(NwcPirate, "birdsWithAddLoad", { allowDestroy: true });
acceptsNestedAttributesFor(NwcPirate, "birdsWithAdd", { allowDestroy: true });

registerModel("NwcBird", NwcBird);
registerModel("NwcPirate", NwcPirate);

describe("NestedAttributesWithCallbacksTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({ pirates: canonicalSchema.pirates, birds: canonicalSchema.birds });
  });

  let pirate: any;
  let birds: NwcBird[];

  beforeEach(async () => {
    addCallbackCalled = [];
    pirate = new NwcPirate();
    pirate.catchphrase = "Don't call me!";
    (pirate as any).birdsAttributes = [{ name: "Bird1" }, { name: "Bird2" }];
    await pirate.save();
    birds = await pirate.birds.toArray();
  });

  const birdToUpdate = () => birds[0];
  const birdToDestroy = () => birds[1];

  const existingBirdsAttributes = () => birds.map((bird) => ({ id: bird.id, name: bird.name }));

  // Rails' `new_birds` = `birds_with_add.to_a - @birds`; the new bird is the
  // one with no persisted id (built in memory at assignment time).
  const newBirds = async (): Promise<NwcBird[]> => {
    const all = (await pirate.birdsWithAdd.toArray()) as NwcBird[];
    const existingIds = new Set(birds.map((b) => b.id));
    return all.filter((b) => b.id == null || !existingIds.has(b.id));
  };

  const newBirdAttributes = () => [{ name: "New Bird" }];

  const destroyBirdAttributes = () => [{ id: String(birdToDestroy().id), _destroy: true }];

  const updateNewAndDestroyBirdAttributes = () => [
    { id: String(birds[0].id), name: "New Name" },
    { name: "New Bird" },
    { id: String(birdToDestroy().id), _destroy: true },
  ];

  const assertNewBirdWithCallbackCalled = async () => {
    const nb = await newBirds();
    expect(nb.length).toBe(1);
    expect(addCallbackCalled).toEqual(nb);
  };

  const assertCallbacksNotCalled = async () => {
    expect(await newBirds()).toEqual([]);
    expect(addCallbackCalled).toEqual([]);
  };

  // Characterizing when :before_add callback is called
  it(":before_add called for new bird when not loaded", async () => {
    expect(pirate.birdsWithAdd.loaded).toBe(false);
    (pirate as any).birdsWithAddAttributes = newBirdAttributes();
    await assertNewBirdWithCallbackCalled();
  });

  it(":before_add called for new bird when loaded", async () => {
    await pirate.birdsWithAdd.load();
    (pirate as any).birdsWithAddAttributes = newBirdAttributes();
    await assertNewBirdWithCallbackCalled();
  });

  it(":before_add not called for identical assignment when not loaded", async () => {
    expect(pirate.birdsWithAdd.loaded).toBe(false);
    (pirate as any).birdsWithAddAttributes = existingBirdsAttributes();
    await assertCallbacksNotCalled();
  });

  it(":before_add not called for identical assignment when loaded", async () => {
    await pirate.birdsWithAdd.load();
    (pirate as any).birdsWithAddAttributes = existingBirdsAttributes();
    await assertCallbacksNotCalled();
  });

  it(":before_add not called for destroy assignment when not loaded", async () => {
    expect(pirate.birdsWithAdd.loaded).toBe(false);
    (pirate as any).birdsWithAddAttributes = destroyBirdAttributes();
    await assertCallbacksNotCalled();
  });

  it(":before_add not called for deletion assignment when loaded", async () => {
    await pirate.birdsWithAdd.load();
    (pirate as any).birdsWithAddAttributes = destroyBirdAttributes();
    await assertCallbacksNotCalled();
  });

  // Ensuring that the records in the association target are updated,
  // whether the association is loaded before or not
  const assertAssignmentAffectsRecordsInTarget = async (associationName: string) => {
    const association = (pirate as any)[associationName].target as NwcBird[];
    const updated = association.find((b: NwcBird) => String(b.id) === String(birdToUpdate().id));
    expect(updated!.attributeChanged("name")).toBe(true);
    const destroyed = association.find((b: NwcBird) => String(b.id) === String(birdToDestroy().id));
    expect(destroyed!.markedForDestruction()).toBe(true);
  };

  it("Assignment updates records in target when not loaded", async () => {
    expect(pirate.birdsWithAdd.loaded).toBe(false);
    (pirate as any).birdsWithAddAttributes = updateNewAndDestroyBirdAttributes();
    await assertAssignmentAffectsRecordsInTarget("birdsWithAdd");
  });

  it("Assignment updates records in target when loaded", async () => {
    await pirate.birdsWithAdd.load();
    (pirate as any).birdsWithAddAttributes = updateNewAndDestroyBirdAttributes();
    await assertAssignmentAffectsRecordsInTarget("birdsWithAdd");
  });

  // The "and callback loads target" variants: same description, but exercise
  // `birds_with_add_load`, whose `before_add` proc force-loads the target.
  it("Assignment updates records in target when not loaded", async () => {
    expect(pirate.birdsWithAddLoad.loaded).toBe(false);
    (pirate as any).birdsWithAddLoadAttributes = updateNewAndDestroyBirdAttributes();
    await assertAssignmentAffectsRecordsInTarget("birdsWithAddLoad");
  });

  it("Assignment updates records in target when loaded", async () => {
    await pirate.birdsWithAddLoad.load();
    (pirate as any).birdsWithAddLoadAttributes = updateNewAndDestroyBirdAttributes();
    await assertAssignmentAffectsRecordsInTarget("birdsWithAddLoad");
  });
});
