import { describe, it, expect, beforeEach } from "vitest";
import { fixtures } from "./test-fixtures.js";
import { Pirate } from "./test-helpers/models/pirate.js";
import "./test-helpers/models/bird.js";
import type { Bird } from "./test-helpers/models/bird.js";

let addCallbackCalled: Bird[] = [];

Pirate.hasMany("birdsWithAddLoad", {
  className: "Bird",
  beforeAdd: (p: any, b: any) => {
    addCallbackCalled.push(b);
    void p.birdsWithAddLoad.toArray();
  },
});
Pirate.hasMany("birdsWithAdd", {
  className: "Bird",
  beforeAdd: (_p: any, b: any) => {
    addCallbackCalled.push(b);
  },
});

Pirate.acceptsNestedAttributesFor("birdsWithAddLoad", { allowDestroy: true });
Pirate.acceptsNestedAttributesFor("birdsWithAdd", { allowDestroy: true });

describe("NestedAttributesWithCallbacksTest", () => {
  fixtures([]);

  let pirate: any;
  let birds: Bird[];

  beforeEach(async () => {
    addCallbackCalled = [];
    pirate = new Pirate();
    pirate.catchphrase = "Don't call me!";
    await pirate.setBirdsAttributes([{ name: "Bird1" }, { name: "Bird2" }]);
    await pirate.saveBang();
    birds = await pirate.birds.toArray();
  });

  const birdToUpdate = () => birds[0];
  const birdToDestroy = () => birds[1];

  const existingBirdsAttributes = () => birds.map((bird) => ({ id: bird.id, name: bird.name }));

  const newBirds = async (): Promise<Bird[]> => {
    const all = (await pirate.birdsWithAdd.toArray()) as Bird[];
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

  it(":before_add called for new bird when not loaded", async () => {
    expect(pirate.birdsWithAdd.loaded).toBeFalsy();
    await pirate.setBirdsWithAddAttributes(newBirdAttributes());
    await assertNewBirdWithCallbackCalled();
  });

  it(":before_add called for new bird when loaded", async () => {
    await pirate.birdsWithAdd.load();
    await pirate.setBirdsWithAddAttributes(newBirdAttributes());
    await assertNewBirdWithCallbackCalled();
  });

  it(":before_add not called for identical assignment when not loaded", async () => {
    expect(pirate.birdsWithAdd.loaded).toBeFalsy();
    await pirate.setBirdsWithAddAttributes(existingBirdsAttributes());
    await assertCallbacksNotCalled();
  });

  it(":before_add not called for identical assignment when loaded", async () => {
    await pirate.birdsWithAdd.load();
    await pirate.setBirdsWithAddAttributes(existingBirdsAttributes());
    await assertCallbacksNotCalled();
  });

  it(":before_add not called for destroy assignment when not loaded", async () => {
    expect(pirate.birdsWithAdd.loaded).toBeFalsy();
    await pirate.setBirdsWithAddAttributes(destroyBirdAttributes());
    await assertCallbacksNotCalled();
  });

  it(":before_add not called for deletion assignment when loaded", async () => {
    await pirate.birdsWithAdd.load();
    await pirate.setBirdsWithAddAttributes(destroyBirdAttributes());
    await assertCallbacksNotCalled();
  });

  const assertAssignmentAffectsRecordsInTarget = async (associationName: string) => {
    const association = pirate[associationName].target as Bird[];
    const updated = association.find((b: Bird) => String(b.id) === String(birdToUpdate().id));
    expect(updated!.attributeChanged("name")).toBe(true);
    const destroyed = association.find((b: Bird) => String(b.id) === String(birdToDestroy().id));
    expect(destroyed!.markedForDestruction()).toBe(true);
  };

  it("Assignment updates records in target when not loaded", async () => {
    expect(pirate.birdsWithAdd.loaded).toBeFalsy();
    await pirate.setBirdsWithAddAttributes(updateNewAndDestroyBirdAttributes());
    await assertAssignmentAffectsRecordsInTarget("birdsWithAdd");
  });

  it("Assignment updates records in target when loaded", async () => {
    await pirate.birdsWithAdd.load();
    await pirate.setBirdsWithAddAttributes(updateNewAndDestroyBirdAttributes());
    await assertAssignmentAffectsRecordsInTarget("birdsWithAdd");
  });

  it("Assignment updates records in target when not loaded", async () => {
    expect(pirate.birdsWithAddLoad.loaded).toBeFalsy();
    await pirate.setBirdsWithAddLoadAttributes(updateNewAndDestroyBirdAttributes());
    await assertAssignmentAffectsRecordsInTarget("birdsWithAddLoad");
  });

  it("Assignment updates records in target when loaded", async () => {
    await pirate.birdsWithAddLoad.load();
    await pirate.setBirdsWithAddLoadAttributes(updateNewAndDestroyBirdAttributes());
    await assertAssignmentAffectsRecordsInTarget("birdsWithAddLoad");
  });
});
