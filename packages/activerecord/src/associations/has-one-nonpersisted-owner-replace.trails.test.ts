/**
 * Rails' `HasOneAssociation#replace` (has_one_association.rb:59-85) does
 * `save &&= owner.persisted?` (:66) and then `transaction_if(save)` (:68) —
 * with `save` false the block still runs, so `remove_target!` (:69) fires for
 * the displaced record; only `record.save` (:75) is gated. `remove_target!`'s
 * else branch (:104-115) in turn gates the displaced record's *DB* save on
 * `target.persisted? && owner.persisted?` (:108), so a new-record owner gets
 * the in-memory nullify plus `remove_inverse_instance` and no writes at all.
 *
 * Its `:destroy` branch (:99-103) gates only on `target.persisted?` (:101) —
 * no `owner.persisted?` — so a `dependent: :destroy` has_one on a new-record
 * owner *does* issue a real DELETE, outside any transaction. That asymmetry
 * between the two branches is Rails', and both are pinned below.
 *
 * trails-specific: Rails reaches this through the sync `pirate.ship = x`
 * setter, which in JS cannot await; the awaitable `association(name).writer`
 * is the trails-only surface that exercises the same code path, so these
 * assertions have no verbatim Rails test to mirror.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import type { HasOneAssociation } from "./has-one-association.js";
import { fixtures } from "../test-helpers/fixtures.js";
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

    // A new-record owner carrying the same primary key: `foreign_key_present?`
    // is true, so `load_target` still materializes the displaced DB row.
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

    // The nullify is in-memory only: the DB row still points at the pirate.
    const reloadedOld = await Ship.find(oldShip.id);
    expect(reloadedOld.readAttribute("pirate_id")).toBe(Number(persistedPirate.id));
  });

  // Rails' :65 gate is `assigning_another_record || record.has_changes_to_save?`
  // — re-assigning the *same* record still saves it when it has unsaved
  // changes. `hasChangesToSave` is a getter, so the `typeof … === "function"`
  // guard this replaced made that half of the gate unreachable.
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

    // `remove_target!`'s :destroy branch gates only on `target.persisted?`
    // (:101), not on `owner.persisted?` — so unlike the nullify branch above,
    // a new-record owner really does destroy the displaced row.
    expect(displaced.isDestroyed()).toBe(true);
    expect(await Ship.findBy({ id: oldShip.id })).toBeNull();
    // The new record is still unsaved: `save` is false, so :75 never runs.
    expect(newShip.isNewRecord()).toBe(true);
  });
});
