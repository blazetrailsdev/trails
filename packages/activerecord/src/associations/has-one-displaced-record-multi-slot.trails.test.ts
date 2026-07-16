/**
 * Trails-only: a has_one owner can displace more than one persisted record
 * before its `save()` drains the queue. Rails has no queue — it removes each
 * displaced record inline inside `HasOneAssociation#replace`
 * (vendor/rails/activerecord/lib/active_record/associations/has_one_association.rb
 * :59-85) — so there is no Rails test for this; the defect is specific to
 * trails' deferral of the removal to save time (the JS property setter / sync
 * `build` cannot await). These tests assert every displaced record is nullified,
 * not just the last one.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { Pirate } from "../test-helpers/models/pirate.js";
import { Ship } from "../test-helpers/models/ship.js";
import { fixtures } from "../test-helpers/fixtures.js";

describe("HasOneDisplacedRecordMultiSlot", () => {
  fixtures(["ships", "pirates"]);

  beforeAll(() => {
    registerModel(Pirate);
    registerModel(Ship);
  });

  it("two persisted displacements via the writer path both get nullified", async () => {
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const a = await Ship.create({ name: "A", pirate_id: pirate.id });
    await pirate.loadHasOne("ship");
    const b = await Ship.create({ name: "B" });
    const c = await Ship.create({ name: "C" });

    pirate.ship = b; // displaces the persisted A
    pirate.ship = c; // displaces the persisted B; A must not be lost
    await pirate.save();

    expect((await Ship.find(a.id)).pirate_id).toBeNull();
    expect((await Ship.find(b.id)).pirate_id).toBeNull();
    expect((await Ship.find(c.id)).pirate_id).toBe(Number(pirate.id));
  });

  it("writer-then-build displacement both get nullified", async () => {
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const a = await Ship.create({ name: "A", pirate_id: pirate.id });
    await pirate.loadHasOne("ship");
    const b = await Ship.create({ name: "B" });

    pirate.ship = b; // displaces the persisted A (queueWrite)
    const shipAssoc = pirate.association("ship") as unknown as {
      build(attributes?: Record<string, unknown>): Ship | null;
    };
    const c = shipAssoc.build({ name: "C" }) as Ship; // displaces persisted B (setNewRecord)
    await pirate.save();

    expect((await Ship.find(a.id)).pirate_id).toBeNull();
    expect((await Ship.find(b.id)).pirate_id).toBeNull();
    expect(c.pirate_id).toBe(Number(pirate.id));
    expect(c.isPersisted()).toBe(true);
  });

  it("reverting to a displaced record cancels only that record's removal", async () => {
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const a = await Ship.create({ name: "A", pirate_id: pirate.id });
    await pirate.loadHasOne("ship");
    const b = await Ship.create({ name: "B" });

    pirate.ship = b; // displaces the persisted A
    pirate.ship = a; // reverts to A: cancels A's removal, displaces B
    await pirate.save();

    expect((await Ship.find(a.id)).pirate_id).toBe(Number(pirate.id));
    expect((await Ship.find(b.id)).pirate_id).toBeNull();
  });
});
