/**
 * Trails-only surface: the awaitable `build#{Name}` / `create#{Name}` accessors
 * remove the displaced has_one target inline (`detachDisplacedTarget`), while
 * the synchronous `setNewRecord` underneath them ALSO queues that record on
 * `_displacedRecords` for the owner's autosave drain (`removeDisplaced`) — so
 * `remove_target!` ran twice for one displacement.
 *
 * Rails runs it exactly once: `set_new_record` -> `replace(record, false)`
 * (has_one_association.rb:68-69, 91-92). The end state was already correct on
 * both paths (the second removal's writes are absorbed: the `:destroy` branch
 * is gated on `target.persisted?`, and the nullify branch re-saves an unchanged
 * record, which emits no UPDATE), so these assert the removal COUNT — the
 * displaced record's `save` under the nullify branch, plus the drained queue.
 *
 * The queue itself stays: the synchronous `assoc.build()` path nested
 * attributes uses never reaches these accessors (see
 * has-one-sync-build-displacement.trails.test.ts).
 */
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

/** Count `save` calls on the association's loaded target. */
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
});
