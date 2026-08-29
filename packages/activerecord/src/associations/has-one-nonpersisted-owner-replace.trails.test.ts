import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import type { HasOneAssociation } from "./has-one-association.js";
import { fixtures } from "../test-fixtures.js";
import { DestructivePirate, Pirate } from "../test-helpers/models/pirate.js";
import { Ship } from "../test-helpers/models/ship.js";
import { Developer } from "../test-helpers/models/developer.js";
import { assertNoQueriesMatch } from "../testing/query-assertions.js";

describe("has_one replace on a non-persisted owner", () => {
  fixtures(["ships", "pirates", "developers"]);

  beforeAll(async () => {
    registerModel(Pirate);
    registerModel(DestructivePirate);
    registerModel(Ship);
    registerModel(Developer);
    await Pirate.loadSchema();
    await Ship.loadSchema();
  });

  it("removes the displaced target in memory without saving", async () => {
    const persistedPirate = await Pirate.create({ catchphrase: "Arrr" });
    const oldShip = await Ship.create({
      name: "old ship",
      pirate_id: Number(persistedPirate.id),
    });

    const newPirate = new Pirate({ id: Number(persistedPirate.id) });
    expect(newPirate.isPersisted()).toBe(false);

    const displaced = (await newPirate.association("ship").loadTarget()) as Ship;
    expect(Number(displaced.id)).toBe(Number(oldShip.id));
    expect(await displaced.association("pirate").loadTarget()).toBe(newPirate);

    const newShip = new Ship({ name: "new ship" });
    await assertNoQueriesMatch(/UPDATE |INSERT |DELETE /i, false, async () => {
      await (newPirate.association("ship") as HasOneAssociation).writer(newShip);
    });

    expect(displaced.readAttribute("pirate_id")).toBeNull();
    expect(displaced.association("pirate").target).toBeNull();
    expect(newPirate.association("ship").target).toBe(newShip);
    expect(newShip.isNewRecord()).toBe(true);

    const reloadedOld = await Ship.find(oldShip.id);
    expect(reloadedOld.readAttribute("pirate_id")).toBe(Number(persistedPirate.id));
  });

  it("saves a re-assigned same record that has unsaved changes", async () => {
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const ship = await Ship.create({ name: "old name", pirate_id: Number(pirate.id) });

    const loaded = (await pirate.association("ship").loadTarget()) as Ship;
    loaded.name = "new name";
    expect(loaded.hasChangesToSave).toBe(true);

    await (pirate.association("ship") as HasOneAssociation).writer(loaded);

    const reloaded = await Ship.find(ship.id);
    expect(reloaded.name).toBe("new name");
  });

  it("destroys the displaced target on a dependent destroy has_one", async () => {
    const persistedPirate = await DestructivePirate.create({ catchphrase: "Arrr" });
    const oldShip = await Ship.create({
      name: "doomed ship",
      pirate_id: Number(persistedPirate.id),
    });

    const newPirate = new DestructivePirate({ id: Number(persistedPirate.id) });
    expect(newPirate.isPersisted()).toBe(false);

    const displaced = (await newPirate.association("dependentShip").loadTarget()) as Ship;
    expect(Number(displaced.id)).toBe(Number(oldShip.id));

    const newShip = new Ship({ name: "new ship" });
    await (newPirate.association("dependentShip") as HasOneAssociation).writer(newShip);

    expect(displaced.isDestroyed()).toBe(true);
    expect(await Ship.findBy({ id: oldShip.id })).toBeNull();
    expect(newShip.isNewRecord()).toBe(true);
  });
});
