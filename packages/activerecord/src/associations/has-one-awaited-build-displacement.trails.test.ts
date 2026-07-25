import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, type Base } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Pirate } from "../test-helpers/models/pirate.js";
import { Ship } from "../test-helpers/models/ship.js";

interface ShipAssociation {
  target: Base | null;
  _displacedRecords: Base[];
}

interface PirateWithShip {
  id: number;
  ship: Promise<Base | null>;
  association(name: string): ShipAssociation;
  buildShip(attributes: Record<string, unknown>): Promise<Base>;
  createShip(attributes: Record<string, unknown>): Promise<Base>;
  save(): Promise<boolean>;
}

function spyOnTargetSave(assoc: ShipAssociation): () => number {
  const target = assoc.target as unknown as { save: (...args: unknown[]) => unknown };
  const original = target.save.bind(target);
  let calls = 0;
  target.save = (...args: unknown[]) => {
    calls++;
    return original(...args);
  };
  return () => calls;
}

describe("has_one displacement via the awaitable build/create accessors", () => {
  fixtures(["pirates", "ships"]);

  beforeAll(() => {
    registerModel(Pirate);
    registerModel(Ship);
  });

  async function pirateWithLoadedShip(): Promise<PirateWithShip> {
    const pirate = (await Pirate.create({ catchphrase: "Aye" })) as unknown as PirateWithShip;
    await Ship.create({ name: "Old Ship", pirate_id: pirate.id });
    await pirate.ship;
    return pirate;
  }

  it("removes the displaced record exactly once for an awaited build", async () => {
    const pirate = await pirateWithLoadedShip();
    const assoc = pirate.association("ship");
    const saveCalls = spyOnTargetSave(assoc);

    await pirate.buildShip({ name: "New Ship" });
    expect(assoc._displacedRecords).toHaveLength(0);
    await pirate.save();

    expect(saveCalls()).toBe(1);
  });

  it("removes the displaced record exactly once for an awaited create", async () => {
    const pirate = await pirateWithLoadedShip();
    const assoc = pirate.association("ship");
    const saveCalls = spyOnTargetSave(assoc);

    await pirate.createShip({ name: "New Ship" });
    expect(assoc._displacedRecords).toHaveLength(0);
    await pirate.save();

    expect(saveCalls()).toBe(1);
  });

  it("removes each displaced record exactly once across repeated awaited builds", async () => {
    const pirate = await pirateWithLoadedShip();
    const assoc = pirate.association("ship");
    const firstSaveCalls = spyOnTargetSave(assoc);

    await pirate.createShip({ name: "Second Ship" });
    const secondSaveCalls = spyOnTargetSave(assoc);
    await pirate.buildShip({ name: "Third Ship" });

    expect(assoc._displacedRecords).toHaveLength(0);
    await pirate.save();

    expect(firstSaveCalls()).toBe(1);
    expect(secondSaveCalls()).toBe(1);
  });
});
