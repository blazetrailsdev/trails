/**
 * Rails' `HasOneAssociation#replace` (has_one_association.rb:64-84) does
 * `save &&= owner.persisted?` and then `transaction_if(save)` — with `save`
 * false the block still runs, so `remove_target!` fires for the displaced
 * record; only `record.save` is gated. `remove_target!`'s else branch in turn
 * gates the displaced record's *DB* save on `target.persisted? &&
 * owner.persisted?` (:108), so a new-record owner gets the in-memory nullify
 * plus `remove_inverse_instance` and no writes at all.
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
import { Pirate } from "../test-helpers/models/pirate.js";
import { Ship } from "../test-helpers/models/ship.js";
import { assertNoQueriesMatch } from "../testing/query-assertions.js";

describe("has_one replace on a non-persisted owner", () => {
  fixtures(["ships", "pirates"]);

  beforeAll(async () => {
    registerModel(Pirate);
    registerModel(Ship);
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
});
