/**
 * Trails-only surface: an `id` / `update_only` one-to-one nested-attributes
 * update whose target is **not in memory**.
 *
 * Rails has no separate test for this because it has no separate case: the
 * writer opens with `existing_record = send(association_name)`
 * (vendor/rails/activerecord/lib/active_record/nested_attributes.rb:436), and
 * the reader loads the association, so a DB-backed record is updated (or marked
 * for destruction) in place at the assignment expression whether or not it was
 * loaded first. A synchronous JS property setter cannot await that load, so
 * trails issues it at assignment and settles it in the same drain the build arm
 * uses — the awaitable `set#{Name}Attributes` writer, or `save()`.
 *
 * These guard the observability Rails gets for free: the update is on the
 * in-memory graph *before* any save.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, type Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Pirate } from "./test-helpers/models/pirate.js";
import { Ship } from "./test-helpers/models/ship.js";

interface PirateHandle {
  id: number;
  ship: Promise<Base | null>;
  updateOnlyShip: Promise<Base | null>;
  setShipAttributes(attrs: unknown): Promise<void>;
  setUpdateOnlyShipAttributes(attrs: unknown): Promise<void>;
  save(): Promise<boolean>;
}

/** A persisted pirate + ship pair with the `ship` association never loaded. */
async function pirateWithUnloadedShip(): Promise<[PirateHandle, Base]> {
  const pirate = (await Pirate.createBang({ catchphrase: "Aye" })) as unknown as PirateHandle;
  const ship = (await Ship.createBang({
    name: "Nights Dirty Lightning",
    pirate_id: pirate.id,
  })) as Base;
  expect((pirate as unknown as Base).association("ship").isLoaded()).toBe(false);
  return [pirate, ship];
}

describe("nested attributes update on an unloaded one-to-one association", () => {
  fixtures(["pirates", "ships"]);

  beforeAll(() => {
    registerModel(Pirate);
    registerModel(Ship);
  });

  it("updates an unloaded existing record in place before the owner is saved", async () => {
    const [pirate, ship] = await pirateWithUnloadedShip();

    await pirate.setShipAttributes({
      id: (ship as unknown as { id: number }).id,
      name: "Davy Jones Gold Dagger",
    });

    const target = (await pirate.ship) as unknown as { name: string; hasChangesToSave: boolean };
    expect(target.name).toBe("Davy Jones Gold Dagger");
    expect(target.hasChangesToSave).toBe(true);
  });

  it("marks an unloaded existing record for destruction before the owner is saved", async () => {
    const [pirate, ship] = await pirateWithUnloadedShip();

    await pirate.setShipAttributes({
      id: (ship as unknown as { id: number }).id,
      _destroy: "1",
    });

    const target = (await pirate.ship) as unknown as { markedForDestruction(): boolean };
    expect(target.markedForDestruction()).toBe(true);
  });

  it("updates an unloaded existing record in place with update_only", async () => {
    const [pirate] = await pirateWithUnloadedShip();

    await pirate.setUpdateOnlyShipAttributes({ name: "Davy Jones Gold Dagger" });

    const target = (await pirate.updateOnlyShip) as unknown as { name: string };
    expect(target.name).toBe("Davy Jones Gold Dagger");
  });

  it("persists an unloaded existing record's update through the owner's save", async () => {
    const [pirate, ship] = await pirateWithUnloadedShip();
    const shipId = (ship as unknown as { id: number }).id;

    (pirate as unknown as { shipAttributes: unknown }).shipAttributes = {
      id: shipId,
      name: "Davy Jones Gold Dagger",
    };
    await pirate.save();

    const reloaded = (await Ship.find(shipId)) as unknown as { name: string };
    expect(reloaded.name).toBe("Davy Jones Gold Dagger");
  });
});
